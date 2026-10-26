// CC-183 production safety checks · CC-184 masked audit export.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAuditExport } from "../cli/audit-export";
import { ConfigError, loadConfig } from "../config";
import { createApp } from "../app";
import { completeGuardian, harness, signedUp } from "./helpers";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
const prod = { APP_ENV: "production", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_abc" };

describe("CC-183 production refuses to start without protection", () => {
  it("accepts a complete production configuration", () => {
    const c = loadConfig(prod);
    expect(c.isProd).toBe(true);
    expect(c.testData).toBe(false);
    expect(c.paymentProvider).toBe("stripe");
  });
  it.each([
    ["DATA_ENCRYPTION_KEY", { DATA_ENCRYPTION_KEY: "" }, /DATA_ENCRYPTION_KEY is required/],
    ["DATA_HMAC_KEY", { DATA_HMAC_KEY: "" }, /DATA_HMAC_KEY is required/],
    ["short key", { DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }, /must be 32 bytes/],
    ["same keys", { DATA_HMAC_KEY: k1 }, /must be different/],
    ["DATABASE_URL", { DATABASE_URL: "" }, /DATABASE_URL is required/],
    ["simulated payments", { PAYMENT_PROVIDER: "simulated" }, /PAYMENT_PROVIDER must be "stripe"/],
    ["test Stripe key", { STRIPE_SECRET_KEY: "sk_test_123" }, /live secret key/],
  ])("exits when %s is wrong", (_name, over, msg) => {
    expect(() => loadConfig({ ...prod, ...over })).toThrow(ConfigError);
    expect(() => loadConfig({ ...prod, ...over })).toThrow(msg);
  });
  it("treats a missing APP_ENV as development (test data only)", () => {
    const c = loadConfig({ DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 });
    expect(c.env).toBe("development");
    expect(c.testData).toBe(true);
  });
  it("staging needs stable keys but still accepts test data only", () => {
    expect(() => loadConfig({ APP_ENV: "staging" })).toThrow(/required in staging/);
    expect(() => loadConfig({ APP_ENV: "staging", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 })).toThrow(/DATABASE_URL is required in staging/);
    const c = loadConfig({ APP_ENV: "staging", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2, DATABASE_URL: "postgres://u:p@db.example.com/cc" });
    expect(c.testData).toBe(true);
    expect(c.paymentProvider).toBe("simulated");
  });
  it("never allows a live Stripe key outside production", () => {
    expect(() => loadConfig({ APP_ENV: "staging", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_x", DATA_ENCRYPTION_KEY: k1, DATA_HMAC_KEY: k2 })).toThrow(/live Stripe key/);
  });
  it("in production: Secure cookies, HSTS, and no simulated vault", async () => {
    const h = await harness();
    const app = createApp({ cfg: loadConfig(prod), db: h.db });
    const request = (await import("supertest")).default;
    const health = await request(app).get("/api/health");
    expect(health.headers["strict-transport-security"]).toContain("max-age=");
    expect((await request(app).post("/vault/v1/cards").set("X-Requested-With", "circle-care").send({})).status).toBe(404);
    const r = await request(app).post("/api/auth/signup").set("X-Requested-With", "circle-care").send({ role: "elder", firstName: "Ann", lastName: "Ito", phone: "4155550101", email: "ann@example.com", password: "a-long-enough-password", acceptTerms: true });
    expect(String(r.headers["set-cookie"])).toContain("Secure");
    await h.db.close();
  });
});

describe("CC-184 masked audit export", () => {
  it("writes masked files with a manifest, and nothing sensitive leaks", async () => {
    const h = await harness();
    const g = await completeGuardian(h);
    const v = await g.ag.post("/vault/v1/cards", { holderName: "Sarah Lee", number: "4242424242424242", expMonth: 12, expYear: 30, cvc: "123", postalCode: "94114" });
    await g.ag.post("/api/me/payment-methods/cards", { token: v.body.token });
    const e = await signedUp(h, "elder", { email: "margaret.lee@example.com" });
    await e.ag.put("/api/me/ssn", { ssn: "900-12-9999" });

    const out = mkdtempSync(join(tmpdir(), "cc-export-"));
    const r = await runAuditExport(h.db, h.cfg, { out, operator: "QA Agent", now: new Date("2026-10-30T12:00:00Z") });
    expect(readdirSync(out).sort()).toEqual(["audit_events.csv", "manifest.json", "payment_methods.csv", "people.csv"]);

    const people = readFileSync(join(out, "people.csv"), "utf8");
    expect(people).toContain("•••-••-9999");
    expect(people).toContain("m•••@example.com");
    expect(people).toContain("(•••) •••-");
    expect(people).toContain("Margaret L.");
    expect(people).not.toContain("margaret.lee@");
    const pm = readFileSync(join(out, "payment_methods.csv"), "utf8");
    expect(pm).toContain("••••6789");
    expect(pm).toContain("•••• 4242");

    const everything = readdirSync(out).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
    for (const secret of ["900129999", "900-12-9999", "000123456789", "110000000", "4242424242424242"]) expect(everything).not.toContain(secret);

    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    expect(manifest.operator).toBe("QA Agent");
    expect(manifest.files["people.csv"].sha256).toBe(r.files["people.csv"].sha256);
    expect(manifest.files["people.csv"].rows).toBe(2);
    const ev = (await h.db.query("SELECT 1 FROM audit_events WHERE action = 'audit.exported'")).rows;
    expect(ev.length).toBe(1);
    await h.db.close();
  });
  it("can include full names for a legal hold", async () => {
    const h = await harness();
    await signedUp(h, "caregiver", { firstName: "Ana", lastName: "Reyes" });
    const out = mkdtempSync(join(tmpdir(), "cc-export-"));
    await runAuditExport(h.db, h.cfg, { out, fullNames: true });
    expect(readFileSync(join(out, "people.csv"), "utf8")).toContain("Ana Reyes");
    await h.db.close();
  });
});
