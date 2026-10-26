// API tests for Sprint 11 — Accounts, Identity & Payments (CC-173 – CC-190).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt } from "../crypto";
import { completeGuardian, harness, person, seenBodies, signedUp, SSN_PATTERN, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => {
  // CC-181: no API response in this whole suite may contain a full SSN.
  // Published example values shown to users in test environments are allowed; nothing else is.
  const allowed = /900-12-3456|110000000|000123456789|"number":"\d+"/g;
  const leaks = seenBodies.filter((b) => SSN_PATTERN.test(b.replace(allowed, "").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")));
  expect(leaks).toEqual([]);
  await h.db.close();
});

describe("CC-190 health and config", () => {
  it("reports health without sensitive details", async () => {
    const r = await h.agent().get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, env: "test", db: "embedded" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("tells the app this is a test-data environment and lists test values (CC-182)", async () => {
    const r = await h.agent().get("/api/config");
    expect(r.body.testData).toBe(true);
    expect(r.body.testValues.ssn).toBe("900-12-3456");
    expect(r.body.testValues.routingNumber).toBe("110000000");
    expect(r.body.testValues.cards.length).toBe(6);
  });
});

describe("CC-173 sign-up", () => {
  it("creates the user and exactly one persona row for each role", async () => {
    for (const role of ["elder", "caregiver", "guardian"] as const) {
      const { id } = await signedUp(h, role);
      const counts = await Promise.all(["elders", "caregivers", "guardians"].map(async (t) => (await h.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [id])).rows[0].n));
      expect(counts).toEqual([role === "elder" ? 1 : 0, role === "caregiver" ? 1 : 0, role === "guardian" ? 1 : 0]);
    }
  });
  it("stores the password only as a scrypt hash and the phone as +1XXXXXXXXXX", async () => {
    const { id, body } = await signedUp(h, "elder", { phone: "415.555.0199" });
    const u = (await h.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [id])).rows[0];
    expect(u.password_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(u.password_hash).not.toContain(body.password);
    const p = (await h.db.query<{ phone: string }>("SELECT phone FROM elders WHERE user_id = $1", [id])).rows[0];
    expect(p.phone).toBe("+14155550199");
  });
  it("signs the new user in with a secure session cookie", async () => {
    const { ag } = await signedUp(h, "caregiver");
    const me = await ag.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.me.role).toBe("caregiver");
  });
  it.each([
    [{ firstName: "" }, "firstName", "Required"],
    [{ lastName: "L33t" }, "lastName", "Use letters, spaces, apostrophes or hyphens"],
    [{ phone: "555-0100" }, "phone", "Enter a 10-digit US phone number"],
    [{ email: "not-an-email" }, "email", "Enter a valid email address"],
    [{ password: "short" }, "password", "At least 12 characters"],
    [{ email: "sarahlee@example.com", password: "sarahlee-is-great" }, "password", "Doesn't contain your email name"],
    [{ password: "password1234" }, "password", "Isn't a common password"],
    [{ acceptTerms: false }, "acceptTerms", "Please agree to the Terms and Privacy Notice to continue"],
    [{ role: "admin" }, "role", "Choose whether you're the elder, a caregiver or the legal guardian."],
  ])("rejects %o", async (over, field, message) => {
    const r = await h.agent().post("/api/auth/signup", person("guardian", over));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe(field);
    expect(r.body.error).toBe(message);
  });
  it("does not reveal that an email already has an account", async () => {
    const { body } = await signedUp(h, "guardian");
    const r = await h.agent().post("/api/auth/signup", person("elder", { email: body.email.toUpperCase() }));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("We couldn't create an account with these details. If you already have one, sign in.");
  });
  it("writes an account.created audit event without the password", async () => {
    const { id, body } = await signedUp(h, "elder");
    const e = (await h.db.query<{ detail: unknown }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = 'account.created'", [id])).rows;
    expect(e.length).toBe(1);
    expect(JSON.stringify(e[0].detail)).not.toContain(body.password);
  });
});

describe("CC-174 sign-in and sessions", () => {
  it("signs in, reports me, and signs out", async () => {
    const { body } = await signedUp(h, "guardian");
    const a = h.agent();
    const r = await a.post("/api/auth/signin", { email: body.email, password: body.password });
    expect(r.status).toBe(200);
    const cookie = String(r.headers["set-cookie"]);
    expect(cookie).toMatch(/cc_session=.+HttpOnly; SameSite=Strict/);
    expect(cookie).not.toContain("Secure"); // only in production
    expect((await a.get("/api/auth/me")).body.user.email).toBe(body.email);
    await a.post("/api/auth/signout");
    expect((await a.get("/api/auth/me")).status).toBe(401);
  });
  it("stores only a hash of the session token", async () => {
    const r = await h.agent().post("/api/auth/signup", person("elder"));
    const token = /cc_session=([^;]+)/.exec(String(r.headers["set-cookie"]))![1];
    const rows = (await h.db.query<{ token_hash: string }>("SELECT token_hash FROM sessions")).rows;
    expect(rows.some((s) => s.token_hash === token)).toBe(false);
    expect(rows.every((s) => /^[0-9a-f]{64}$/.test(s.token_hash))).toBe(true);
  });
  it("uses the same message for a wrong password and an unknown email", async () => {
    const { body } = await signedUp(h, "elder");
    const wrong = await h.agent().post("/api/auth/signin", { email: body.email, password: "not-the-password-123" });
    const unknown = await h.agent().post("/api/auth/signin", { email: "nobody@example.com", password: "whatever-password-1" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe("Email or password is incorrect.");
    expect(unknown.body.error).toBe(wrong.body.error);
  });
  it("expires after 30 idle minutes", async () => {
    const { ag } = await signedUp(h, "caregiver");
    h.clock.t += 31 * 60_000;
    const r = await ag.get("/api/me");
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("session_expired");
    expect(r.body.error).toBe("For your security we signed you out. Please sign in again.");
  });
  it("expires 12 hours after sign-in even when active", async () => {
    const { ag } = await signedUp(h, "caregiver");
    for (let i = 0; i < 25; i++) { h.clock.t += 29 * 60_000; await ag.get("/api/me"); }
    expect((await ag.get("/api/me")).status).toBe(401);
  });
  it("rejects data-changing requests without the CSRF header", async () => {
    const r = await h.agent().raw.post("/api/auth/signup").send(person("elder"));
    expect(r.status).toBe(403);
  });
});

describe("CC-175 lockout", () => {
  it("locks for 15 minutes after 5 failures, then allows the right password", async () => {
    const { body, id } = await signedUp(h, "guardian");
    const a = h.agent();
    for (let i = 0; i < 4; i++) expect((await a.post("/api/auth/signin", { email: body.email, password: "wrong-password-xx" })).status).toBe(401);
    const fifth = await a.post("/api/auth/signin", { email: body.email, password: "wrong-password-xx" });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error).toBe("Too many attempts. Try again in 15 minutes.");
    expect((await a.post("/api/auth/signin", { email: body.email, password: body.password })).status).toBe(429);
    h.clock.t += 16 * 60_000;
    expect((await a.post("/api/auth/signin", { email: body.email, password: body.password })).status).toBe(200);
    const u = (await h.db.query<{ failed_attempts: number }>("SELECT failed_attempts FROM users WHERE id = $1", [id])).rows[0];
    expect(u.failed_attempts).toBe(0);
    const locked = (await h.db.query("SELECT 1 FROM audit_events WHERE subject_user_id = $1 AND action = 'auth.locked'", [id])).rows;
    expect(locked.length).toBe(1);
  });
  it("resets the counter after a successful sign-in", async () => {
    const { body, id } = await signedUp(h, "elder");
    const a = h.agent();
    for (let i = 0; i < 3; i++) await a.post("/api/auth/signin", { email: body.email, password: "wrong-password-xx" });
    await a.post("/api/auth/signin", { email: body.email, password: body.password });
    expect((await h.db.query<{ failed_attempts: number }>("SELECT failed_attempts FROM users WHERE id = $1", [id])).rows[0].failed_attempts).toBe(0);
  });
});

describe("Lead Architect review fixes", () => {
  it("M1: parallel wrong passwords still lock the account", async () => {
    const { body, id } = await signedUp(h, "guardian");
    const a = h.agent();
    await Promise.all(Array.from({ length: 20 }, () => a.post("/api/auth/signin", { email: body.email, password: "wrong-password-xx" })));
    const u = (await h.db.query<{ failed_attempts: number; locked_until: Date | null }>("SELECT failed_attempts, locked_until FROM users WHERE id = $1", [id])).rows[0];
    expect(u.failed_attempts).toBeGreaterThanOrEqual(5);
    expect(u.locked_until).not.toBeNull();
    expect((await a.post("/api/auth/signin", { email: body.email, password: body.password })).status).toBe(429);
    h.clock.t += 16 * 60_000;
  });
  it("M2: wrong passwords on SSN change count toward lockout and end every session", async () => {
    const { ag, body } = await signedUp(h, "guardian");
    await ag.put("/api/me/ssn", { ssn: "900-48-1001" });
    for (let i = 0; i < 4; i++) expect((await ag.put("/api/me/ssn", { ssn: "900-48-1002", password: "wrong-password-xx" })).status).toBe(403);
    const fifth = await ag.put("/api/me/ssn", { ssn: "900-48-1002", password: "wrong-password-xx" });
    expect(fifth.status).toBe(429);
    expect((await ag.get("/api/me")).status).toBe(401);
    expect((await h.agent().post("/api/auth/signin", { email: body.email, password: body.password })).status).toBe(429);
    h.clock.t += 16 * 60_000;
  });
  it.each(["912-70-1234", "900-50-1234", "999-94-1234", "955-90-1234"])("M3: refuses real ITIN %s in test environments", async (ssn) => {
    const { ag } = await signedUp(h, "elder");
    const r = await ag.put("/api/me/ssn", { ssn });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("middle digits 01–49");
  });
  it.each(["900-12-3457", "966-66-1234", "901-89-1234", "902-93-1234"])("M3: still accepts test SSN %s", async (ssn) => {
    const { ag } = await signedUp(h, "elder");
    expect((await ag.put("/api/me/ssn", { ssn })).status).toBe(200);
  });
  it("M4: a bank name with a long digit run is a field error, not a crash", async () => {
    const g = await signedUp(h, "guardian");
    const r = await g.ag.post("/vault/v1/bank-accounts", { bankName: "Bank 123456789", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("bankName");
  });
  it("a malformed session cookie is ignored, not a 500", async () => {
    const r = await h.agent().raw.get("/api/me").set("Cookie", "cc_session=%E0%A4%A");
    expect(r.status).toBe(401);
  });
});

describe("CC-176 – CC-178 profiles", () => {
  it("updates only my own persona row and audits the field names", async () => {
    const { ag, id } = await signedUp(h, "elder");
    const r = await ag.patch("/api/me", { firstName: "Maggie", phone: "415-555-0123" });
    expect(r.status).toBe(200);
    expect(r.body.me.firstName).toBe("Maggie");
    expect(r.body.me.phone).toBe("+14155550123");
    const ev = (await h.db.query<{ detail: { fields: string[] } }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = 'profile.updated'", [id])).rows[0];
    expect(ev.detail.fields).toEqual(["first_name", "phone"]);
  });
  it("rejects invalid edits with the sign-up messages", async () => {
    const { ag } = await signedUp(h, "caregiver");
    const r = await ag.patch("/api/me", { phone: "12" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Enter a 10-digit US phone number");
  });
  it("isolates users: /api/me is always the signed-in person", async () => {
    const a = await signedUp(h, "caregiver");
    const b = await signedUp(h, "elder");
    expect((await a.ag.get("/api/me")).body.me.id).toBe(a.id);
    expect((await b.ag.get("/api/me")).body.me.id).toBe(b.id);
    expect((await h.agent().get("/api/me")).status).toBe(401);
  });
  it("marks a guardian incomplete until SSN and bank account are on file", async () => {
    const g = await signedUp(h, "guardian");
    let me = (await g.ag.get("/api/me")).body.me;
    expect(me.profileStatus).toBe("incomplete");
    expect(me.missing).toEqual(["ssn", "bank_account"]);
    await g.ag.put("/api/me/ssn", { ssn: "900-44-1234" });
    me = (await g.ag.get("/api/me")).body.me;
    expect(me.missing).toEqual(["bank_account"]);
    const done = await completeGuardian(h);
    expect((await done.ag.get("/api/me")).body.me.profileStatus).toBe("complete");
  });
  it("elders and caregivers are complete with an SSN (no bank account needed)", async () => {
    const e = await signedUp(h, "elder");
    await e.ag.put("/api/me/ssn", { ssn: "900-33-1111" });
    expect((await e.ag.get("/api/me")).body.me.profileStatus).toBe("complete");
  });
});

describe("CC-179 profile photo", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
  it("stores the photo encrypted and serves it privately", async () => {
    const { ag, id } = await signedUp(h, "elder");
    const up = await ag.putRaw("/api/me/photo", jpeg, "image/jpeg");
    expect(up.status).toBe(200);
    expect(up.body.me.hasPhoto).toBe(true);
    const row = (await h.db.query<{ data_enc: string; size_bytes: number }>("SELECT data_enc, size_bytes FROM photos WHERE user_id = $1", [id])).rows[0];
    expect(row.data_enc.startsWith("v1.k1.")).toBe(true);
    expect(row.size_bytes).toBe(jpeg.length);
    const get = await ag.raw.get("/api/me/photo").buffer(true);
    expect(get.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.compare(get.body as Buffer, jpeg)).toBe(0);
  });
  it("rejects files that aren't images, whatever their Content-Type", async () => {
    const { ag } = await signedUp(h, "caregiver");
    const r = await ag.putRaw("/api/me/photo", Buffer.from("<svg onload=alert(1)>"), "image/jpeg");
    expect(r.status).toBe(415);
    expect(r.body.error).toBe("Choose a JPEG, PNG or WebP photo.");
  });
  it("rejects photos over 2 MB", async () => {
    const { ag } = await signedUp(h, "caregiver");
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 + 10)]);
    const r = await ag.putRaw("/api/me/photo", big, "image/jpeg");
    expect(r.status).toBe(413);
  });
  it("removes the photo", async () => {
    const { ag } = await signedUp(h, "guardian");
    await ag.putRaw("/api/me/photo", jpeg, "image/jpeg");
    const r = await ag.del("/api/me/photo");
    expect(r.body.me.hasPhoto).toBe(false);
    expect((await ag.get("/api/me/photo")).status).toBe(404);
  });
});

describe("CC-180 / CC-181 / CC-182 Social Security numbers", () => {
  it("encrypts the SSN, keeps last four, and never returns it", async () => {
    const { ag, id } = await signedUp(h, "guardian");
    const r = await ag.put("/api/me/ssn", { ssn: "900-12-3456" });
    expect(r.status).toBe(200);
    expect(r.body.me.ssnLast4).toBe("3456");
    expect(JSON.stringify(r.body)).not.toContain("900123456");
    const row = (await h.db.query<{ ssn_enc: string; ssn_last4: string }>("SELECT ssn_enc, ssn_last4 FROM guardians WHERE user_id = $1", [id])).rows[0];
    expect(row.ssn_enc).toMatch(/^v1\.k1\./);
    expect(row.ssn_enc).not.toContain("900123456");
    expect(decrypt(h.cfg, row.ssn_enc).toString()).toBe("900123456");
  });
  it.each([
    ["212-55-1234", "test environment"],
    ["123-45-6789", "isn't a valid"],
    ["078-05-1120", "isn't a valid"],
    ["900-00-1234", "isn't a valid"],
    ["900-12-0000", "isn't a valid"],
    ["999-99-9999", "isn't a valid"],
    ["12345", "Enter all 9 digits"],
  ])("rejects %s outside production", async (ssn, msg) => {
    const { ag } = await signedUp(h, "elder");
    const r = await ag.put("/api/me/ssn", { ssn });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain(msg);
  });
  it("logs a blocked real-looking SSN by field name only", async () => {
    const { ag, id } = await signedUp(h, "elder");
    await ag.put("/api/me/ssn", { ssn: "212-55-1234" });
    const ev = (await h.db.query<{ detail: unknown }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = 'nonprod.blocked'", [id])).rows;
    expect(ev.length).toBe(1);
    expect(JSON.stringify(ev[0].detail)).toBe('{"field":"ssn"}');
    expect((await h.db.query("SELECT 1 FROM elders WHERE user_id = $1 AND ssn_enc IS NOT NULL", [id])).rows.length).toBe(0);
  });
  it("refuses an SSN already on another account", async () => {
    const a = await signedUp(h, "elder");
    const b = await signedUp(h, "caregiver");
    expect((await a.ag.put("/api/me/ssn", { ssn: "900-47-7777" })).status).toBe(200);
    const r = await b.ag.put("/api/me/ssn", { ssn: "900-47-7777" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("This number can't be used. Contact support.");
  });
  it("needs the password to change an SSN", async () => {
    const { ag, body } = await signedUp(h, "guardian");
    await ag.put("/api/me/ssn", { ssn: "900-66-1001" });
    const no = await ag.put("/api/me/ssn", { ssn: "900-66-1002" });
    expect(no.status).toBe(403);
    const yes = await ag.put("/api/me/ssn", { ssn: "900-66-1002", password: body.password });
    expect(yes.body.me.ssnLast4).toBe("1002");
  });
  it("detects tampered ciphertext", async () => {
    const { ag, id } = await signedUp(h, "elder");
    await ag.put("/api/me/ssn", { ssn: "900-21-2121" });
    const row = (await h.db.query<{ ssn_enc: string }>("SELECT ssn_enc FROM elders WHERE user_id = $1", [id])).rows[0];
    const parts = row.ssn_enc.split(".");
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(h.cfg, parts.join("."))).toThrow();
  });
});

describe("CC-186 bank account", () => {
  it("tokenizes, stores last four only, and charges no ACH fee", async () => {
    const g = await completeGuardian(h);
    const pm = (await g.ag.get("/api/me/payment-methods")).body;
    expect(pm.bankAccount).toMatchObject({ bankName: "Bank of America", accountType: "checking", accountLast4: "6789", routingLast4: "0000", achFeeCents: 0 });
    expect(pm.fees.achCents).toBe(0);
    const row = (await h.db.query<Record<string, unknown>>("SELECT * FROM bank_accounts WHERE user_id = $1", [g.id])).rows[0];
    expect(JSON.stringify(row)).not.toContain("000123456789");
    expect(JSON.stringify(row)).not.toContain("110000000");
    const vault = (await h.db.query<Record<string, unknown>>("SELECT metadata FROM vault_tokens WHERE owner_user_id = $1", [g.id])).rows;
    expect(JSON.stringify(vault)).not.toContain("000123456789");
  });
  it.each([
    [{ routingNumber: "021000021" }, "routingNumber", "test routing number 110000000"],
    [{ routingNumber: "123456789" }, "routingNumber", "valid 9-digit routing number"],
    [{ accountNumber: "123456789" }, "accountNumber", "starts with 000"],
    [{ accountNumber: "12" }, "accountNumber", "4 to 17 digits"],
    [{ accountType: "brokerage" }, "accountType", "checking or savings"],
    [{ bankName: "" }, "bankName", "bank's name"],
  ])("rejects %o", async (over, field, msg) => {
    const g = await signedUp(h, "guardian");
    const r = await g.ag.post("/vault/v1/bank-accounts", { bankName: "Chase", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking", ...over });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe(field);
    expect(r.body.error).toContain(msg);
  });
  it("replaces the bank account without ever leaving the guardian without one, and can't remove it", async () => {
    const g = await completeGuardian(h);
    const v = await g.ag.post("/vault/v1/bank-accounts", { bankName: "Wells Fargo", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000999888777", accountType: "savings" });
    const r = await g.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token });
    expect(r.body.bankAccount).toMatchObject({ bankName: "Wells Fargo", accountLast4: "8777" });
    expect((await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM bank_accounts WHERE user_id = $1", [g.id])).rows[0].n).toBe(1);
    expect((await g.ag.del("/api/me/payment-methods/bank-account")).status).toBe(409);
  });
  it("only the legal guardian manages payment methods", async () => {
    const c = await signedUp(h, "caregiver");
    expect((await c.ag.post("/vault/v1/bank-accounts", {})).status).toBe(403);
    expect((await c.ag.get("/api/me/payment-methods")).status).toBe(403);
  });
  it("won't accept another user's or a used vault token", async () => {
    const a = await signedUp(h, "guardian");
    const b = await signedUp(h, "guardian");
    const v = await a.ag.post("/vault/v1/bank-accounts", { bankName: "Chase", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking" });
    expect((await b.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token })).status).toBe(400);
    expect((await a.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token })).status).toBe(201);
    expect((await a.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token })).status).toBe(400);
  });
  it("vault tokens expire after 15 minutes", async () => {
    const a = await signedUp(h, "guardian");
    const v = await a.ag.post("/vault/v1/bank-accounts", { bankName: "Chase", holderName: "Sarah Lee", routingNumber: "110000000", accountNumber: "000123456789", accountType: "checking" });
    h.clock.t += 16 * 60_000;
    await a.ag.get("/api/me"); // keep the session alive check
    const r = await a.ag.post("/api/me/payment-methods/bank-account", { token: v.body.token });
    expect([400, 401]).toContain(r.status);
  });
});

describe("CC-187 / CC-188 cards", () => {
  const card = (number: string, over: Record<string, unknown> = {}) => ({ holderName: "Sarah Lee", number, expMonth: 12, expYear: 30, cvc: number.startsWith("37") ? "1234" : "123", postalCode: "94114", ...over });
  async function addCard(ag: Awaited<ReturnType<typeof signedUp>>["ag"], number: string, makePrimary = false) {
    const v = await ag.post("/vault/v1/cards", card(number));
    expect(v.status).toBe(201);
    return ag.post("/api/me/payment-methods/cards", { token: v.body.token, makePrimary });
  }
  it("first card is primary; stores brand, funding and last four only; never the CVC", async () => {
    const g = await completeGuardian(h);
    const r = await addCard(g.ag, "4000056655665556");
    expect(r.status).toBe(201);
    expect(r.body.cards[0]).toMatchObject({ brand: "visa", funding: "debit", last4: "5556", isPrimary: true, expMonth: 12, expYear: 2030 });
    const all = JSON.stringify((await h.db.query("SELECT * FROM payment_cards WHERE user_id = $1", [g.id])).rows) + JSON.stringify((await h.db.query("SELECT metadata FROM vault_tokens WHERE owner_user_id = $1", [g.id])).rows);
    expect(all).not.toContain("4000056655665556");
    expect(all).not.toMatch(/"cvc"/);
  });
  it("makes a new card primary on request, and promotes the newest when the primary is removed", async () => {
    const g = await completeGuardian(h);
    await addCard(g.ag, "4242424242424242");
    await addCard(g.ag, "5555555555554444");
    let r = await addCard(g.ag, "378282246310005", true);
    expect(r.body.cards.filter((c: { isPrimary: boolean }) => c.isPrimary).map((c: { last4: string }) => c.last4)).toEqual(["0005"]);
    const amex = r.body.cards[0];
    r = await g.ag.del(`/api/me/payment-methods/cards/${amex.id}`);
    expect(r.body.promoted).toEqual({ brandLabel: "Mastercard", last4: "4444" });
    expect(r.body.cards[0]).toMatchObject({ last4: "4444", isPrimary: true });
    const visa = r.body.cards.find((c: { last4: string }) => c.last4 === "4242");
    r = await g.ag.post(`/api/me/payment-methods/cards/${visa.id}/primary`);
    expect(r.body.cards[0]).toMatchObject({ last4: "4242", isPrimary: true });
    expect(r.body.cards.filter((c: { isPrimary: boolean }) => c.isPrimary).length).toBe(1);
    const tok = (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM vault_tokens WHERE owner_user_id = $1 AND revoked_at IS NOT NULL", [g.id])).rows[0].n;
    expect(tok).toBe(1);
  });
  it("allows at most 5 cards", async () => {
    const g = await completeGuardian(h);
    for (const n of ["4242424242424242", "4000056655665556", "5555555555554444", "5200828282828210", "6011111111111117"]) expect((await addCard(g.ag, n)).status).toBe(201);
    const v = await g.ag.post("/vault/v1/cards", card("378282246310005"));
    const r = await g.ag.post("/api/me/payment-methods/cards", { token: v.body.token });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("up to 5 cards");
  });
  it.each([
    [card("4111111111111111"), "number", "test environment"],
    [card("4242424242424241"), "number", "valid card number"],
    [card("4242424242424242", { expMonth: 9, expYear: 26 }), "expMonth", "This card has expired"],
    [card("4242424242424242", { cvc: "12" }), "cvc", "3-digit security code"],
    [card("4242424242424242", { postalCode: "941" }), "postalCode", "5-digit ZIP"],
  ])("vault rejects bad card %#", async (body, field, msg) => {
    const g = await signedUp(h, "guardian");
    const r = await g.ag.post("/vault/v1/cards", body);
    expect(r.status).toBe(400);
    expect(r.body.field).toBe(field);
    expect(r.body.error).toContain(msg);
  });
  it("other users get 404 for my card ids", async () => {
    const a = await completeGuardian(h);
    const r = await addCard(a.ag, "4242424242424242");
    const b = await completeGuardian(h);
    expect((await b.ag.del(`/api/me/payment-methods/cards/${r.body.cards[0].id}`)).status).toBe(404);
    expect((await b.ag.post(`/api/me/payment-methods/cards/${r.body.cards[0].id}/primary`)).status).toBe(404);
  });
});

describe("CC-185 activity and append-only audit trail", () => {
  it("shows my recent activity in plain language", async () => {
    const g = await completeGuardian(h);
    const r = await g.ag.get("/api/me/activity");
    const texts = r.body.events.map((e: { text: string }) => e.text);
    expect(texts).toContain("Bank account ending 6789 added");
    expect(texts.some((t: string) => /^Social Security number ending \d{4} added$/.test(t))).toBe(true);
    expect(texts).toContain("Account created");
  });
  it("blocks UPDATE and DELETE on audit_events", async () => {
    await expect(h.db.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(/append-only/);
    await expect(h.db.query("DELETE FROM audit_events")).rejects.toThrow(/append-only/);
  });
});

describe("CC-189 schema", () => {
  it("has the separate persona tables and masked views; re-running migrations changes nothing", async () => {
    const t = (await h.db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map((r) => r.table_name);
    for (const name of ["users", "sessions", "elders", "caregivers", "guardians", "photos", "bank_accounts", "payment_cards", "audit_events", "audit_people_masked", "audit_payment_methods_masked", "schema_migrations"]) expect(t).toContain(name);
    const { migrate } = await import("../migrate");
    expect(await migrate(h.db)).toEqual([]);
  });
  it("can't store a full number in a last-four column", async () => {
    const g = await completeGuardian(h);
    await expect(h.db.query("UPDATE bank_accounts SET account_last4 = '123456789' WHERE user_id = $1", [g.id])).rejects.toThrow();
  });
});
