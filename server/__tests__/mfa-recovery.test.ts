// CC-235 Getting back in after losing the authenticator and every recovery code.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { cleanupExpired } from "../cleanup";
import { loadConfig } from "../config";
import type { MailMessage } from "../mailer";
import { emailTime, REQUEST_REPLY } from "../mfaRecovery";
import { enrol, harness, nextCode, signedUp, type Harness } from "./helpers";

const SLOW = { timeout: 30_000 };
const HOUR = 3600_000;
const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
const prodEnv = { APP_ENV: "production", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_abc" };

let h: Harness;
beforeAll(async () => { h = await harness({ DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 }); });
afterAll(async () => { await h.db.close(); });

const auditOf = async (id: string, action: string) => (await h.db.query<{ detail: Record<string, unknown> }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = $2 ORDER BY id", [id, action])).rows;
const sessionsOf = async (id: string) => (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [id])).rows[0].n;
const tokenFrom = (m: MailMessage | undefined) => decodeURIComponent(/token=([^\s]+)/.exec(m?.text ?? "")?.[1] ?? "");
const mfaRow = async (id: string) => (await h.db.query<{ mfa_secret_enc: string | null; mfa_enabled_at: Date | null; codes: number }>(
  "SELECT mfa_secret_enc, mfa_enabled_at, (SELECT count(*)::int FROM mfa_recovery_codes WHERE user_id = $1) AS codes FROM users WHERE id = $1", [id])).rows[0];

/** The password step: returns a fresh challenge (and whatever the sign-in reply said about a waiting reset). */
async function password(email: string, pw: string) {
  const ag = h.agent();
  const r = await ag.post("/api/auth/signin", { email, password: pw });
  expect(r.body.mfaRequired).toBe(true);
  return { ag, challenge: r.body.challenge as string, body: r.body };
}

/** Asks for a reset and opens the emailed confirm link. Returns the cancel link's token. */
async function startWait(email: string, pw: string) {
  const { ag, challenge } = await password(email, pw);
  const r = await ag.post("/api/auth/mfa/recovery/request", { challenge });
  expect(r.status).toBe(200);
  await h.settle();
  const confirm = await h.agent().post("/api/auth/mfa/recovery/confirm", { token: tokenFrom(h.mail.last(email, "mfa_reset_confirm")) });
  expect(confirm.status).toBe(200);
  await h.settle();
  return { confirm, cancelToken: tokenFrom(h.mail.last(email, "mfa_reset_started")) };
}

describe("CC-235 asking for a reset", () => {
  it("needs the password: a live sign-in challenge, not an expired or made-up one", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    for (const challenge of ["", "x", "a".repeat(300)]) {
      const r = await h.agent().post("/api/auth/mfa/recovery/request", { challenge });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe("mfa_challenge_expired");
    }
    const { ag, challenge } = await password(g.body.email, g.body.password);
    h.clock.t += 6 * 60_000; // challenges last 5 minutes
    expect((await ag.post("/api/auth/mfa/recovery/request", { challenge })).body.code).toBe("mfa_challenge_expired");
    await h.settle();
    expect(h.mail.last(g.body.email, "mfa_reset_confirm")).toBeUndefined();
  });

  it("emails a confirm link and changes nothing yet: the authenticator and recovery codes still work", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const { ag, challenge } = await password(g.body.email, g.body.password);
    const r = await ag.post("/api/auth/mfa/recovery/request", { challenge });
    expect(r.body).toEqual({ ok: true, message: REQUEST_REPLY });
    expect(r.headers["set-cookie"]).toBeUndefined();
    await h.settle();
    const mail = h.mail.last(g.body.email, "mfa_reset_confirm")!;
    expect(mail.subject).toBe("Confirm resetting two-step sign-in for Circle Care");
    expect(mail.text).toMatch(/#\/app\/recover-two-step\?token=/);
    expect(mail.text).toMatch(/72-hour wait/);
    expect((await auditOf(g.id, "mfa.reset_requested")).length).toBe(1);
    expect((await mfaRow(g.id)).codes).toBe(10);
    // The same challenge still works with a code, and a recovery code still works.
    expect((await ag.post("/api/auth/mfa/verify", { challenge, code: nextCode(h, g.secret!) })).status).toBe(200);
    const again = await password(g.body.email, g.body.password);
    expect((await again.ag.post("/api/auth/mfa/verify", { challenge: again.challenge, recoveryCode: g.recoveryCodes![0] })).status).toBe(200);
  });

  it("sends at most 3 links a day to one account, with the same reply every time", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    for (let i = 0; i < 5; i++) {
      const { ag, challenge } = await password(g.body.email, g.body.password);
      expect((await ag.post("/api/auth/mfa/recovery/request", { challenge })).body).toEqual({ ok: true, message: REQUEST_REPLY });
    }
    await h.settle();
    expect(h.mail.messages.filter((m) => m.to === g.body.email && m.kind === "mfa_reset_confirm").length).toBe(3);
    expect((await auditOf(g.id, "mfa.reset_requested")).length).toBe(3);
  });
});

describe("CC-235 the confirm link", () => {
  it("starts a 72-hour wait, emails how to cancel, and every signed-in device sees it", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const start = h.clock.t;
    const { confirm, cancelToken } = await startWait(g.body.email, g.body.password);
    expect(confirm.body).toEqual({ ok: true, readyAt: new Date(start + 72 * HOUR).toISOString(), waitHours: 72 });
    const started = h.mail.last(g.body.email, "mfa_reset_started")!;
    expect(started.text).toContain(emailTime(new Date(start + 72 * HOUR)));
    expect(started.text).toMatch(/#\/app\/recover-two-step\/cancel\?token=/);
    expect(cancelToken.length).toBeGreaterThan(20);
    expect((await auditOf(g.id, "mfa.reset_wait_started")).map((x) => x.detail)).toEqual([{ waitHours: 72 }]);
    // The device where she's still signed in shows it.
    expect((await g.ag.get("/api/auth/mfa/recovery")).body).toEqual({ waiting: { readyAt: new Date(start + 72 * HOUR).toISOString(), ready: false } });
    // Sign-in shows it on the code step; asking again just shows the same wait.
    const p = await password(g.body.email, g.body.password);
    expect(p.body.recovery).toEqual({ readyAt: new Date(start + 72 * HOUR).toISOString(), ready: false });
    expect((await p.ag.post("/api/auth/mfa/recovery/request", { challenge: p.challenge })).body.waiting.ready).toBe(false);
    // Nothing changed yet.
    expect((await mfaRow(g.id)).mfa_enabled_at).not.toBeNull();
  });

  it("works once, for 30 minutes, and only the newest link works", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const ask = async () => { const p = await password(g.body.email, g.body.password); await p.ag.post("/api/auth/mfa/recovery/request", { challenge: p.challenge }); await h.settle(); return tokenFrom(h.mail.last(g.body.email, "mfa_reset_confirm")); };
    const first = await ask();
    h.clock.t += 31 * 60_000;
    expect((await h.agent().post("/api/auth/mfa/recovery/confirm", { token: first })).body.code).toBe("recovery_link_invalid");
    const second = await ask();
    const third = await ask();
    expect(second).not.toBe(third);
    expect((await h.agent().post("/api/auth/mfa/recovery/confirm", { token: second })).status).toBe(400);
    const both = await Promise.all([1, 2].map(() => h.agent().post("/api/auth/mfa/recovery/confirm", { token: third })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    for (const token of ["", "x", "a".repeat(300)]) expect((await h.agent().post("/api/auth/mfa/recovery/confirm", { token })).status).toBe(400);
  });
});

describe("CC-235 cancelling a waiting reset", () => {
  it("from the email link, without signing in", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const { cancelToken } = await startWait(g.body.email, g.body.password);
    const r = await h.agent().post("/api/auth/mfa/recovery/cancel", { token: cancelToken });
    expect(r.body).toEqual({ ok: true, cancelled: true });
    await h.settle();
    expect(h.mail.last(g.body.email, "mfa_reset_cancelled")?.subject).toBe("The reset of two-step sign-in was cancelled");
    expect((await auditOf(g.id, "mfa.reset_cancelled")).map((x) => x.detail)).toEqual([{ by: "email_link" }]);
    expect((await h.agent().post("/api/auth/mfa/recovery/cancel", { token: cancelToken })).body.code).toBe("recovery_link_invalid");
    h.clock.t += 73 * HOUR;
    const p = await password(g.body.email, g.body.password);
    expect(p.body.recovery).toBeUndefined();
    expect((await p.ag.post("/api/auth/mfa/recovery/complete", { challenge: p.challenge })).body.code).toBe("recovery_not_started");
    expect((await mfaRow(g.id)).mfa_enabled_at).not.toBeNull();
  });

  it("from a signed-in device, which needs a session", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    await startWait(g.body.email, g.body.password);
    expect((await h.agent().post("/api/auth/mfa/recovery/cancel", {})).status).toBe(401);
    expect((await g.ag.post("/api/auth/mfa/recovery/cancel", {})).body).toEqual({ ok: true, cancelled: true });
    expect((await g.ag.get("/api/auth/mfa/recovery")).body).toEqual({ waiting: null });
    expect((await auditOf(g.id, "mfa.reset_cancelled")).map((x) => x.detail)).toEqual([{ by: "signed_in" }]);
    expect((await g.ag.post("/api/auth/mfa/recovery/cancel", {})).body).toEqual({ ok: true, cancelled: false });
  });

  it("when the password is changed or reset, because whoever asked knew the old one", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    await startWait(g.body.email, g.body.password);
    expect((await g.ag.post("/api/auth/password", { currentPassword: g.body.password, newPassword: "silver-otter-morning-7" })).status).toBe(200);
    expect((await g.ag.get("/api/auth/mfa/recovery")).body.waiting).toBeNull();
    expect((await auditOf(g.id, "mfa.reset_cancelled")).map((x) => x.detail)).toEqual([{ by: "password" }]);

    const c = await signedUp(h, "caregiver");
    await startWait(c.body.email, c.body.password);
    await h.agent().post("/api/auth/password-reset/request", { email: c.body.email });
    await h.settle();
    expect((await h.agent().post("/api/auth/password-reset/confirm", { token: tokenFrom(h.mail.last(c.body.email, "password_reset")), password: "amber-lantern-quiet-5" })).status).toBe(200);
    expect((await auditOf(c.id, "mfa.reset_cancelled")).map((x) => x.detail)).toEqual([{ by: "password" }]);
  });
});

describe("CC-235 finishing the reset", () => {
  it("is refused before the wait ends, then clears the key and codes, ends every session and asks for setup again", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    await startWait(g.body.email, g.body.password);
    const early = await password(g.body.email, g.body.password);
    const r1 = await early.ag.post("/api/auth/mfa/recovery/complete", { challenge: early.challenge });
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe("recovery_waiting");
    expect((await mfaRow(g.id)).mfa_enabled_at).not.toBeNull();

    h.clock.t += 72 * HOUR;
    // The sign-up session and another device signed in just before (with a recovery code) both lose their sessions.
    const other = await password(g.body.email, g.body.password);
    expect((await other.ag.post("/api/auth/mfa/verify", { challenge: other.challenge, recoveryCode: g.recoveryCodes![1] })).status).toBe(200);
    expect((await other.ag.get("/api/me")).status).toBe(200);

    const p = await password(g.body.email, g.body.password);
    expect(p.body.recovery.ready).toBe(true);
    expect((await p.ag.post("/api/auth/mfa/recovery/complete", { challenge: "wrong" })).body.code).toBe("mfa_challenge_expired");
    const done = await p.ag.post("/api/auth/mfa/recovery/complete", { challenge: p.challenge });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ user: { id: g.id, role: "guardian" }, mustSetUp: true, sessionsEnded: 2 });
    expect(String(done.headers["set-cookie"])).toMatch(/cc_session=/);

    const row = await mfaRow(g.id);
    expect(row).toEqual({ mfa_secret_enc: null, mfa_enabled_at: null, codes: 0 });
    expect(await sessionsOf(g.id)).toBe(1);
    expect((await other.ag.get("/api/me")).status).toBe(401);
    // The new session can only set up two-step sign-in again.
    expect((await p.ag.get("/api/me")).body.code).toBe("mfa_enrolment_required");
    expect((await p.ag.get("/api/auth/me")).body.user).toMatchObject({ mfaEnrolled: false, mfaRequired: true });
    const fresh = await enrol(h, p.ag);
    expect(fresh.recoveryCodes.length).toBe(10);
    expect((await p.ag.get("/api/me")).status).toBe(200);
    // The old recovery codes and the old key are gone for good.
    const later = await password(g.body.email, g.body.password);
    expect((await later.ag.post("/api/auth/mfa/verify", { challenge: later.challenge, recoveryCode: g.recoveryCodes![2] })).status).toBe(401);
    // Used once: the same challenge can't finish it again.
    expect((await p.ag.post("/api/auth/mfa/recovery/complete", { challenge: p.challenge })).status).toBe(401);

    expect((await auditOf(g.id, "mfa.reset_completed")).map((x) => x.detail)).toEqual([{ sessionsEnded: 2 }]);
    await h.settle();
    expect(h.mail.last(g.body.email, "mfa_reset_done")?.subject).toBe("Two-step sign-in was reset for your Circle Care account");
  });

  it("an elder who opted in is signed in without a second step afterwards, and may turn it on again", SLOW, async () => {
    const e = await signedUp(h, "elder", {}, { enrol: true });
    await startWait(e.body.email, e.body.password);
    h.clock.t += 72 * HOUR;
    const p = await password(e.body.email, e.body.password);
    expect((await p.ag.post("/api/auth/mfa/recovery/complete", { challenge: p.challenge })).status).toBe(200);
    expect((await p.ag.get("/api/me")).status).toBe(200);
    expect((await h.agent().post("/api/auth/signin", { email: e.body.email, password: e.body.password })).body.user.role).toBe("elder");
  });

  it("never writes a link or code to the audit log", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const { cancelToken } = await startWait(g.body.email, g.body.password);
    const confirmToken = tokenFrom(h.mail.last(g.body.email, "mfa_reset_confirm"));
    const all = JSON.stringify((await h.db.query("SELECT detail FROM audit_events WHERE subject_user_id = $1", [g.id])).rows);
    expect(all).not.toContain(cancelToken);
    expect(all).not.toContain(confirmToken);
    const stored = JSON.stringify((await h.db.query("SELECT * FROM mfa_recovery_requests WHERE user_id = $1", [g.id])).rows);
    expect(stored).not.toContain(cancelToken);
    expect(stored).not.toContain(confirmToken);
  });
});

describe("CC-235 production, configuration and cleanup", () => {
  it("in production with no email provider: nothing changes and the email is recorded as undelivered, with no link in the logs", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const prod = createApp({ cfg: loadConfig(prodEnv), db: h.db, now: () => new Date(h.clock.t) });
    const p = await password(g.body.email, g.body.password);
    const logs: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }));
    try {
      const r = await request(prod).post("/api/auth/mfa/recovery/request").set("X-Requested-With", "circle-care").send({ challenge: p.challenge });
      expect(r.body).toEqual({ ok: true, message: REQUEST_REPLY });
      await prod.locals.settle();
    } finally { spies.forEach((s) => s.mockRestore()); }
    expect((await auditOf(g.id, "email.undeliverable")).map((x) => x.detail)).toEqual([{ kind: "mfa_reset_confirm", reason: "no_provider" }]);
    expect(logs.join("\n")).not.toMatch(/token=/);
    expect(logs.join("\n")).not.toContain(g.body.email);
    expect((await mfaRow(g.id)).mfa_enabled_at).not.toBeNull();
  });

  it("the 72-hour wait can be changed only in the test environment", () => {
    expect(loadConfig({ APP_ENV: "test" }).mfaRecoveryWaitHours).toBe(72);
    expect(loadConfig({ APP_ENV: "test", MFA_RECOVERY_WAIT_HOURS: "0.01" }).mfaRecoveryWaitHours).toBe(0.01);
    expect(loadConfig(prodEnv).mfaRecoveryWaitHours).toBe(72);
    expect(() => loadConfig({ ...prodEnv, MFA_RECOVERY_WAIT_HOURS: "1" })).toThrow(/only be changed in the test environment/);
    expect(() => loadConfig({ APP_ENV: "development", MFA_RECOVERY_WAIT_HOURS: "1" })).toThrow(/MFA_RECOVERY_WAIT_HOURS/);
    expect(() => loadConfig({ APP_ENV: "test", MFA_RECOVERY_WAIT_HOURS: "soon" })).toThrow(/number of hours/);
  });

  it("cleanup deletes expired unconfirmed links and old finished resets, and keeps a waiting one", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const p = await password(g.body.email, g.body.password);
    await p.ag.post("/api/auth/mfa/recovery/request", { challenge: p.challenge });
    await h.settle();
    const w = await signedUp(h, "caregiver");
    await startWait(w.body.email, w.body.password);
    h.clock.t += 31 * 60_000;
    const r = await cleanupExpired(h.db, h.cfg, new Date(h.clock.t));
    expect(r.mfaRecoveryRequests).toBeGreaterThanOrEqual(1);
    const left = async (id: string) => (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM mfa_recovery_requests WHERE user_id = $1", [id])).rows[0].n;
    expect(await left(g.id)).toBe(0);
    expect(await left(w.id)).toBe(1);
  });
});
