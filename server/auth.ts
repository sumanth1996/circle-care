// Accounts, sign-in and sessions (CC-172 – CC-175).

import { Router, type Request, type RequestHandler, type Response } from "express";
import { normEmail, normName, normPhone, passwordRules, ROLES, type Role } from "../src/lib/validation";
import { audit } from "./audit";
import type { Config } from "./config";
import { dummyHash, hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import type { Db, Queryable } from "./db";
import { HttpError, rateLimit, readCookie, route, str } from "./http";

export const PERSONA_TABLE: Record<Role, "elders" | "caregivers" | "guardians"> = { elder: "elders", caregiver: "caregivers", guardian: "guardians" };
export const COOKIE = "cc_session";
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export interface Deps { cfg: Config; db: Db; now: () => Date }
export interface AuthedUser { id: string; role: Role; email: string }

declare module "express-serve-static-core" {
  interface Request { user?: AuthedUser }
}

function setCookie(res: Response, cfg: Config, token: string) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${cfg.sessionAbsoluteHours * 3600}`];
  if (cfg.isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearCookie(res: Response, cfg: Config) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.isProd ? "; Secure" : ""}`);
}

async function startSession(d: Deps, q: Queryable, res: Response, userId: string) {
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
      const { rows } = await d.db.query<{ user_id: string; role: Role; email: string; last_seen_at: Date; expires_at: Date }>(
        "SELECT s.user_id, s.last_seen_at, s.expires_at, u.role, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1",
        [sha256(token)],
      );
      const s = rows[0];
      const idleLimit = now.getTime() - d.cfg.sessionIdleMinutes * 60_000;
      if (s && new Date(s.expires_at).getTime() > now.getTime() && new Date(s.last_seen_at).getTime() > idleLimit) {
        req.user = { id: s.user_id, role: s.role, email: s.email };
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

export function authRouter(d: Deps): Router {
  const r = Router();
  // Per-network limits. The automated test suite runs hundreds of sign-ups from one address, so it opts out.
  const off: RequestHandler = (_req, _res, next) => next();
  const signupLimit = d.cfg.env === "test" ? off : rateLimit({ windowMs: 3600_000, max: 10, message: "Too many sign-ups from this network. Please try again later." });
  const signinLimit = d.cfg.env === "test" ? off : rateLimit({ windowMs: 600_000, max: 30 });

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
    const { rows } = await d.db.query<{ id: string; password_hash: string; role: Role; failed_attempts: number; first_failed_at: Date | null; locked_until: Date | null }>(
      "SELECT id, password_hash, role, failed_attempts, first_failed_at, locked_until FROM users WHERE email = $1", [email]);
    const u = rows[0];
    const wrong = new HttpError(401, "Email or password is incorrect.");
    if (!u) { await verifyPassword(password, await dummyHash()); throw wrong; }
    if (u.locked_until && new Date(u.locked_until).getTime() > now.getTime()) {
      await verifyPassword(password, u.password_hash); // same timing either way
      throw new HttpError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    if (!(await verifyPassword(password, u.password_hash))) {
      const windowStart = now.getTime() - LOCK_MINUTES * 60_000;
      const fresh = !u.first_failed_at || new Date(u.first_failed_at).getTime() < windowStart || (u.locked_until && new Date(u.locked_until).getTime() <= now.getTime());
      const attempts = fresh ? 1 : u.failed_attempts + 1;
      const lock = attempts >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
      await d.db.query("UPDATE users SET failed_attempts = $2, first_failed_at = $3, locked_until = $4 WHERE id = $1",
        [u.id, attempts, fresh ? now : u.first_failed_at, lock]);
      await audit(d.db, { action: lock ? "auth.locked" : "auth.failed", actor: null, subject: u.id, detail: { attempts }, at: now });
      if (lock) throw new HttpError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
      throw wrong;
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

  return r;
}
