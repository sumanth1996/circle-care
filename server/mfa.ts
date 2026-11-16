// Second sign-in step on the server (CC-200): authenticator-app codes (TOTP)
// and one-time recovery codes.
//
//   POST /api/auth/mfa/enrol/start    signed in, not yet enrolled → { secret, otpauthUri } (shown once)
//   POST /api/auth/mfa/enrol/confirm  { code } → turns it on, returns 10 recovery codes (shown once)
//   POST /api/auth/mfa/verify         { challenge, code | recoveryCode } → starts the session
//
// Guardians and caregivers must enrol before any /api/me, payment or vault
// route works (requireMfaReady). Elders may enrol; once they do, sign-in asks
// them for a code too. Passkeys are out of scope this round: they need a
// WebAuthn library and this story adds no packages.

import { Router, type RequestHandler, type Response } from "express";
import type { Role } from "../src/lib/validation";
import { audit } from "./audit";
import { requireUser, startSession, type Deps } from "./auth";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import type { Queryable } from "./db";
import { HttpError, route, str } from "./http";
import { deliver, messages } from "./mailer";
import { bucket, clearHits, hit, limit, retryAfterSeconds } from "./ratelimit";
import { base32Decode, hashRecoveryCode, newRecoveryCodes, newSecret, normaliseRecoveryCode, otpauthUri, verifyTotp } from "./totp";

/** Roles that must have a second step before using their account. */
export const MFA_REQUIRED: readonly Role[] = ["guardian", "caregiver"];
export const CHALLENGE_MINUTES = 5;
const PENDING_MINUTES = 15;
const MAX_WRONG = 5;
const WRONG_WINDOW_MINUTES = 15;

const failBucket = (userId: string) => bucket("mfa-fail", userId);

/**
 * Guardians and caregivers without a second step get 403 with a clear code on
 * account, payment and vault routes. Signed-out requests pass through to the
 * routers' own 401.
 */
export const requireMfaReady: RequestHandler = (req, _res, next) => {
  const u = req.user;
  if (u && MFA_REQUIRED.includes(u.role) && !u.mfaEnrolled) {
    return next(new HttpError(403, "Set up two-step sign-in to keep using your account.", undefined, undefined, "mfa_enrolment_required"));
  }
  next();
};

/** Creates the pending challenge a correct password gets for an enrolled account. No session is started. */
export async function createChallenge(q: Queryable, userId: string, now: Date): Promise<string> {
  const token = randomToken(32);
  // One challenge per account at a time: a new password sign-in replaces the old one.
  await q.query("DELETE FROM mfa_challenges WHERE user_id = $1", [userId]);
  await q.query("INSERT INTO mfa_challenges (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [sha256(token), userId, now, new Date(now.getTime() + CHALLENGE_MINUTES * 60_000)]);
  return token;
}

class WrongCode extends Error { constructor(public reason: "wrong" | "replayed") { super(reason); } }

export function mfaRouter(d: Deps): Router {
  const r = Router();
  const verifyLimit = limit(d, { name: "mfa-verify", by: "ip", windowMs: 600_000, max: 30 });

  /**
   * Counts an attempt before the code is checked, so parallel guesses can't
   * get more than 5 checked. A correct code clears the count.
   */
  async function reserveAttempt(res: Response, userId: string, now: Date) {
    const h = await hit(d.db, failBucket(userId), WRONG_WINDOW_MINUTES * 60_000, now);
    if (h.count > MAX_WRONG) {
      res.setHeader("Retry-After", String(retryAfterSeconds(h, now)));
      throw new HttpError(429, `Too many wrong codes. For your security, try again in ${WRONG_WINDOW_MINUTES} minutes.`, undefined, undefined, "mfa_locked");
    }
    return h;
  }

  /** A wrong code: audited by attempt number only (never the code); the 5th locks codes for 15 minutes and tells the owner. */
  async function wrongCode(res: Response, userId: string, email: string, attempt: { count: number; resetAt: Date }, now: Date, reason: "wrong" | "replayed", field: "code" | "recoveryCode" = "code"): Promise<never> {
    await audit(d.db, { action: "auth.mfa_failed", actor: null, subject: userId, detail: { attempt: attempt.count }, at: now });
    if (attempt.count >= MAX_WRONG) {
      await audit(d.db, { action: "mfa.locked", actor: null, subject: userId, detail: { attempts: attempt.count }, at: now });
      d.defer(() => deliver(d.db, d.mailer, messages.mfaLocked(email, userId, WRONG_WINDOW_MINUTES), now));
      res.setHeader("Retry-After", String(retryAfterSeconds(attempt, now)));
      throw new HttpError(429, `Too many wrong codes. For your security, try again in ${WRONG_WINDOW_MINUTES} minutes.`, undefined, undefined, "mfa_locked");
    }
    const msg = reason === "replayed" ? "That code was already used. Wait for the next code in your app."
      : field === "recoveryCode" ? "That recovery code didn't match, or it was already used." : "That code didn't match. Check your authenticator app and try again.";
    throw new HttpError(401, msg, field, undefined, "mfa_code_invalid");
  }

  /* ---------- Enrolment ---------- */

  r.post("/enrol/start", requireUser, limit(d, { name: "mfa-enrol", by: "user", windowMs: 3600_000, max: 10 }), route(async (req, res) => {
    const u = req.user!;
    if (u.mfaEnrolled) throw new HttpError(409, "Two-step sign-in is already on for this account.", undefined, undefined, "mfa_already_enrolled");
    const secret = newSecret();
    const now = d.now();
    await d.db.query("UPDATE users SET mfa_pending_secret_enc = $2, mfa_pending_at = $3 WHERE id = $1 AND mfa_enabled_at IS NULL", [u.id, encrypt(d.cfg, secret), now]);
    // The only time the secret leaves the server.
    res.json({ secret, otpauthUri: otpauthUri(secret, u.email), issuer: "Circle Care", account: u.email, digits: 6, period: 30 });
  }));

  r.post("/enrol/confirm", requireUser, route(async (req, res) => {
    const u = req.user!;
    const now = d.now();
    if (u.mfaEnrolled) throw new HttpError(409, "Two-step sign-in is already on for this account.", undefined, undefined, "mfa_already_enrolled");
    const row = (await d.db.query<{ mfa_pending_secret_enc: string | null; mfa_pending_at: Date | null }>(
      "SELECT mfa_pending_secret_enc, mfa_pending_at FROM users WHERE id = $1", [u.id])).rows[0];
    if (!row?.mfa_pending_secret_enc || !row.mfa_pending_at || now.getTime() - new Date(row.mfa_pending_at).getTime() > PENDING_MINUTES * 60_000) {
      throw new HttpError(400, "This setup timed out. Start again to get a new key.", undefined, undefined, "mfa_enrol_expired");
    }
    const attempt = await reserveAttempt(res, u.id, now);
    const secretEnc = row.mfa_pending_secret_enc;
    const counter = verifyTotp(base32Decode(decrypt(d.cfg, secretEnc).toString("utf8")), str(req.body?.code), now.getTime());
    if (counter === null) await wrongCode(res, u.id, u.email, attempt, now, "wrong");
    const codes = newRecoveryCodes();
    const ok = await d.db.tx(async (q) => {
      const done = await q.query(
        `UPDATE users SET mfa_secret_enc = mfa_pending_secret_enc, mfa_pending_secret_enc = NULL, mfa_pending_at = NULL,
                          mfa_enabled_at = $2, totp_last_counter = $3
          WHERE id = $1 AND mfa_enabled_at IS NULL AND mfa_pending_secret_enc = $4 RETURNING id`, [u.id, now, counter, secretEnc]);
      if (!done.rows.length) return false;
      await q.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [u.id]);
      for (const c of codes) await q.query("INSERT INTO mfa_recovery_codes (user_id, code_hash, created_at) VALUES ($1, $2, $3)", [u.id, hashRecoveryCode(d.cfg.hmacKey, c), now]);
      await audit(q, { action: "mfa.enrolled", actor: u.id, detail: { method: "authenticator_app", recoveryCodes: codes.length }, at: now });
      return true;
    });
    if (!ok) throw new HttpError(409, "Two-step sign-in was already turned on. Reload the page.", undefined, undefined, "mfa_already_enrolled");
    await clearHits(d.db, failBucket(u.id));
    // The only time the recovery codes leave the server.
    res.json({ ok: true, recoveryCodes: codes });
  }));

  /* ---------- The second step at sign-in ---------- */

  r.post("/verify", verifyLimit, route(async (req, res) => {
    const now = d.now();
    const challenge = str(req.body?.challenge);
    const code = str(req.body?.code);
    const recovery = normaliseRecoveryCode(str(req.body?.recoveryCode));
    const expired = new HttpError(401, "Your sign-in timed out. Please enter your password again.", undefined, undefined, "mfa_challenge_expired");
    if (!challenge || challenge.length > 128) throw expired;
    const challengeHash = sha256(challenge);
    const c = (await d.db.query<{ user_id: string; role: Role; email: string; mfa_secret_enc: string | null }>(
      `SELECT c.user_id, u.role, u.email, u.mfa_secret_enc FROM mfa_challenges c JOIN users u ON u.id = c.user_id
        WHERE c.token_hash = $1 AND c.expires_at > $2`, [challengeHash, now])).rows[0];
    if (!c || !c.mfa_secret_enc) throw expired;
    const field = req.body?.recoveryCode !== undefined ? "recoveryCode" : "code";
    if (!code && !recovery) throw new HttpError(400, field === "recoveryCode" ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app.", field);

    const attempt = await reserveAttempt(res, c.user_id, now);
    const counter = recovery ? null : verifyTotp(base32Decode(decrypt(d.cfg, c.mfa_secret_enc).toString("utf8")), code, now.getTime());
    if (!recovery && counter === null) await wrongCode(res, c.user_id, c.email, attempt, now, "wrong");

    let remaining = 0;
    try {
      await d.db.tx(async (q) => {
        // Single use: the challenge is deleted in the same transaction that starts the session.
        const used = await q.query("DELETE FROM mfa_challenges WHERE token_hash = $1 AND expires_at > $2 RETURNING user_id", [challengeHash, now]);
        if (!used.rows.length) throw expired;
        if (recovery) {
          const rc = await q.query("UPDATE mfa_recovery_codes SET used_at = $3 WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id", [c.user_id, hashRecoveryCode(d.cfg.hmacKey, recovery), now]);
          if (!rc.rows.length) throw new WrongCode("wrong");
          remaining = (await q.query<{ n: number }>("SELECT count(*)::int AS n FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL", [c.user_id])).rows[0].n;
          await audit(q, { action: "mfa.recovery_used", actor: c.user_id, detail: { remaining }, at: now });
        } else {
          // No replay: the same 30-second step (or an older one) is never accepted twice.
          const fresh = await q.query("UPDATE users SET totp_last_counter = $2 WHERE id = $1 AND (totp_last_counter IS NULL OR totp_last_counter < $2) RETURNING id", [c.user_id, counter]);
          if (!fresh.rows.length) throw new WrongCode("replayed");
        }
        await q.query("UPDATE users SET failed_attempts = 0, first_failed_at = NULL, locked_until = NULL WHERE id = $1", [c.user_id]);
        await audit(q, { action: "auth.signin", actor: c.user_id, detail: { secondStep: recovery ? "recovery_code" : "authenticator_app" }, at: now });
        await startSession(d, q, res, c.user_id);
      });
    } catch (e) {
      if (e instanceof WrongCode) await wrongCode(res, c.user_id, c.email, attempt, now, e.reason, recovery ? "recoveryCode" : "code");
      throw e;
    }
    await clearHits(d.db, failBucket(c.user_id));
    res.json({ user: { id: c.user_id, role: c.role }, ...(recovery ? { recoveryCodesLeft: remaining } : {}) });
  }));

  return r;
}
