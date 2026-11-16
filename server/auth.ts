// Accounts, sign-in and sessions (CC-172 – CC-175), and ending sessions when
// an account may be at risk (CC-201): sign out everywhere, password change,
// forgotten password, and an email to the owner when sign-in is locked.

import { Router, type Request, type RequestHandler, type Response } from "express";
import { normEmail, normName, normPhone, passwordRules, ROLES, type Role } from "../src/lib/validation";
import { audit } from "./audit";
import type { Config } from "./config";
import { dummyHash, hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import type { Db, Queryable } from "./db";
import { HttpError, readCookie, route, str } from "./http";
import { deliver, messages, type Mailer } from "./mailer";
import { createChallenge, CHALLENGE_MINUTES } from "./mfa";
import { bucket, hit, limit } from "./ratelimit";

export const PERSONA_TABLE: Record<Role, "elders" | "caregivers" | "guardians"> = { elder: "elders", caregiver: "caregivers", guardian: "guardians" };
export const COOKIE = "cc_session";
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

const RESET_MINUTES = 30;
const RESETS_PER_HOUR = 3;

export interface Deps {
  cfg: Config;
  db: Db;
  now: () => Date;
  mailer: Mailer;
  /**
   * Runs a task after the response has gone. Used for work whose duration must
   * not show in the response time (a reset request for a real account vs an
   * unknown one) and for email, which must never hold up or fail a request.
   */
  defer: (task: () => Promise<unknown>) => void;
}
export interface AuthedUser { id: string; role: Role; email: string; /** CC-200: an authenticator app is set up. */ mfaEnrolled: boolean }

declare module "express-serve-static-core" {
  interface Request { user?: AuthedUser }
}

function setCookie(res: Response, cfg: Config, token: string) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${cfg.sessionAbsoluteHours * 3600}`];
  if (cfg.isProd || cfg.env === "staging") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
export function clearCookie(res: Response, cfg: Config) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.isProd || cfg.env === "staging" ? "; Secure" : ""}`);
}

export async function startSession(d: Deps, q: Queryable, res: Response, userId: string) {
  const token = randomToken();
  const now = d.now();
  const expires = new Date(now.getTime() + d.cfg.sessionAbsoluteHours * 3600_000);
  await q.query("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES ($1, $2, $3, $3, $4)", [sha256(token), userId, now, expires]);
  setCookie(res, d.cfg, token);
}

/** Loads the signed-in user, enforcing idle (30 min) and absolute (12 h) expiry. */
export function sessionMiddleware(d: Deps): RequestHandler {
  return (req, res, next) => { loadSession(d, req, res).then(() => next(), next); };
}

async function loadSession(d: Deps, req: Request, res: Response) {
  {
    const token = readCookie(req, COOKIE);
    if (token) {
      const now = d.now();
      const { rows } = await d.db.query<{ user_id: string; role: Role; email: string; last_seen_at: Date; expires_at: Date; mfa_enabled_at: Date | null }>(
        "SELECT s.user_id, s.last_seen_at, s.expires_at, u.role, u.email, u.mfa_enabled_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1",
        [sha256(token)],
      );
      const s = rows[0];
      const idleLimit = now.getTime() - d.cfg.sessionIdleMinutes * 60_000;
      if (s && new Date(s.expires_at).getTime() > now.getTime() && new Date(s.last_seen_at).getTime() > idleLimit) {
        req.user = { id: s.user_id, role: s.role, email: s.email, mfaEnrolled: !!s.mfa_enabled_at };
        if (now.getTime() - new Date(s.last_seen_at).getTime() > 30_000) await d.db.query("UPDATE sessions SET last_seen_at = $1 WHERE token_hash = $2", [now, sha256(token)]);
      } else {
        if (s) await d.db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
        clearCookie(res, d.cfg);
        res.locals.sessionExpired = true;
      }
    }
  }
}

export const requireUser: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: res.locals.sessionExpired ? "For your security we signed you out. Please sign in again." : "Please sign in.", code: res.locals.sessionExpired ? "session_expired" : "signed_out" });
    return;
  }
  next();
};

/**
 * Counts a failed password atomically (CC-175). Parallel guesses can't race
 * past the limit: the increment happens in one UPDATE, and the lock is set
 * as soon as the stored count reaches 5. Returns true if the account is now locked.
 */
export async function recordFailure(d: Deps, userId: string, now: Date): Promise<boolean> {
  const fresh = `(first_failed_at IS NULL OR first_failed_at < $2::timestamptz - interval '${LOCK_MINUTES} minutes' OR (locked_until IS NOT NULL AND locked_until <= $2::timestamptz))`;
  const { rows } = await d.db.query<{ failed_attempts: number; email: string }>(
    `UPDATE users SET failed_attempts = CASE WHEN ${fresh} THEN 1 ELSE failed_attempts + 1 END,
                      first_failed_at = CASE WHEN ${fresh} THEN $2::timestamptz ELSE first_failed_at END,
                      locked_until    = CASE WHEN ${fresh} THEN NULL ELSE locked_until END
      WHERE id = $1 RETURNING failed_attempts, email`, [userId, now]);
  const attempts = rows[0]?.failed_attempts ?? 0;
  let locked = false;
  if (attempts >= LOCK_AFTER) {
    const r = await d.db.query(`UPDATE users SET locked_until = $2::timestamptz + interval '${LOCK_MINUTES} minutes' WHERE id = $1 AND (locked_until IS NULL OR locked_until <= $2::timestamptz) RETURNING id`, [userId, now]);
    locked = true;
    if (r.rows.length) {
      await audit(d.db, { action: "auth.locked", actor: null, subject: userId, detail: { attempts }, at: now });
      // CC-201: the owner hears about it. Existing sessions are left alone, so a
      // stranger guessing the password can't sign the real owner out.
      const email = rows[0].email;
      d.defer(() => deliver(d.db, d.mailer, messages.accountLocked(email, userId, LOCK_MINUTES), now));
    }
  } else {
    await audit(d.db, { action: "auth.failed", actor: null, subject: userId, detail: { attempts }, at: now });
  }
  return locked;
}

export const RESET_REPLY = "If an account uses that email, we've sent it a link to reset the password. The link works once, for 30 minutes.";

/** Runs after the reply to a reset request: look up the account, make a token, email the link. */
async function startReset(d: Deps, email: string, now: Date) {
  const u = (await d.db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])).rows[0];
  if (!u) return;
  // At most 3 reset emails an hour per account, so the form can't be used to flood someone's inbox.
  // Extra requests get the same reply and simply send nothing.
  const h = await hit(d.db, bucket("reset-email", u.id), 3600_000, now);
  if (h.count > RESETS_PER_HOUR) return;
  const token = randomToken(32);
  await d.db.tx(async (q) => {
    // Only the newest link works.
    await q.query("DELETE FROM password_resets WHERE user_id = $1", [u.id]);
    await q.query("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
      [sha256(token), u.id, now, new Date(now.getTime() + RESET_MINUTES * 60_000)]);
    await audit(q, { action: "password.reset_requested", actor: null, subject: u.id, at: now });
  });
  const link = `${d.cfg.publicUrl}/#/app/reset-password?token=${encodeURIComponent(token)}`;
  await deliver(d.db, d.mailer, messages.passwordReset(email, link, u.id), now);
}

export function authRouter(d: Deps): Router {
  const r = Router();
  // Per-address limits in the shared store (CC-204). The test environment turns them off unless RATE_LIMITS=on.
  const signupLimit = limit(d, { name: "signup", by: "ip", windowMs: 3600_000, max: 10, message: "Too many sign-ups from this network. Please try again later." });
  const signinLimit = limit(d, { name: "signin", by: "ip", windowMs: 600_000, max: 30 });

  r.post("/signup", signupLimit, route(async (req, res) => {
    const b = req.body ?? {};
    const role = str(b.role) as Role;
    if (!ROLES.includes(role)) throw new HttpError(400, "Choose whether you're the elder, a caregiver or the legal guardian.", "role");
    const fields: Record<string, string> = {};
    const first = normName(str(b.firstName)), last = normName(str(b.lastName)), phone = normPhone(str(b.phone)), email = normEmail(str(b.email));
    if (first.error) fields.firstName = first.error;
    if (last.error) fields.lastName = last.error;
    if (phone.error) fields.phone = phone.error;
    if (email.error) fields.email = email.error;
    const password = str(b.password);
    const failed = passwordRules(password, email.value ?? "").find((x) => !x.ok);
    if (failed) fields.password = failed.label;
    if (b.acceptTerms !== true) fields.acceptTerms = "Please agree to the Terms and Privacy Notice to continue";
    const firstField = Object.keys(fields)[0];
    if (firstField) throw new HttpError(400, fields[firstField], firstField, fields);

    const hash = await hashPassword(password);
    const now = d.now();
    const user = await d.db.tx(async (q) => {
      const exists = await q.query("SELECT 1 FROM users WHERE email = $1", [email.value]);
      if (exists.rows.length) return null;
      const { rows } = await q.query<{ id: string }>("INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id", [email.value, hash, role, now]);
      const id = rows[0].id;
      await q.query(`INSERT INTO ${PERSONA_TABLE[role]} (user_id, first_name, last_name, phone, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)`, [id, first.value, last.value, phone.value, email.value, now]);
      await audit(q, { action: "account.created", actor: id, detail: { role }, at: now });
      await startSession(d, q, res, id);
      return { id };
    });
    if (!user) throw new HttpError(409, "We couldn't create an account with these details. If you already have one, sign in.", "email");
    res.status(201).json({ user: { id: user.id, role } });
  }));

  r.post("/signin", signinLimit, route(async (req, res) => {
    const email = normEmail(str(req.body?.email)).value ?? "";
    const password = str(req.body?.password);
    const now = d.now();
    const { rows } = await d.db.query<{ id: string; password_hash: string; role: Role; failed_attempts: number; first_failed_at: Date | null; locked_until: Date | null; mfa_enabled_at: Date | null }>(
      "SELECT id, password_hash, role, failed_attempts, first_failed_at, locked_until, mfa_enabled_at FROM users WHERE email = $1", [email]);
    const u = rows[0];
    const wrong = new HttpError(401, "Email or password is incorrect.");
    if (!u) { await verifyPassword(password, await dummyHash()); throw wrong; }
    if (u.locked_until && new Date(u.locked_until).getTime() > now.getTime()) {
      await verifyPassword(password, u.password_hash); // same timing either way
      throw new HttpError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    if (!(await verifyPassword(password, u.password_hash))) {
      const locked = await recordFailure(d, u.id, now);
      if (locked) throw new HttpError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
      throw wrong;
    }
    if (u.mfa_enabled_at) {
      // CC-200: the password was right, but no session yet. The browser gets a short-lived,
      // single-use challenge to send with the code from the authenticator app.
      const challenge = await d.db.tx(async (q) => {
        await q.query("UPDATE users SET failed_attempts = 0, first_failed_at = NULL, locked_until = NULL WHERE id = $1", [u.id]);
        await audit(q, { action: "auth.challenge", actor: u.id, at: now });
        return createChallenge(q, u.id, now);
      });
      res.json({ mfaRequired: true, challenge, expiresInSeconds: CHALLENGE_MINUTES * 60 });
      return;
    }
    await d.db.tx(async (q) => {
      await q.query("UPDATE users SET failed_attempts = 0, first_failed_at = NULL, locked_until = NULL WHERE id = $1", [u.id]);
      await audit(q, { action: "auth.signin", actor: u.id, at: now });
      await startSession(d, q, res, u.id);
    });
    res.json({ user: { id: u.id, role: u.role } });
  }));

  r.post("/signout", route(async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await d.db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
    if (req.user) await audit(d.db, { action: "auth.signout", actor: req.user.id, at: d.now() });
    clearCookie(res, d.cfg);
    res.json({ ok: true });
  }));

  /* ---------- CC-201: end every session when an account may be at risk ---------- */

  r.post("/signout-everywhere", requireUser, route(async (req, res) => {
    const u = req.user!;
    const now = d.now();
    const ended = await d.db.tx(async (q) => {
      const n = (await q.query("DELETE FROM sessions WHERE user_id = $1 RETURNING token_hash", [u.id])).rows.length;
      await q.query("DELETE FROM mfa_challenges WHERE user_id = $1", [u.id]);
      await audit(q, { action: "auth.signout_all", actor: u.id, detail: { sessions: n }, at: now });
      return n;
    });
    clearCookie(res, d.cfg);
    res.json({ ok: true, sessionsEnded: ended });
  }));

  const accountLimit = limit(d, { name: "account", by: "user", windowMs: 3600_000, max: 10, auditOnExceed: true, message: "Too many attempts. Please wait a while and try again." });

  r.post("/password", requireUser, accountLimit, route(async (req, res) => {
    const u = req.user!;
    const current = str(req.body?.currentPassword);
    const next = str(req.body?.newPassword);
    if (!current) throw new HttpError(400, "Enter your current password.", "currentPassword");
    const row = (await d.db.query<{ password_hash: string; email: string }>("SELECT password_hash, email FROM users WHERE id = $1", [u.id])).rows[0];
    if (!(await verifyPassword(current, row.password_hash))) {
      // Wrong guesses count toward the same lockout as sign-in; a lock here ends every session (as for SSN changes, review M2).
      if (await recordFailure(d, u.id, d.now())) {
        await d.db.query("DELETE FROM sessions WHERE user_id = $1", [u.id]);
        clearCookie(res, d.cfg);
        throw new HttpError(429, `Too many attempts. For your security we signed you out. Try again in ${LOCK_MINUTES} minutes.`);
      }
      throw new HttpError(403, "That isn't your current password.", "currentPassword");
    }
    const failed = passwordRules(next, row.email).find((x) => !x.ok);
    if (failed) throw new HttpError(400, failed.label, "newPassword");
    if (next === current) throw new HttpError(400, "Choose a password that's different from your current one.", "newPassword");
    const hash = await hashPassword(next);
    const now = d.now();
    const keep = sha256(readCookie(req, COOKIE) ?? "");
    const ended = await d.db.tx(async (q) => {
      await q.query("UPDATE users SET password_hash = $2, failed_attempts = 0, first_failed_at = NULL, locked_until = NULL, updated_at = $3 WHERE id = $1", [u.id, hash, now]);
      // Every other session ends; this one stays so the person isn't thrown out mid-task.
      const n = (await q.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING token_hash", [u.id, keep])).rows.length;
      await q.query("DELETE FROM password_resets WHERE user_id = $1", [u.id]);
      await q.query("DELETE FROM mfa_challenges WHERE user_id = $1", [u.id]);
      await audit(q, { action: "password.changed", actor: u.id, detail: { otherSessionsEnded: n }, at: now });
      return n;
    });
    d.defer(() => deliver(d.db, d.mailer, messages.passwordChanged(row.email, u.id, "changed"), now));
    res.json({ ok: true, otherSessionsEnded: ended });
  }));

  // Forgotten password. The reply is the same whether or not the email has an
  // account, and it goes out before any account lookup, so the response time
  // doesn't tell either. The lookup, token and email happen afterwards.
  r.post("/password-reset/request", limit(d, { name: "reset", by: "ip", windowMs: 3600_000, max: 10 }), route(async (req, res) => {
    const email = normEmail(str(req.body?.email));
    if (email.error) throw new HttpError(400, email.error === "Required" ? "Enter your email" : email.error, "email");
    const now = d.now();
    res.json({ ok: true, message: RESET_REPLY });
    d.defer(() => startReset(d, email.value!, now));
  }));

  r.post("/password-reset/confirm", limit(d, { name: "reset-confirm", by: "ip", windowMs: 600_000, max: 20 }), route(async (req, res) => {
    const token = str(req.body?.token);
    const password = str(req.body?.password);
    const now = d.now();
    const invalid = new HttpError(400, "This reset link has expired or was already used. Ask for a new one.", undefined, undefined, "reset_invalid");
    if (!token || token.length > 128) throw invalid;
    const tokenHash = sha256(token);
    const row = (await d.db.query<{ user_id: string; email: string }>(
      "SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > $2",
      [tokenHash, now])).rows[0];
    if (!row) throw invalid;
    const failed = passwordRules(password, row.email).find((x) => !x.ok);
    if (failed) throw new HttpError(400, failed.label, "password");
    const hash = await hashPassword(password);
    const ended = await d.db.tx(async (q) => {
      // Single use: only one request can flip used_at, even if two arrive together.
      const used = await q.query("UPDATE password_resets SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id", [tokenHash, now]);
      if (!used.rows.length) return null;
      // A reset proves control of the email, so it also lifts a sign-in lock.
      await q.query("UPDATE users SET password_hash = $2, failed_attempts = 0, first_failed_at = NULL, locked_until = NULL, updated_at = $3 WHERE id = $1", [row.user_id, hash, now]);
      const n = (await q.query("DELETE FROM sessions WHERE user_id = $1 RETURNING token_hash", [row.user_id])).rows.length;
      await q.query("DELETE FROM password_resets WHERE user_id = $1 AND token_hash <> $2", [row.user_id, tokenHash]);
      await q.query("DELETE FROM mfa_challenges WHERE user_id = $1", [row.user_id]);
      await audit(q, { action: "password.reset", actor: row.user_id, detail: { sessionsEnded: n }, at: now });
      return n;
    });
    if (ended === null) throw invalid;
    clearCookie(res, d.cfg);
    d.defer(() => deliver(d.db, d.mailer, messages.passwordChanged(row.email, row.user_id, "reset"), now));
    res.json({ ok: true });
  }));

  return r;
}
