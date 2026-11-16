// CC-201 End every session when an account may be at risk: sign out everywhere,
// password change, forgotten password, lock notice, and the cleanup job.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { RESET_REPLY } from "../auth";
import { CLEANUP_EVERY_MS, cleanupExpired, scheduleCleanup } from "../cleanup";
import { loadConfig } from "../config";
import { sha256 } from "../crypto";
import { createMailer, NoProviderMailer, OutboxMailer, type Mailer, type MailMessage } from "../mailer";
import { harness, signedUp, type Harness } from "./helpers";

const SLOW = { timeout: 30_000 };
let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => { await h.db.close(); });

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
const prodEnv = { APP_ENV: "production", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_abc" };

const sessionsOf = async (id: string) => (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [id])).rows[0].n;
const auditOf = async (id: string, action: string) => (await h.db.query<{ detail: Record<string, unknown> }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = $2 ORDER BY id", [id, action])).rows;
const tokenFrom = (m: MailMessage | undefined) => decodeURIComponent(/token=([^\s]+)/.exec(m?.text ?? "")?.[1] ?? "");

async function signIn(email: string, password: string) {
  const ag = h.agent();
  const r = await ag.post("/api/auth/signin", { email, password });
  return { ag, r };
}

describe("CC-201 sign out everywhere", () => {
  it("deletes every session for the account and audits it", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const a2 = (await signIn(e.body.email, e.body.password)).ag;
    const a3 = (await signIn(e.body.email, e.body.password)).ag;
    const other = await signedUp(h, "elder");
    expect(await sessionsOf(e.id)).toBe(3);
    const r = await a2.post("/api/auth/signout-everywhere");
    expect(r.status).toBe(200);
    expect(r.body.sessionsEnded).toBe(3);
    expect(String(r.headers["set-cookie"])).toContain("Max-Age=0");
    for (const ag of [e.ag, a2, a3]) expect((await ag.get("/api/me")).status).toBe(401);
    expect(await sessionsOf(e.id)).toBe(0);
    expect((await other.ag.get("/api/me")).status).toBe(200); // other accounts untouched
    expect((await auditOf(e.id, "auth.signout_all"))[0].detail).toEqual({ sessions: 3 });
  });
  it("needs a session", async () => {
    expect((await h.agent().post("/api/auth/signout-everywhere")).status).toBe(401);
  });
});

describe("CC-201 change password", () => {
  it("checks the current password, applies the password rules, keeps this session and ends the others", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const elsewhere = (await signIn(e.body.email, e.body.password)).ag;
    const wrong = await e.ag.post("/api/auth/password", { currentPassword: "not-my-password-1", newPassword: "lantern-river-morning-7" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.field).toBe("currentPassword");
    expect((await h.db.query<{ failed_attempts: number }>("SELECT failed_attempts FROM users WHERE id = $1", [e.id])).rows[0].failed_attempts).toBe(1);
    for (const [pw, msg] of [["short", "At least 12 characters"], ["password1234", "Isn't a common password"], [`${e.body.email.split("@")[0]}-and-more`, "Doesn't contain your email name"], [e.body.password, "Choose a password that's different from your current one."]]) {
      const r = await e.ag.post("/api/auth/password", { currentPassword: e.body.password, newPassword: pw });
      expect(r.status).toBe(400);
      expect(r.body.field).toBe("newPassword");
      expect(r.body.error).toBe(msg);
    }
    const ok = await e.ag.post("/api/auth/password", { currentPassword: e.body.password, newPassword: "lantern-river-morning-7" });
    expect(ok.status).toBe(200);
    expect(ok.body.otherSessionsEnded).toBe(1);
    expect((await e.ag.get("/api/me")).status).toBe(200);
    expect((await elsewhere.get("/api/me")).status).toBe(401);
    expect((await signIn(e.body.email, e.body.password)).r.status).toBe(401);
    expect((await signIn(e.body.email, "lantern-river-morning-7")).r.status).toBe(200);
    const ev = await auditOf(e.id, "password.changed");
    expect(ev.map((x) => x.detail)).toEqual([{ otherSessionsEnded: 1 }]);
    expect(JSON.stringify(ev)).not.toContain("lantern");
    await h.settle();
    expect(h.mail.last(e.body.email, "password_changed")?.subject).toBe("Your Circle Care password was changed");
  });
  it("5 wrong current passwords lock sign-in and end every session", SLOW, async () => {
    const e = await signedUp(h, "elder");
    for (let i = 0; i < 4; i++) expect((await e.ag.post("/api/auth/password", { currentPassword: "wrong-password-xx", newPassword: "lantern-river-morning-7" })).status).toBe(403);
    const fifth = await e.ag.post("/api/auth/password", { currentPassword: "wrong-password-xx", newPassword: "lantern-river-morning-7" });
    expect(fifth.status).toBe(429);
    expect(await sessionsOf(e.id)).toBe(0);
    h.clock.t += 16 * 60_000;
  });
});

describe("CC-201 forgotten password", () => {
  it("gives the same reply whether or not the email has an account, and sets no cookie", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const known = await h.agent().post("/api/auth/password-reset/request", { email: e.body.email.toUpperCase() });
    const unknown = await h.agent().post("/api/auth/password-reset/request", { email: "no-such-person@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual({ ok: true, message: RESET_REPLY });
    expect(unknown.body).toEqual(known.body);
    expect(known.headers["set-cookie"]).toBeUndefined();
    expect(unknown.headers["set-cookie"]).toBeUndefined();
    await h.settle();
    expect(h.mail.last("no-such-person@example.com")).toBeUndefined();
    const m = h.mail.last(e.body.email, "password_reset")!;
    expect(m.text).toContain(`${h.cfg.publicUrl}/#/app/reset-password?token=`);
    const token = tokenFrom(m);
    expect(token.length).toBeGreaterThanOrEqual(43);
    // Stored hashed, with a 30-minute expiry.
    const row = (await h.db.query<{ token_hash: string; created_at: Date; expires_at: Date }>("SELECT token_hash, created_at, expires_at FROM password_resets WHERE user_id = $1", [e.id])).rows;
    expect(row.length).toBe(1);
    expect(row[0].token_hash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(new Date(row[0].expires_at).getTime() - new Date(row[0].created_at).getTime()).toBe(30 * 60_000);
    expect((await auditOf(e.id, "password.reset_requested")).length).toBe(1);
  });

  it("replies before the account lookup and email, so a slow mailer can't show which emails exist", SLOW, async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sent: MailMessage[] = [];
    const slow: Mailer = { configured: true, send: async (m) => { await gate; sent.push(m); } };
    const app = createApp({ cfg: h.cfg, db: h.db, now: () => new Date(h.clock.t), mailer: slow });
    const e = await signedUp(h, "elder");
    const r = await request(app).post("/api/auth/password-reset/request").set("X-Requested-With", "circle-care").send({ email: e.body.email });
    expect(r.status).toBe(200);
    expect(sent.length).toBe(0); // the reply went out while the email was still waiting
    release();
    await app.locals.settle();
    expect(sent.length).toBe(1);
  });

  it("refuses a malformed email with a field error", async () => {
    const r = await h.agent().post("/api/auth/password-reset/request", { email: "not-an-email" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("email");
  });

  it("the link sets a new password once, ends every session, lifts a lock and audits", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const elsewhere = (await signIn(e.body.email, e.body.password)).ag;
    for (let i = 0; i < 5; i++) await h.agent().post("/api/auth/signin", { email: e.body.email, password: "wrong-password-xx" });
    expect((await signIn(e.body.email, e.body.password)).r.status).toBe(429);
    await h.agent().post("/api/auth/password-reset/request", { email: e.body.email });
    await h.settle();
    const token = tokenFrom(h.mail.last(e.body.email, "password_reset"));
    const weak = await h.agent().post("/api/auth/password-reset/confirm", { token, password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.field).toBe("password");
    const ok = await h.agent().post("/api/auth/password-reset/confirm", { token, password: "copper-kettle-evening-3" });
    expect(ok.status).toBe(200);
    expect(await sessionsOf(e.id)).toBe(0);
    expect((await e.ag.get("/api/me")).status).toBe(401);
    expect((await elsewhere.get("/api/me")).status).toBe(401);
    expect((await signIn(e.body.email, e.body.password)).r.status).toBe(401);
    expect((await signIn(e.body.email, "copper-kettle-evening-3")).r.status).toBe(200);
    const again = await h.agent().post("/api/auth/password-reset/confirm", { token, password: "another-long-password-9" });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("reset_invalid");
    expect((await auditOf(e.id, "password.reset")).map((x) => x.detail)).toEqual([{ sessionsEnded: 2 }]);
    await h.settle();
    expect(h.mail.last(e.body.email, "password_changed")?.subject).toBe("Your Circle Care password was reset");
  });

  it("only one of two simultaneous uses of a link succeeds", SLOW, async () => {
    const e = await signedUp(h, "elder");
    await h.agent().post("/api/auth/password-reset/request", { email: e.body.email });
    await h.settle();
    const token = tokenFrom(h.mail.last(e.body.email, "password_reset"));
    const rs = await Promise.all(["parallel-password-one-1", "parallel-password-two-2"].map((password) => h.agent().post("/api/auth/password-reset/confirm", { token, password })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("a link expires after 30 minutes, and only the newest link works", SLOW, async () => {
    const e = await signedUp(h, "elder");
    await h.agent().post("/api/auth/password-reset/request", { email: e.body.email });
    await h.settle();
    const first = tokenFrom(h.mail.last(e.body.email, "password_reset"));
    await h.agent().post("/api/auth/password-reset/request", { email: e.body.email });
    await h.settle();
    const second = tokenFrom(h.mail.last(e.body.email, "password_reset"));
    expect(second).not.toBe(first);
    expect((await h.agent().post("/api/auth/password-reset/confirm", { token: first, password: "copper-kettle-evening-3" })).status).toBe(400);
    h.clock.t += 31 * 60_000;
    const late = await h.agent().post("/api/auth/password-reset/confirm", { token: second, password: "copper-kettle-evening-3" });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe("This reset link has expired or was already used. Ask for a new one.");
  });

  it("sends at most 3 reset emails an hour to one account, with the same reply every time", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const before = h.mail.messages.filter((m) => m.to === e.body.email).length;
    for (let i = 0; i < 5; i++) expect((await h.agent().post("/api/auth/password-reset/request", { email: e.body.email })).body.message).toBe(RESET_REPLY);
    await h.settle();
    expect(h.mail.messages.filter((m) => m.to === e.body.email && m.kind === "password_reset").length - before).toBe(3);
  });

  it("rejects made-up tokens", async () => {
    for (const token of ["", "x", "a".repeat(300)]) expect((await h.agent().post("/api/auth/password-reset/confirm", { token, password: "copper-kettle-evening-3" })).status).toBe(400);
  });

  it("in production with no email provider: same reply, nothing sent, delivery recorded as not configured, token never logged", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const prod = createApp({ cfg: loadConfig(prodEnv), db: h.db, now: () => new Date(h.clock.t) });
    const logs: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }));
    try {
      const r = await request(prod).post("/api/auth/password-reset/request").set("X-Requested-With", "circle-care").send({ email: e.body.email });
      expect(r.body).toEqual({ ok: true, message: RESET_REPLY });
      await prod.locals.settle();
    } finally { spies.forEach((s) => s.mockRestore()); }
    expect((await auditOf(e.id, "email.undeliverable")).map((x) => x.detail)).toEqual([{ kind: "password_reset", reason: "no_provider" }]);
    expect(logs.join("\n")).toContain("no email provider is configured");
    const stored = (await h.db.query<{ token_hash: string }>("SELECT token_hash FROM password_resets WHERE user_id = $1", [e.id])).rows;
    expect(stored.length).toBe(1);
    expect(logs.join("\n")).not.toContain(e.body.email);
    expect(logs.join("\n")).not.toMatch(/token=/);
  });

  it("chooses the mailer by environment, and production warns that email is a launch task", () => {
    expect(createMailer(loadConfig({ APP_ENV: "test" }))).toBeInstanceOf(OutboxMailer);
    expect(createMailer(loadConfig(prodEnv))).toBeInstanceOf(NoProviderMailer);
    expect(loadConfig(prodEnv).warnings.join(" ")).toMatch(/No email provider is configured/);
    expect(loadConfig({ APP_ENV: "test" }).warnings).toEqual([]);
    expect(() => loadConfig({ ...prodEnv, PUBLIC_URL: "http://care.example.com" })).toThrow(/https/);
    expect(() => loadConfig({ APP_ENV: "test", PUBLIC_URL: "https://care.example.com/app" })).toThrow(/PUBLIC_URL/);
    expect(loadConfig({ APP_ENV: "test", PUBLIC_URL: "https://care.example.com/" }).publicUrl).toBe("https://care.example.com");
  });
});

describe("CC-201 locked account", () => {
  it("emails the owner when sign-in is locked, and existing sessions stay", SLOW, async () => {
    const e = await signedUp(h, "elder");
    for (let i = 0; i < 5; i++) await h.agent().post("/api/auth/signin", { email: e.body.email, password: "wrong-password-xx" });
    await h.settle();
    const m = h.mail.last(e.body.email, "account_locked");
    expect(m?.subject).toBe("We paused sign-in to your Circle Care account");
    expect(m?.text).not.toContain("wrong-password-xx");
    expect((await e.ag.get("/api/me")).status).toBe(200);
    // One email per lock, not one per refused attempt.
    for (let i = 0; i < 3; i++) await h.agent().post("/api/auth/signin", { email: e.body.email, password: "wrong-password-xx" });
    await h.settle();
    expect(h.mail.messages.filter((x) => x.to === e.body.email && x.kind === "account_locked").length).toBe(1);
    h.clock.t += 16 * 60_000;
  });
});

describe("CC-201 cleanup of expired rows", () => {
  it("deletes expired and idle sessions, used or expired reset links and old rate-limit buckets, and keeps live ones", SLOW, async () => {
    const c = await harness();
    const now = new Date(c.clock.t);
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    const later = (min: number) => new Date(now.getTime() + min * 60_000);
    const u = await signedUp(c, "elder");
    await c.db.query("DELETE FROM sessions");
    const ins = (t: string, created: Date, seen: Date, exp: Date) => c.db.query("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES ($1, $2, $3, $4, $5)", [t, u.id, created, seen, exp]);
    await ins("live", ago(5), ago(1), later(600));
    await ins("idle", ago(60), ago(45), later(600));
    await ins("old", ago(800), ago(1), ago(5));
    const reset = (t: string, exp: Date, used: Date | null) => c.db.query("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, used_at) VALUES ($1, $2, $3, $4, $5)", [t, u.id, ago(10), exp, used]);
    await reset("r-live", later(20), null);
    await reset("r-expired", ago(1), null);
    await reset("r-used", later(20), ago(2));
    await c.db.query("INSERT INTO rate_limits (key, reset_at, count) VALUES ('a', $1, 3), ('b', $2, 3)", [ago(1), later(5)]);

    const r = await cleanupExpired(c.db, c.cfg, now);
    expect(r).toMatchObject({ sessions: 2, passwordResets: 2, rateLimits: 1 });
    expect((await c.db.query<{ token_hash: string }>("SELECT token_hash FROM sessions")).rows.map((x) => x.token_hash)).toEqual(["live"]);
    expect((await c.db.query<{ token_hash: string }>("SELECT token_hash FROM password_resets")).rows.map((x) => x.token_hash)).toEqual(["r-live"]);
    expect((await c.db.query<{ key: string }>("SELECT key FROM rate_limits")).rows.map((x) => x.key)).toEqual(["b"]);
    // Running it again finds nothing more.
    expect(Object.values(await cleanupExpired(c.db, c.cfg, now)).every((n) => n === 0)).toBe(true);
    await c.db.close();
  });

  it("sweeps at start-up, then once a day on a timer that doesn't keep the process alive", SLOW, async () => {
    const c = await harness();
    const start = c.clock.t;
    await c.db.query("INSERT INTO rate_limits (key, reset_at, count) VALUES ('old', $1, 1), ('later', $2, 1)", [new Date(start - 60_000), new Date(start + 3600_000)]);
    const spy = vi.spyOn(globalThis, "setInterval");
    const lines: string[] = [];
    const s = scheduleCleanup(c.db, c.cfg, { now: () => new Date(c.clock.t), log: (l) => lines.push(l) });
    try {
      // At start-up: the expired bucket goes, the live one stays.
      expect(await s.first).toMatchObject({ rateLimits: 1 });
      expect(lines).toEqual(["[cleanup] removed 0 sessions, 0 passwordResets, 0 mfaChallenges, 0 mfaPendingSetups, 1 rateLimits"]);
      expect((await c.db.query<{ key: string }>("SELECT key FROM rate_limits")).rows.map((x) => x.key)).toEqual(["later"]);
      // Then daily, unref'd.
      const i = spy.mock.calls.findIndex(([, ms]) => ms === CLEANUP_EVERY_MS);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(CLEANUP_EVERY_MS).toBe(24 * 3600_000);
      const timer = spy.mock.results[i].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
      // A day later the timer's sweep removes what has expired since.
      c.clock.t = start + CLEANUP_EVERY_MS;
      (spy.mock.calls[i][0] as () => void)();
      await vi.waitFor(async () => expect((await c.db.query("SELECT key FROM rate_limits")).rows).toEqual([]));
    } finally {
      s.stop();
      spy.mockRestore();
      await c.db.close();
    }
  });
});
