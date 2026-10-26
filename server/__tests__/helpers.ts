import request from "supertest";
import { createApp } from "../app";
import { loadConfig, type Config } from "../config";
import { openDb, type Db } from "../db";
import { migrate } from "../migrate";

export const SSN_PATTERN = /(^|[^0-9a-z])\d{9}([^0-9a-z]|$)|\b\d{3}-\d{2}-\d{4}\b/i;
/** Every response body seen in the suite, scanned for full SSNs (CC-181). */
export const seenBodies: string[] = [];

export interface Harness { cfg: Config; db: Db; app: ReturnType<typeof createApp>; clock: { t: number }; agent: () => Agent }
export type Agent = ReturnType<typeof makeAgent>;

export async function harness(env: Record<string, string> = {}): Promise<Harness> {
  const cfg = loadConfig({ APP_ENV: "test", ...env });
  const db = await openDb(cfg, { memory: true });
  await migrate(db);
  const clock = { t: Date.parse("2026-10-26T15:00:00Z") };
  const app = createApp({ cfg, db, now: () => new Date(clock.t) });
  return { cfg, db, app, clock, agent: () => makeAgent(app) };
}

function makeAgent(app: ReturnType<typeof createApp>) {
  const a = request.agent(app);
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

export async function signedUp(h: Harness, role: "elder" | "caregiver" | "guardian", over: Record<string, unknown> = {}) {
  const ag = h.agent();
  const body = person(role, over);
  const r = await ag.post("/api/auth/signup", body);
  if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${r.text}`);
  return { ag, body, id: r.body.user.id as string };
}

/** Guardian with SSN + bank account (a complete profile). */
export async function completeGuardian(h: Harness) {
  const g = await signedUp(h, "guardian");
  await g.ag.put("/api/me/ssn", { ssn: "900-45-" + String(1000 + n).slice(-4) });
  const v = await g.ag.post("/vault/v1/bank-accounts", { bankName: "Bank of America", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking" });
  await g.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token });
  return g;
}
