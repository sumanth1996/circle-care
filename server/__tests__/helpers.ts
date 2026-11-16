import request from "supertest";
import { createApp } from "../app";
import { loadConfig, type Config } from "../config";
import { openDb, type Db } from "../db";
import { OutboxMailer } from "../mailer";
import { migrate } from "../migrate";
import { base32Decode, counterAt, hotp } from "../totp";

export const SSN_PATTERN = /(^|[^0-9a-z])\d{9}([^0-9a-z]|$)|\b\d{3}-\d{2}-\d{4}\b/i;
/** Every response body seen in the suite, scanned for full SSNs (CC-181). */
export const seenBodies: string[] = [];

export interface Harness {
  cfg: Config; db: Db; app: ReturnType<typeof createApp>; clock: { t: number }; agent: (ip?: string) => Agent;
  /** Emails the server "sent" (CC-201). */
  mail: OutboxMailer;
  /** Waits for work the server does after replying (emails, reset tokens). */
  settle: () => Promise<void>;
}
export type Agent = ReturnType<typeof makeAgent>;

export async function harness(env: Record<string, string> = {}): Promise<Harness> {
  const cfg = loadConfig({ APP_ENV: "test", ...env });
  const db = await openDb(cfg, { memory: true });
  await migrate(db);
  const clock = { t: Date.parse("2026-10-26T15:00:00Z") };
  const mail = new OutboxMailer();
  const app = createApp({ cfg, db, now: () => new Date(clock.t), mailer: mail });
  return { cfg, db, app, clock, mail, settle: () => app.locals.settle(), agent: (ip?: string) => makeAgent(app, ip) };
}

/**
 * A browser-like client. `ip` is sent as the proxy's X-Forwarded-For entry, so with
 * rate limits on (RATE_LIMITS=on) each agent can come from its own address.
 */
export function makeAgent(app: ReturnType<typeof createApp>, ip?: string) {
  const a = request.agent(app);
  if (ip) a.set("X-Forwarded-For", ip);
  const record = <T extends { text?: string; body?: unknown }>(r: T) => { seenBodies.push(r.text ?? JSON.stringify(r.body ?? "")); return r; };
  return {
    get: (url: string) => a.get(url).then(record),
    post: (url: string, body?: object) => a.post(url).set("X-Requested-With", "circle-care").send(body ?? {}).then(record),
    patch: (url: string, body: object) => a.patch(url).set("X-Requested-With", "circle-care").send(body).then(record),
    put: (url: string, body: object) => a.put(url).set("X-Requested-With", "circle-care").send(body).then(record),
    putRaw: (url: string, buf: Buffer, type: string) => a.put(url).set("X-Requested-With", "circle-care").set("Content-Type", type).send(buf).then(record),
    del: (url: string) => a.delete(url).set("X-Requested-With", "circle-care").then(record),
    raw: a,
  };
}

let n = 0;
export const person = (role: "elder" | "caregiver" | "guardian", over: Record<string, unknown> = {}) => ({
  role,
  firstName: role === "elder" ? "Margaret" : role === "caregiver" ? "Ana" : "Sarah",
  lastName: role === "elder" ? "Lee" : role === "caregiver" ? "Reyes" : "Lee",
  phone: "(415) 555-01" + String(10 + (n % 80)),
  email: `${role}${++n}@example.com`,
  password: "correct-horse-battery-staple",
  acceptTerms: true,
  ...over,
});

/* ---------- CC-200 second step ---------- */

const lastStep = new Map<string, number>();

/**
 * A valid authenticator code for `secret` that hasn't been used yet. The server refuses
 * a step it has already accepted, and accepts one step either side of now, so this picks
 * the oldest unused step in the window and moves the test clock on 30 s when none is left.
 */
export function nextCode(h: Harness, secret: string): string {
  const last = lastStep.get(secret) ?? -Infinity;
  let now = counterAt(h.clock.t);
  let step = Math.max(now - 1, last + 1);
  if (step > now + 1) { h.clock.t += (step - now - 1) * 30_000; now = counterAt(h.clock.t); step = Math.max(now - 1, last + 1); }
  lastStep.set(secret, step);
  return hotp(base32Decode(secret), step);
}

/** Turns on the authenticator step for a signed-in agent. Returns the secret and the recovery codes. */
export async function enrol(h: Harness, ag: Agent) {
  const start = await ag.post("/api/auth/mfa/enrol/start");
  if (start.status !== 200) throw new Error(`enrol start failed: ${start.status} ${start.text}`);
  const secret = start.body.secret as string;
  const confirm = await ag.post("/api/auth/mfa/enrol/confirm", { code: nextCode(h, secret) });
  if (confirm.status !== 200) throw new Error(`enrol confirm failed: ${confirm.status} ${confirm.text}`);
  return { secret, recoveryCodes: confirm.body.recoveryCodes as string[] };
}

/** Password, then (for an enrolled account) the code: returns an agent with a session. */
export async function signIn(h: Harness, email: string, password: string, secret?: string) {
  const ag = h.agent();
  const r = await ag.post("/api/auth/signin", { email, password });
  if (r.status !== 200 || !r.body.mfaRequired) return { ag, r };
  if (!secret) throw new Error("this account needs a code");
  const v = await ag.post("/api/auth/mfa/verify", { challenge: r.body.challenge, code: nextCode(h, secret) });
  return { ag, r: v };
}

/**
 * Signs up a new account. Guardians and caregivers must set up the second step before
 * their account routes work (CC-200), so by default they are enrolled here too.
 */
export async function signedUp(h: Harness, role: "elder" | "caregiver" | "guardian", over: Record<string, unknown> = {}, opts: { enrol?: boolean } = {}) {
  // With limits on, each new account signs up from its own address so the per-address sign-up limit isn't hit.
  const ag = h.agent(h.cfg.rateLimits ? `198.51.100.${(n % 250) + 1}` : undefined);
  const body = person(role, over);
  const r = await ag.post("/api/auth/signup", body);
  if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${r.text}`);
  const mfa = (opts.enrol ?? role !== "elder") ? await enrol(h, ag) : undefined;
  return { ag, body, id: r.body.user.id as string, secret: mfa?.secret, recoveryCodes: mfa?.recoveryCodes };
}

/** Guardian with SSN + bank account (a complete profile). */
export async function completeGuardian(h: Harness) {
  const g = await signedUp(h, "guardian");
  await g.ag.put("/api/me/ssn", { ssn: "900-45-" + String(1000 + n).slice(-4) });
  const v = await g.ag.post("/vault/v1/bank-accounts", { bankName: "Bank of America", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking" });
  await g.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token });
  return g;
}
