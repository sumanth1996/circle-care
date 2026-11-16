// Getting back in after losing the authenticator app and every recovery code (CC-235).
//
//   POST /api/auth/mfa/recovery/request   { challenge }  correct password → a confirm link is emailed (30 min, once)
//   POST /api/auth/mfa/recovery/confirm   { token }      the emailed link → the wait starts (72 hours)
//   POST /api/auth/mfa/recovery/cancel    { token } from the "wait started" email, or signed in with no token
//   GET  /api/auth/mfa/recovery           signed in → the waiting reset, if any (shown on every device)
//   POST /api/auth/mfa/recovery/complete  { challenge }  after the wait, with the password again → reset
//
// Identity is checked three ways (the PO's call, safer default picked on Nov 16, 2026 PT):
// the password, control of the account's email, and a waiting period the owner can
// cancel from the email or from any device where they are still signed in. Changing or
// resetting the password cancels a waiting reset too. Nothing on the account changes
// until the reset is finished. A family admin vouching and a support-assisted reset
// were not picked: server accounts aren't linked to a circle yet, and support would
// need people. No new vendor: email goes through the existing Mailer, so in production
// this works once an email provider is connected (the same launch task as password reset).

import { Router } from "express";
import type { Role } from "../src/lib/validation";
import { audit } from "./audit";
import { requireUser, startSession, type Deps } from "./auth";
import { randomToken, sha256 } from "./crypto";
import type { Queryable } from "./db";
import { HttpError, route, str } from "./http";
import { deliver, messages } from "./mailer";
import { bucket, clearHits, hit, limit } from "./ratelimit";

export const CONFIRM_MINUTES = 30;
/** At most this many reset requests (and so emails) a day per account; extra ones send nothing. */
export const REQUESTS_PER_DAY = 3;

export const REQUEST_REPLY = "If two-step sign-in can be reset for this account, we've emailed it a link. Open it within 30 minutes to start the wait.";

/** "Thu, Nov 19, 2026, 1:30 PM UTC": emails can't know the reader's time zone, so they say UTC. */
export function emailTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d) + " UTC";
}

type OpenRequest = { id: string; confirmed_at: Date | null; ready_at: Date | null };

/** The waiting (confirmed, not cancelled or finished) reset for an account, if any. */
async function waiting(q: Queryable, userId: string): Promise<OpenRequest | undefined> {
  return (await q.query<OpenRequest>(
    `SELECT id, confirmed_at, ready_at FROM mfa_recovery_requests
      WHERE user_id = $1 AND confirmed_at IS NOT NULL AND cancelled_at IS NULL AND completed_at IS NULL
      ORDER BY confirmed_at DESC LIMIT 1`, [userId])).rows[0];
}

/** What sign-in and My account show about a waiting reset. */
export async function recoveryState(q: Queryable, userId: string, now: Date): Promise<{ readyAt: string; ready: boolean } | null> {
  const w = await waiting(q, userId);
  if (!w?.ready_at) return null;
  const readyAt = new Date(w.ready_at);
  return { readyAt: readyAt.toISOString(), ready: readyAt.getTime() <= now.getTime() };
}

/**
 * Stops every open reset for an account (unconfirmed links too). Used by cancel, and by
 * password change and reset (CC-201): whoever asked knew the old password. Returns how
 * many waiting resets were stopped.
 */
export async function cancelOpenRecovery(q: Queryable, userId: string, now: Date, by: "email_link" | "signed_in" | "password"): Promise<number> {
  const { rows } = await q.query<{ confirmed_at: Date | null }>(
    `UPDATE mfa_recovery_requests SET cancelled_at = $2
      WHERE user_id = $1 AND cancelled_at IS NULL AND completed_at IS NULL RETURNING confirmed_at`, [userId, now]);
  const stopped = rows.filter((r) => r.confirmed_at).length;
  if (stopped) await audit(q, { action: "mfa.reset_cancelled", actor: by === "email_link" ? null : userId, subject: userId, detail: { by }, at: now });
  return stopped;
}

/** Looks up a live sign-in challenge (the password was right in the last 5 minutes). */
async function challengeUser(q: Queryable, challenge: string, now: Date) {
  if (!challenge || challenge.length > 128) return undefined;
  return (await q.query<{ user_id: string; role: Role; email: string; mfa_enabled_at: Date | null }>(
    `SELECT c.user_id, u.role, u.email, u.mfa_enabled_at FROM mfa_challenges c JOIN users u ON u.id = c.user_id
      WHERE c.token_hash = $1 AND c.expires_at > $2`, [sha256(challenge), now])).rows[0];
}

const expired = () => new HttpError(401, "Your sign-in timed out. Please enter your password again.", undefined, undefined, "mfa_challenge_expired");
const badLink = () => new HttpError(400, "This link has expired or was already used.", undefined, undefined, "recovery_link_invalid");

export function mfaRecoveryRouter(d: Deps): Router {
  const r = Router();
  const ipLimit = limit(d, { name: "mfa-recovery", by: "ip", windowMs: 3600_000, max: 20 });
  const waitMs = () => d.cfg.mfaRecoveryWaitHours * 3600_000;

  /* ---------- 1. Ask: needs the password (a live challenge) ---------- */
  r.post("/request", ipLimit, route(async (req, res) => {
    const now = d.now();
    const c = await challengeUser(d.db, str(req.body?.challenge), now);
    if (!c || !c.mfa_enabled_at) throw expired();
    // A reset that is already waiting is shown, not started again.
    const state = await recoveryState(d.db, c.user_id, now);
    if (state) { res.json({ ok: true, waiting: state }); return; }
    res.json({ ok: true, message: REQUEST_REPLY });
    d.defer(async () => {
      // At most 3 a day per account, so the form can't flood the owner's inbox. Extra ones send nothing.
      const h = await hit(d.db, bucket("mfa-reset-email", c.user_id), 24 * 3600_000, now);
      if (h.count > REQUESTS_PER_DAY) return;
      const token = randomToken(32);
      await d.db.tx(async (q) => {
        // Only the newest link works.
        await q.query("DELETE FROM mfa_recovery_requests WHERE user_id = $1 AND confirmed_at IS NULL", [c.user_id]);
        await q.query("INSERT INTO mfa_recovery_requests (user_id, confirm_hash, created_at, confirm_expires_at) VALUES ($1, $2, $3, $4)",
          [c.user_id, sha256(token), now, new Date(now.getTime() + CONFIRM_MINUTES * 60_000)]);
        await audit(q, { action: "mfa.reset_requested", actor: null, subject: c.user_id, at: now });
      });
      const link = `${d.cfg.publicUrl}/#/app/recover-two-step?token=${encodeURIComponent(token)}`;
      await deliver(d.db, d.mailer, messages.mfaResetConfirm(c.email, link, c.user_id, d.cfg.mfaRecoveryWaitHours), now);
    });
  }));

  /* ---------- 2. Confirm from the email: the wait starts ---------- */
  r.post("/confirm", ipLimit, route(async (req, res) => {
    const token = str(req.body?.token);
    if (!token || token.length > 128) throw badLink();
    const now = d.now();
    const readyAt = new Date(now.getTime() + waitMs());
    const cancelToken = randomToken(32);
    const row = await d.db.tx(async (q) => {
      // Single use: only one request can set confirmed_at.
      const u = (await q.query<{ id: string; user_id: string }>(
        `UPDATE mfa_recovery_requests SET confirmed_at = $2, ready_at = $3, cancel_hash = $4
          WHERE confirm_hash = $1 AND confirmed_at IS NULL AND cancelled_at IS NULL AND confirm_expires_at > $2 RETURNING id, user_id`,
        [sha256(token), now, readyAt, sha256(cancelToken)])).rows[0];
      if (!u) return null;
      const user = (await q.query<{ email: string; mfa_enabled_at: Date | null }>("SELECT email, mfa_enabled_at FROM users WHERE id = $1", [u.user_id])).rows[0];
      if (!user?.mfa_enabled_at) { await q.query("UPDATE mfa_recovery_requests SET cancelled_at = $2 WHERE id = $1", [u.id, now]); return null; }
      await audit(q, { action: "mfa.reset_wait_started", actor: null, subject: u.user_id, detail: { waitHours: d.cfg.mfaRecoveryWaitHours }, at: now });
      return { userId: u.user_id, email: user.email };
    });
    if (!row) throw badLink();
    const cancelLink = `${d.cfg.publicUrl}/#/app/recover-two-step/cancel?token=${encodeURIComponent(cancelToken)}`;
    d.defer(() => deliver(d.db, d.mailer, messages.mfaResetStarted(row.email, row.userId, emailTime(readyAt), cancelLink), now));
    res.json({ ok: true, readyAt: readyAt.toISOString(), waitHours: d.cfg.mfaRecoveryWaitHours });
  }));

  /* ---------- Cancel: from the "wait started" email, or signed in ---------- */
  r.post("/cancel", ipLimit, route(async (req, res) => {
    const now = d.now();
    const token = str(req.body?.token);
    let target: { userId: string; email: string; by: "email_link" | "signed_in" } | undefined;
    if (token) {
      if (token.length > 128) throw badLink();
      const row = (await d.db.query<{ user_id: string; email: string }>(
        `SELECT r.user_id, u.email FROM mfa_recovery_requests r JOIN users u ON u.id = r.user_id
          WHERE r.cancel_hash = $1 AND r.cancelled_at IS NULL AND r.completed_at IS NULL`, [sha256(token)])).rows[0];
      if (!row) throw badLink();
      target = { userId: row.user_id, email: row.email, by: "email_link" };
    } else if (req.user) {
      target = { userId: req.user.id, email: req.user.email, by: "signed_in" };
    } else {
      throw new HttpError(401, "Please sign in.", undefined, undefined, "signed_out");
    }
    const t = target;
    const stopped = await d.db.tx((q) => cancelOpenRecovery(q, t.userId, now, t.by));
    if (stopped) d.defer(() => deliver(d.db, d.mailer, messages.mfaResetCancelled(t.email, t.userId), now));
    res.json({ ok: true, cancelled: stopped > 0 });
  }));

  /* ---------- Every signed-in device can see a waiting reset ---------- */
  r.get("/", requireUser, route(async (req, res) => {
    res.json({ waiting: await recoveryState(d.db, req.user!.id, d.now()) });
  }));

  /* ---------- 3. Finish after the wait, with the password again ---------- */
  r.post("/complete", ipLimit, route(async (req, res) => {
    const now = d.now();
    const challenge = str(req.body?.challenge);
    const c = await challengeUser(d.db, challenge, now);
    if (!c || !c.mfa_enabled_at) throw expired();
    const ended = await d.db.tx(async (q) => {
      const w = await waiting(q, c.user_id);
      if (!w?.ready_at) throw new HttpError(409, "There's no confirmed reset for this account. Ask for one from the sign-in code step.", undefined, undefined, "recovery_not_started");
      if (new Date(w.ready_at).getTime() > now.getTime()) {
        throw new HttpError(409, `The reset can be finished from ${emailTime(new Date(w.ready_at))}.`, undefined, undefined, "recovery_waiting");
      }
      // Single use: the challenge goes in the same transaction that resets the account.
      const used = await q.query("DELETE FROM mfa_challenges WHERE token_hash = $1 AND expires_at > $2 RETURNING user_id", [sha256(challenge), now]);
      if (!used.rows.length) throw expired();
      const done = await q.query("UPDATE mfa_recovery_requests SET completed_at = $2 WHERE id = $1 AND completed_at IS NULL AND cancelled_at IS NULL RETURNING id", [w.id, now]);
      if (!done.rows.length) throw expired();
      await q.query(
        `UPDATE users SET mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, mfa_pending_at = NULL, mfa_enabled_at = NULL,
                          totp_last_counter = NULL, failed_attempts = 0, first_failed_at = NULL, locked_until = NULL, updated_at = $2
          WHERE id = $1`, [c.user_id, now]);
      await q.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [c.user_id]);
      await q.query("DELETE FROM mfa_challenges WHERE user_id = $1", [c.user_id]);
      const n = (await q.query("DELETE FROM sessions WHERE user_id = $1 RETURNING token_hash", [c.user_id])).rows.length;
      await q.query("DELETE FROM mfa_recovery_requests WHERE user_id = $1 AND confirmed_at IS NULL", [c.user_id]);
      await audit(q, { action: "mfa.reset_completed", actor: c.user_id, detail: { sessionsEnded: n }, at: now });
      // A fresh session that can only set up two-step sign-in again (guardians and caregivers
      // get mfa_enrolment_required everywhere else). It counts as a fresh password sign-in.
      await startSession(d, q, res, c.user_id);
      return n;
    });
    await clearHits(d.db, bucket("mfa-fail", c.user_id));
    d.defer(() => deliver(d.db, d.mailer, messages.mfaResetDone(c.email, c.user_id), now));
    res.json({ user: { id: c.user_id, role: c.role }, mustSetUp: true, sessionsEnded: ended });
  }));

  return r;
}
