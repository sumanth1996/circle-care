// CC-204 Shared rate limits. These tests run with RATE_LIMITS=on, so they
// exercise the real limiter and its Postgres store (the bulk API suite keeps
// the test environment's opt-out).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { ConfigError, loadConfig } from "../config";
import { bucket, hit, pruneRateLimits } from "../ratelimit";
import { harness, makeAgent, signedUp, type Harness } from "./helpers";

const SLOW_DB = { timeout: 30_000 };
let h: Harness;
beforeAll(async () => { h = await harness({ RATE_LIMITS: "on" }); });
afterAll(async () => { await h.db.close(); });

const post = (app: ReturnType<typeof createApp>, url: string, xff?: string) => {
  const r = request(app).post(url).set("X-Requested-With", "circle-care");
  if (xff) r.set("X-Forwarded-For", xff);
  return r.send({});
};

describe("CC-204 one shared store for every instance", () => {
  it("two app instances on one database share a sign-up bucket", SLOW_DB, async () => {
    const other = createApp({ cfg: h.cfg, db: h.db, now: () => new Date(h.clock.t) });
    const ip = "203.0.113.10";
    // 10 sign-ups an hour per address, split across the two instances.
    for (let i = 0; i < 10; i++) expect((await post(i % 2 ? other : h.app, "/api/auth/signup", ip)).status).toBe(400);
    const over = await post(other, "/api/auth/signup", ip);
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("Too many sign-ups from this network. Please try again later.");
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(3000);
    expect((await post(h.app, "/api/auth/signup", ip)).status).toBe(429);
    // The count lives in Postgres, not in either process.
    const row = (await h.db.query<{ count: number }>("SELECT count FROM rate_limits WHERE key = $1", [bucket("signup", ip)])).rows[0];
    expect(row.count).toBe(12);
  });

  it("the count is atomic: 25 parallel requests against a limit of 10 let exactly 10 through", SLOW_DB, async () => {
    const ip = "203.0.113.11";
    const rs = await Promise.all(Array.from({ length: 25 }, () => post(h.app, "/api/auth/signup", ip)));
    expect(rs.filter((r) => r.status === 400).length).toBe(10);
    expect(rs.filter((r) => r.status === 429).length).toBe(15);
  });

  it("a bucket opens again when its window ends, and expired buckets are deleted", SLOW_DB, async () => {
    const ip = "203.0.113.12";
    for (let i = 0; i < 10; i++) await post(h.app, "/api/auth/signup", ip);
    expect((await post(h.app, "/api/auth/signup", ip)).status).toBe(429);
    h.clock.t += 61 * 60_000;
    expect((await post(h.app, "/api/auth/signup", ip)).status).toBe(400);
    const before = (await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM rate_limits WHERE reset_at <= $1", [new Date(h.clock.t)])).rows[0].n;
    expect(before).toBeGreaterThan(0);
    expect(await pruneRateLimits(h.db, new Date(h.clock.t))).toBe(before);
    expect((await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM rate_limits WHERE reset_at <= $1", [new Date(h.clock.t)])).rows[0].n).toBe(0);
  });

  it("hit() restarts the count after the window", async () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    expect((await hit(h.db, "unit:a", 1000, t0)).count).toBe(1);
    expect((await hit(h.db, "unit:a", 1000, new Date(t0.getTime() + 500))).count).toBe(2);
    const fresh = await hit(h.db, "unit:a", 1000, new Date(t0.getTime() + 1000));
    expect(fresh.count).toBe(1);
    expect(fresh.resetAt.getTime()).toBe(t0.getTime() + 2000);
  });

  it("stores a hash of the address, never the address itself", async () => {
    await post(h.app, "/api/auth/signup", "203.0.113.99");
    const keys = (await h.db.query<{ key: string }>("SELECT key FROM rate_limits")).rows.map((r) => r.key);
    expect(keys.some((k) => k.includes("203.0.113.99"))).toBe(false);
  });
});

describe("CC-204 only the hosting proxy's address is trusted", () => {
  it("a forged left-most X-Forwarded-For entry lands in the same bucket", SLOW_DB, async () => {
    // The proxy appends the real client address on the right; anything to its left came from the client.
    const proxySaw = "203.0.113.20";
    for (let i = 0; i < 10; i++) expect((await post(h.app, "/api/auth/signup", `10.9.8.${i}, ${proxySaw}`)).status).toBe(400);
    expect((await post(h.app, "/api/auth/signup", `192.0.2.77, ${proxySaw}`)).status).toBe(429);
    expect((await post(h.app, "/api/auth/signup", `1.1.1.1, 8.8.8.8, ${proxySaw}`)).status).toBe(429);
    // A different address seen by the proxy is a different client.
    expect((await post(h.app, "/api/auth/signup", `192.0.2.77, 203.0.113.21`)).status).toBe(400);
  });

  it("with TRUST_PROXY_HOPS=0 the header is ignored entirely", SLOW_DB, async () => {
    const h0 = await harness({ RATE_LIMITS: "on", TRUST_PROXY_HOPS: "0" });
    for (let i = 0; i < 10; i++) expect((await post(h0.app, "/api/auth/signup", `198.18.0.${i}`)).status).toBe(400);
    expect((await post(h0.app, "/api/auth/signup", "198.18.0.200")).status).toBe(429);
    await h0.db.close();
  });

  it("validates TRUST_PROXY_HOPS and RATE_LIMITS", () => {
    expect(loadConfig({ APP_ENV: "test" }).trustProxyHops).toBe(1);
    expect(loadConfig({ APP_ENV: "test", TRUST_PROXY_HOPS: "2" }).trustProxyHops).toBe(2);
    for (const bad of ["abc", "-1", "1.5", "9", ""]) expect(() => loadConfig({ APP_ENV: "test", TRUST_PROXY_HOPS: bad })).toThrow(ConfigError);
    expect(loadConfig({ APP_ENV: "test" }).rateLimits).toBe(false);
    expect(loadConfig({ APP_ENV: "test", RATE_LIMITS: "on" }).rateLimits).toBe(true);
    expect(loadConfig({ APP_ENV: "development" }).rateLimits).toBe(true);
    expect(() => loadConfig({ APP_ENV: "development", RATE_LIMITS: "off" })).toThrow(/only allowed in the test environment/);
    expect(() => loadConfig({ APP_ENV: "test", RATE_LIMITS: "maybe" })).toThrow(ConfigError);
  });
});

describe("CC-204 per-account limits on SSN, profile, photo and payment routes", () => {
  it("SSN: the 11th save in an hour is refused with Retry-After and one audit event without the number", SLOW_DB, async () => {
    const e = await signedUp(h, "elder");
    for (let i = 0; i < 10; i++) expect((await e.ag.put("/api/me/ssn", { ssn: "212-55-1234" })).status).toBe(400);
    const over = await e.ag.put("/api/me/ssn", { ssn: "900-12-3456" });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("rate_limited");
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
    expect((await e.ag.put("/api/me/ssn", { ssn: "900-12-3456" })).status).toBe(429);
    const ev = (await h.db.query<{ detail: unknown }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = 'ratelimit.exceeded'", [e.id])).rows;
    expect(ev.length).toBe(1);
    expect(JSON.stringify(ev[0].detail)).toBe('{"limit":"ssn"}');
    // The limit is per account: another account from the same address is not affected.
    const other = await signedUp(h, "elder");
    expect((await other.ag.put("/api/me/ssn", { ssn: "212-55-1234" })).status).toBe(400);
    // Shown to the owner in plain language.
    const act = await e.ag.get("/api/me/activity");
    expect(act.body.events.map((x: { text: string }) => x.text)).toContain("Too many Social Security number changes in a short time — paused for a while");
  });

  it("profile: 30 changes an hour", SLOW_DB, async () => {
    const e = await signedUp(h, "elder");
    for (let i = 0; i < 30; i++) expect((await e.ag.patch("/api/me", { phone: "12" })).status).toBe(400);
    expect((await e.ag.patch("/api/me", { firstName: "Maggie" })).status).toBe(429);
    expect((await e.ag.get("/api/me")).status).toBe(200); // reading isn't limited
  });

  it("photo: 20 changes an hour", SLOW_DB, async () => {
    const e = await signedUp(h, "elder");
    for (let i = 0; i < 20; i++) expect((await e.ag.del("/api/me/photo")).status).toBe(200);
    const r = await e.ag.del("/api/me/photo");
    expect(r.status).toBe(429);
    expect(r.headers["retry-after"]).toBeDefined();
  });

  it("payment methods: 30 changes an hour; the list can still be read", SLOW_DB, async () => {
    const g = await signedUp(h, "guardian");
    for (let i = 0; i < 30; i++) expect((await g.ag.post("/api/me/payment-methods/cards/00000000-0000-0000-0000-000000000000/primary")).status).toBe(404);
    expect((await g.ag.post("/api/me/payment-methods/cards/00000000-0000-0000-0000-000000000000/primary")).status).toBe(429);
    expect((await g.ag.get("/api/me/payment-methods")).status).toBe(200);
    const ev = (await h.db.query<{ detail: unknown }>("SELECT detail FROM audit_events WHERE subject_user_id = $1 AND action = 'ratelimit.exceeded'", [g.id])).rows;
    expect(ev.map((e) => JSON.stringify(e.detail))).toEqual(['{"limit":"payments"}']);
  });

  it("sign-in from one address is limited to 30 in 10 minutes", SLOW_DB, async () => {
    const ag = makeAgent(h.app, "203.0.113.30");
    for (let i = 0; i < 30; i++) expect((await ag.post("/api/auth/signin", { email: "nobody@example.com", password: "x" })).status).toBe(401);
    expect((await ag.post("/api/auth/signin", { email: "nobody@example.com", password: "x" })).status).toBe(429);
  });
});
