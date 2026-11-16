// CC-200 Second sign-in step on the server for guardians and caregivers.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { cleanupExpired } from "../cleanup";
import { loadConfig } from "../config";
import { sha256 } from "../crypto";
import { base32Decode, base32Encode, counterAt, hashRecoveryCode, hotp, newRecoveryCodes, normaliseRecoveryCode, otpauthUri, totp, verifyTotp } from "../totp";
import { enrol, harness, nextCode, seenBodies, signedUp, signIn, type Harness } from "./helpers";

const SLOW = { timeout: 30_000 };
// The same keys as the production and staging configs below, so those apps can read this database.
const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
let h: Harness;
beforeAll(async () => { h = await harness({ DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 }); });
afterAll(async () => { await h.db.close(); });

const auditOf = async (id: string, action: string) => (await h.db.query<{ detail: Record<string, unknown> }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = $2 ORDER BY id", [id, action])).rows;
const sessionsOf = async (id: string) => (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [id])).rows[0].n;
/** A 6-digit code that is not valid for this secret anywhere near now. */
function wrongCode(secret: string, t = h.clock.t) {
  const valid = new Set([-2, -1, 0, 1, 2].map((w) => hotp(base32Decode(secret), counterAt(t) + w)));
  for (let i = 0; ; i++) { const c = String(100000 + i * 7919).slice(-6); if (!valid.has(c)) return c; }
}

/* ---------------- RFC test vectors ---------------- */

describe("CC-200 TOTP implementation (node:crypto only)", () => {
  const ascii = (s: string) => Buffer.from(s, "ascii");
  it("matches the RFC 4226 HOTP test vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(ascii("12345678901234567890"), counter)).toBe(code));
  });
  it.each([
    ["sha1", "12345678901234567890", ["94287082", "07081804", "14050471", "89005924", "69279037", "65353130"]],
    ["sha256", "12345678901234567890123456789012", ["46119246", "68084774", "67062674", "91819424", "90698825", "77737706"]],
    ["sha512", "1234567890123456789012345678901234567890123456789012345678901234", ["90693936", "25091201", "99943326", "93441116", "38618901", "47863826"]],
  ] as const)("matches the RFC 6238 TOTP test vectors (%s, 8 digits)", (algorithm, key, codes) => {
    const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
    times.forEach((t, i) => expect(totp(ascii(key), t * 1000, { digits: 8, algorithm })).toBe(codes[i]));
  });
  it("matches the RFC 4648 base32 test vectors and round-trips", () => {
    const v: [string, string][] = [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]];
    for (const [plain, enc] of v) {
      expect(base32Encode(ascii(plain))).toBe(enc);
      expect(base32Decode(enc).toString("ascii")).toBe(plain);
    }
    expect(base32Decode("mzxw 6ytb oi==").toString("ascii")).toBe("foobar");
    expect(() => base32Decode("MZXW1")).toThrow();
  });
  it("accepts the current step and one either side, nothing further, and only 6 digits", () => {
    const key = ascii("12345678901234567890");
    const t = 1_700_000_000_000;
    const c = counterAt(t);
    for (const w of [-1, 0, 1]) expect(verifyTotp(key, hotp(key, c + w), t)).toBe(c + w);
    for (const w of [-2, 2]) expect(verifyTotp(key, hotp(key, c + w), t)).toBeNull();
    expect(verifyTotp(key, "12345", t)).toBeNull();
    expect(verifyTotp(key, "12345a", t)).toBeNull();
    expect(verifyTotp(key, ` ${hotp(key, c)} `, t)).toBe(c);
  });
  it("builds an otpauth:// URI authenticator apps understand", () => {
    const u = new URL(otpauthUri("JBSWY3DPEHPK3PXP", "sarah@example.com"));
    expect(u.protocol).toBe("otpauth:");
    expect(u.host).toBe("totp");
    expect(decodeURIComponent(u.pathname)).toBe("/Circle Care:sarah@example.com");
    expect(u.searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(u.searchParams.get("issuer")).toBe("Circle Care");
    expect(u.searchParams.get("digits")).toBe("6");
    expect(u.searchParams.get("period")).toBe("30");
  });
  it("makes 10 distinct recovery codes, matched however they're typed, and hashed with a key", () => {
    const codes = newRecoveryCodes();
    expect(codes.length).toBe(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(normaliseRecoveryCode(` ${codes[0].toUpperCase().replace("-", " ")} `)).toBe(codes[0].replace("-", ""));
    const key = Buffer.alloc(32, 9);
    expect(hashRecoveryCode(key, codes[0])).toBe(hashRecoveryCode(key, codes[0].toUpperCase()));
    expect(hashRecoveryCode(key, codes[0])).not.toBe(hashRecoveryCode(Buffer.alloc(32, 8), codes[0]));
    expect(hashRecoveryCode(key, codes[0])).not.toContain(codes[0].replace("-", ""));
  });
});

/* ---------------- Enrolment ---------------- */

describe("CC-200 guardians and caregivers must enrol before using their account", () => {
  it.each(["guardian", "caregiver"] as const)("%s: account, payment and vault routes answer 403 mfa_enrolment_required until enrolled", SLOW, async (role) => {
    const u = await signedUp(h, role, {}, { enrol: false });
    for (const r of [await u.ag.get("/api/me"), await u.ag.get("/api/me/activity"), await u.ag.patch("/api/me", { firstName: "Ann" }), await u.ag.put("/api/me/ssn", { ssn: "900-12-3456" }), await u.ag.get("/api/me/payment-methods"), await u.ag.post("/vault/v1/cards", {})]) {
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("mfa_enrolment_required");
      expect(r.body.error).toBe("Set up two-step sign-in to keep using your account.");
    }
    const me = await u.ag.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ role, mfaEnrolled: false, mfaRequired: true });
    await enrol(h, u.ag);
    expect((await u.ag.get("/api/me")).status).toBe(200);
    expect((await u.ag.get("/api/me")).body.me.mfaEnrolled).toBe(true);
  });

  it("signed-out requests still get 401, not the enrolment message", async () => {
    expect((await h.agent().get("/api/me")).status).toBe(401);
  });

  it("elders may use their account without enrolling", SLOW, async () => {
    const e = await signedUp(h, "elder");
    const me = await e.ag.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.me.mfaEnrolled).toBe(false);
    expect((await e.ag.get("/api/auth/me")).body.user.mfaRequired).toBe(false);
  });

  it("start returns the secret and otpauth link once; confirm needs a valid code and returns 10 recovery codes once; nothing is stored in the clear", SLOW, async () => {
    const g = await signedUp(h, "guardian", {}, { enrol: false });
    const start = await g.ag.post("/api/auth/mfa/enrol/start");
    expect(start.status).toBe(200);
    const secret = start.body.secret as string;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret).length).toBe(20);
    expect(start.body.otpauthUri).toContain(`secret=${secret}`);
    expect(start.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/Circle%20Care%3A/);
    const pending = (await h.db.query<{ mfa_pending_secret_enc: string; mfa_secret_enc: string | null }>("SELECT mfa_pending_secret_enc, mfa_secret_enc FROM users WHERE id = $1", [g.id])).rows[0];
    expect(pending.mfa_pending_secret_enc).toMatch(/^v1\.k1\./);
    expect(pending.mfa_pending_secret_enc).not.toContain(secret);
    expect(pending.mfa_secret_enc).toBeNull();

    const bad = await g.ag.post("/api/auth/mfa/enrol/confirm", { code: wrongCode(secret) });
    expect(bad.status).toBe(401);
    expect(bad.body.field).toBe("code");
    expect((await g.ag.get("/api/me")).status).toBe(403);

    const ok = await g.ag.post("/api/auth/mfa/enrol/confirm", { code: nextCode(h, secret) });
    expect(ok.status).toBe(200);
    const codes = ok.body.recoveryCodes as string[];
    expect(codes.length).toBe(10);
    const row = (await h.db.query<{ mfa_secret_enc: string; mfa_pending_secret_enc: string | null; mfa_enabled_at: Date | null }>("SELECT mfa_secret_enc, mfa_pending_secret_enc, mfa_enabled_at FROM users WHERE id = $1", [g.id])).rows[0];
    expect(row.mfa_secret_enc).toMatch(/^v1\.k1\./);
    expect(row.mfa_pending_secret_enc).toBeNull();
    expect(row.mfa_enabled_at).not.toBeNull();
    const stored = JSON.stringify((await h.db.query("SELECT * FROM mfa_recovery_codes WHERE user_id = $1", [g.id])).rows);
    for (const c of codes) { expect(stored).not.toContain(c); expect(stored).not.toContain(c.replace("-", "")); }
    expect((await h.db.query("SELECT 1 FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL", [g.id])).rows.length).toBe(10);
    expect((await auditOf(g.id, "mfa.enrolled")).map((e) => e.detail)).toEqual([{ method: "authenticator_app", recoveryCodes: 10 }]);

    // Never returned again.
    expect((await g.ag.post("/api/auth/mfa/enrol/start")).status).toBe(409);
    expect((await g.ag.post("/api/auth/mfa/enrol/confirm", { code: "123456" })).status).toBe(409);
    const later = [await g.ag.get("/api/me"), await g.ag.get("/api/auth/me"), await g.ag.get("/api/me/activity")].map((r) => r.text).join("\n");
    expect(later).not.toContain(secret);
    for (const c of codes) expect(later).not.toContain(c);
    expect(seenBodies.filter((b) => b.includes(secret)).length).toBe(1); // only the start response
  });

  it("an unconfirmed setup expires after 15 minutes and is cleared by the cleanup", SLOW, async () => {
    const g = await signedUp(h, "caregiver", {}, { enrol: false });
    const start = await g.ag.post("/api/auth/mfa/enrol/start");
    h.clock.t += 16 * 60_000;
    await g.ag.get("/api/auth/me");
    const late = await g.ag.post("/api/auth/mfa/enrol/confirm", { code: nextCode(h, start.body.secret) });
    expect(late.status).toBe(400);
    expect(late.body.code).toBe("mfa_enrol_expired");
    const r = await cleanupExpired(h.db, h.cfg, new Date(h.clock.t));
    expect(r.mfaPendingSetups).toBeGreaterThanOrEqual(1);
    expect((await h.db.query<{ p: string | null }>("SELECT mfa_pending_secret_enc AS p FROM users WHERE id = $1", [g.id])).rows[0].p).toBeNull();
  });

  it("setting up from a sign-in older than 10 minutes asks for the password again; a wrong one is refused and audited", SLOW, async () => {
    const g = await signedUp(h, "guardian", {}, { enrol: false });
    // A fresh sign-in needs no password (sign-up just checked it).
    h.clock.t += 11 * 60_000;
    const none = await g.ag.post("/api/auth/mfa/enrol/start");
    expect(none.status).toBe(401);
    expect(none.body.code).toBe("reauth_required");
    expect(none.text).not.toMatch(/otpauth|secret"/);
    const wrong = await g.ag.post("/api/auth/mfa/enrol/start", { password: "not-my-password" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe("reauth_failed");
    expect(await auditOf(g.id, "mfa.enrol_password_wrong")).toHaveLength(1);
    expect(JSON.stringify(await auditOf(g.id, "mfa.enrol_password_wrong"))).not.toContain("not-my-password");
    const right = await g.ag.post("/api/auth/mfa/enrol/start", { password: g.body.password });
    expect(right.status).toBe(200);
    expect(right.body.secret).toBeTruthy();
    const confirm = await g.ag.post("/api/auth/mfa/enrol/confirm", { code: nextCode(h, right.body.secret) });
    expect(confirm.status).toBe(200);
  });
});

/* ---------------- Sign-in ---------------- */

describe("CC-200 sign-in for an enrolled account", () => {
  it("a correct password issues no session: only a hashed, 5-minute, single-use challenge", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const before = await sessionsOf(g.id);
    const ag = h.agent();
    const pw = await ag.post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    expect(pw.status).toBe(200);
    expect(pw.body).toEqual({ mfaRequired: true, challenge: expect.any(String), expiresInSeconds: 300 });
    expect(pw.headers["set-cookie"]).toBeUndefined();
    expect(await sessionsOf(g.id)).toBe(before);
    expect((await ag.get("/api/me")).status).toBe(401);
    expect((await ag.get("/api/auth/me")).status).toBe(401);
    const ch = (await h.db.query<{ token_hash: string; created_at: Date; expires_at: Date }>("SELECT token_hash, created_at, expires_at FROM mfa_challenges WHERE user_id = $1", [g.id])).rows;
    expect(ch.length).toBe(1);
    expect(ch[0].token_hash).toBe(sha256(pw.body.challenge));
    expect(new Date(ch[0].expires_at).getTime() - new Date(ch[0].created_at).getTime()).toBe(5 * 60_000);

    const v = await ag.post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: nextCode(h, g.secret!) });
    expect(v.status).toBe(200);
    expect(String(v.headers["set-cookie"])).toMatch(/cc_session=.+HttpOnly; SameSite=Strict/);
    expect((await ag.get("/api/me")).status).toBe(200);
    expect(await sessionsOf(g.id)).toBe(before + 1);
    expect((await auditOf(g.id, "auth.signin")).at(-1)!.detail).toEqual({ secondStep: "authenticator_app" });
    // Single use.
    const again = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: nextCode(h, g.secret!) });
    expect(again.status).toBe(401);
    expect(again.body.code).toBe("mfa_challenge_expired");
  });

  it("a challenge expires after 5 minutes", SLOW, async () => {
    const g = await signedUp(h, "caregiver");
    const pw = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    h.clock.t += 5 * 60_000 + 1000;
    const r = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: nextCode(h, g.secret!) });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Your sign-in timed out. Please enter your password again.");
    expect((await cleanupExpired(h.db, h.cfg, new Date(h.clock.t))).mfaChallenges).toBeGreaterThanOrEqual(1);
  });

  it("a wrong password for an enrolled account is still a wrong password (no challenge)", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const r = await h.agent().post("/api/auth/signin", { email: g.body.email, password: "not-the-password-1" });
    expect(r.status).toBe(401);
    expect(r.body.challenge).toBeUndefined();
  });

  it("refuses a code from a step that was already used (no replay)", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const key = base32Decode(g.secret!);
    h.clock.t += 120_000; // a fresh step, past the one used at enrolment
    const code = hotp(key, counterAt(h.clock.t));
    const a = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    expect((await h.agent().post("/api/auth/mfa/verify", { challenge: a.body.challenge, code })).status).toBe(200);
    const b = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    const replay = await h.agent().post("/api/auth/mfa/verify", { challenge: b.body.challenge, code });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("That code was already used. Wait for the next code in your app.");
    // An older step is refused too; the next one works.
    expect((await h.agent().post("/api/auth/mfa/verify", { challenge: b.body.challenge, code: hotp(key, counterAt(h.clock.t) - 1) })).status).toBe(401);
    expect((await h.agent().post("/api/auth/mfa/verify", { challenge: b.body.challenge, code: hotp(key, counterAt(h.clock.t) + 1) })).status).toBe(200);
  });

  it("5 wrong codes in 15 minutes: further codes refused with 429, audited without the code, owner emailed", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const pw = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    const tried: string[] = [];
    for (let i = 0; i < 4; i++) {
      const code = wrongCode(g.secret!);
      tried.push(code);
      const r = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code });
      expect(r.status).toBe(401);
      expect(r.body.field).toBe("code");
    }
    const fifth = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: wrongCode(g.secret!) });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe("mfa_locked");
    expect(fifth.headers["retry-after"]).toBeDefined();
    const right = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: nextCode(h, g.secret!) });
    expect(right.status).toBe(429);
    expect(await sessionsOf(g.id)).toBe(1); // only the sign-up session
    const locked = await auditOf(g.id, "mfa.locked");
    expect(locked.map((e) => e.detail)).toEqual([{ attempts: 5 }]);
    const failed = await auditOf(g.id, "auth.mfa_failed");
    expect(failed.map((e) => e.detail)).toEqual([1, 2, 3, 4, 5].map((attempt) => ({ attempt })));
    const all = JSON.stringify([...locked, ...failed]);
    for (const c of tried) expect(all).not.toContain(c);
    await h.settle();
    expect(h.mail.last(g.body.email, "mfa_locked")?.subject).toBe("Someone entered wrong sign-in codes for your Circle Care account");
    h.clock.t += 15 * 60_000 + 1000;
    const pw2 = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    expect((await h.agent().post("/api/auth/mfa/verify", { challenge: pw2.body.challenge, code: nextCode(h, g.secret!) })).status).toBe(200);
  });

  it("parallel guesses can't get more than 5 codes checked", SLOW, async () => {
    const g = await signedUp(h, "caregiver");
    const pw = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    const rs = await Promise.all(Array.from({ length: 15 }, () => h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: wrongCode(g.secret!) })));
    expect(rs.filter((r) => r.status === 401).length).toBe(4);
    expect(rs.filter((r) => r.status === 429).length).toBe(11);
    expect((await auditOf(g.id, "auth.mfa_failed")).length).toBe(5);
    h.clock.t += 16 * 60_000;
  });

  it("each recovery code works once, is audited, and is matched however it's typed", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const [first, second] = g.recoveryCodes!;
    const a = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    const ag = h.agent();
    const v = await ag.post("/api/auth/mfa/verify", { challenge: a.body.challenge, recoveryCode: first.toUpperCase().replace("-", " ") });
    expect(v.status).toBe(200);
    expect(v.body.recoveryCodesLeft).toBe(9);
    expect((await ag.get("/api/me")).status).toBe(200);
    expect((await auditOf(g.id, "mfa.recovery_used")).map((e) => e.detail)).toEqual([{ remaining: 9 }]);
    expect((await auditOf(g.id, "auth.signin")).at(-1)!.detail).toEqual({ secondStep: "recovery_code" });
    const b = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    const reused = await h.agent().post("/api/auth/mfa/verify", { challenge: b.body.challenge, recoveryCode: first });
    expect(reused.status).toBe(401);
    expect(reused.body.field).toBe("recoveryCode");
    // A failed recovery code doesn't burn the challenge.
    expect((await h.agent().post("/api/auth/mfa/verify", { challenge: b.body.challenge, recoveryCode: second })).status).toBe(200);
    expect((await auditOf(g.id, "mfa.recovery_used")).map((e) => e.detail)).toEqual([{ remaining: 9 }, { remaining: 8 }]);
    const act = (await ag.get("/api/me/activity")).body.events.map((e: { text: string }) => e.text);
    expect(act).toContain("A recovery code was used — 8 left");
    expect(JSON.stringify(act)).not.toContain(first);
  });

  it("an elder who enrols is asked for a code at sign-in too", SLOW, async () => {
    const e = await signedUp(h, "elder", {}, { enrol: true });
    const pw = await h.agent().post("/api/auth/signin", { email: e.body.email, password: e.body.password });
    expect(pw.body.mfaRequired).toBe(true);
    const { r } = await signIn(h, e.body.email, e.body.password, e.secret);
    expect(r.status).toBe(200);
  });

  it("sign out everywhere also cancels a pending challenge", SLOW, async () => {
    const g = await signedUp(h, "guardian");
    const pw = await h.agent().post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    await g.ag.post("/api/auth/signout-everywhere");
    const r = await h.agent().post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: nextCode(h, g.secret!) });
    expect(r.body.code).toBe("mfa_challenge_expired");
  });
});

describe("CC-200 the browser demo's code is never special on the server", () => {
  const prodEnv = { APP_ENV: "production", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_abc" };
  const stagingEnv = { APP_ENV: "staging", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc" };
  it.each([["production", prodEnv], ["staging", stagingEnv], ["test", { APP_ENV: "test", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 }]] as const)("482913 is refused in %s", SLOW, async (_name, env) => {
    const g = await signedUp(h, "guardian");
    // Make sure 482913 isn't, by chance, a real code for this secret right now.
    while ([-1, 0, 1].some((w) => hotp(base32Decode(g.secret!), counterAt(h.clock.t) + w) === "482913")) h.clock.t += 90_000;
    const app = createApp({ cfg: loadConfig(env), db: h.db, now: () => new Date(h.clock.t) });
    const post = (url: string, body: object) => request(app).post(url).set("X-Requested-With", "circle-care").set("X-Forwarded-For", "192.0.2.50").send(body);
    const pw = await post("/api/auth/signin", { email: g.body.email, password: g.body.password });
    expect(pw.body.mfaRequired).toBe(true);
    const r = await post("/api/auth/mfa/verify", { challenge: pw.body.challenge, code: "482913" });
    expect(r.status).toBe(401);
    expect(r.headers["set-cookie"]).toBeUndefined();
    await h.db.query("DELETE FROM rate_limits"); // the per-account wrong-code count, for the next run
  });
  it("no server source file mentions the demo code", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.(ts|sql)$/.test(f) && !f.includes("__tests__"));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(readFileSync(join(dir, f), "utf8")).not.toContain("482913");
  });
});
