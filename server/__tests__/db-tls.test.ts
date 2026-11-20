// CC-203: the API verifies the database server's TLS certificate.
import { afterEach, describe, expect, it, vi } from "vitest";

const pools: { opts: Record<string, unknown>; ended: boolean }[] = [];
let failWith: unknown = null;

vi.mock("pg", () => {
  class Pool {
    rec: { opts: Record<string, unknown>; ended: boolean };
    constructor(opts: Record<string, unknown>) { this.rec = { opts, ended: false }; pools.push(this.rec); }
    async query() { if (failWith) throw failWith; return { rows: [{ "?column?": 1 }] }; }
    async connect() { throw new Error("not used"); }
    async end() { this.rec.ended = true; }
  }
  return { default: { Pool } };
});

const { explainConnectError, isLocalDb, isReplitDevDb, openDb, pgConnection } = await import("../db");
const { loadConfig } = await import("../config");

afterEach(() => { pools.length = 0; failWith = null; });

describe("CC-203: database TLS", () => {
  it("requires TLS and verifies the certificate for a remote database", () => {
    const c = pgConnection("postgres://app:pw@db.example.com:5432/cc");
    expect(c.ssl).toEqual({ rejectUnauthorized: true });
    expect(c.connectionString).toBe("postgres://app:pw@db.example.com:5432/cc");
  });

  it("removes URL settings that would switch the certificate check off", () => {
    for (const q of ["sslmode=no-verify", "sslmode=require", "sslmode=prefer&sslrootcert=/tmp/x.pem", "ssl=true&uselibpqcompat=true"]) {
      const c = pgConnection(`postgres://app:pw@db.example.com/cc?${q}&application_name=cc`);
      expect(c.ssl).toEqual({ rejectUnauthorized: true });
      expect(c.connectionString).toBe("postgres://app:pw@db.example.com/cc?application_name=cc");
    }
  });

  it("refuses to turn TLS off for a remote database", () => {
    expect(() => pgConnection("postgres://app:pw@db.example.com/cc?sslmode=disable")).toThrow(/sslmode=disable/);
  });

  it("uses the provider's CA certificate when one is given", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    expect(pgConnection("postgres://app:pw@db.example.com/cc", ca).ssl).toEqual({ rejectUnauthorized: true, ca });
    expect(loadConfig({ APP_ENV: "test", DATABASE_CA_CERT: ca }).databaseCaCert).toBe(ca);
  });

  it("doesn't need TLS for a database on this machine", () => {
    for (const url of [
      "postgres://app@localhost:5432/cc",
      "postgres://app@127.0.0.1/cc?sslmode=disable",
      "postgres://app@[::1]/cc",
      "postgres://app@helium/cc?sslmode=disable",
    ]) {
      expect(isLocalDb(url)).toBe(true);
      expect(pgConnection(url)).toEqual({ connectionString: url });
    }
    expect(isLocalDb("postgres://app@localhost.evil.example/cc")).toBe(false);
    expect(isLocalDb("postgres://app@helium.evil.example/cc")).toBe(false);
  });

  it("checks the host node-postgres really connects to, not just the URL's host", () => {
    // A host parameter wins over the URL's host in node-postgres, so it can't pass a remote server off as local.
    for (const url of ["postgres://u:p@localhost/x?host=db.evil.example", "postgres:///x?host=db.evil.example"]) {
      expect(isLocalDb(url, {})).toBe(false);
      expect(pgConnection(url, undefined, {}).ssl).toEqual({ rejectUnauthorized: true });
    }
    // An empty host means PGHOST, which Replit points at its remote database.
    expect(isLocalDb("postgres:///cc", { PGHOST: "ep-cool-db.us-east-2.aws.neon.tech" })).toBe(false);
    expect(pgConnection("postgres:///cc", undefined, { PGHOST: "db.example.com" }).ssl).toEqual({ rejectUnauthorized: true });
    // With nothing set it is localhost, and a unix socket is local too.
    expect(isLocalDb("postgres:///cc", {})).toBe(true);
    expect(isLocalDb("postgres:///cc?host=/var/run/postgresql", {})).toBe(true);
    expect(isLocalDb("postgres://u@localhost/cc?host=localhost", {})).toBe(true);
  });

  it("allows Replit's built-in development database (host helium) without TLS, only on Replit", () => {
    const onReplit = { REPL_ID: "test-repl" };
    const url = "postgresql://postgres:pw@helium/heliumdb?sslmode=disable";
    expect(isReplitDevDb(url, onReplit)).toBe(true);
    expect(pgConnection(url, undefined, onReplit)).toEqual({ connectionString: url });
    // An empty host falls back to PGHOST, which Replit sets to helium for its dev database.
    expect(isReplitDevDb("postgresql:///heliumdb?sslmode=disable", { ...onReplit, PGHOST: "helium" })).toBe(true);
  });

  it("keeps the TLS check for every other host, and for helium off Replit", () => {
    const onReplit = { REPL_ID: "test-repl" };
    // Not on Replit: the exception doesn't apply.
    expect(isReplitDevDb("postgresql://postgres:pw@helium/heliumdb", {})).toBe(false);
    expect(() => pgConnection("postgresql://postgres:pw@helium/heliumdb?sslmode=disable", undefined, {})).toThrow(/sslmode=disable/);
    // On Replit, but a look-alike or other host.
    for (const url of [
      "postgres://u:p@helium.evil.example/x?sslmode=disable",
      "postgres://u:p@heliumdb/x?sslmode=disable",
      "postgres://u:p@ep-cool-db.us-east-2.aws.neon.tech/x?sslmode=disable",
      "postgres://u:p@helium/x?host=db.evil.example&sslmode=disable",
    ]) {
      expect(isReplitDevDb(url, onReplit)).toBe(false);
      expect(() => pgConnection(url, undefined, onReplit)).toThrow(/sslmode=disable/);
    }
    // A Neon URL on Replit still gets verified TLS.
    expect(pgConnection("postgres://u:p@ep-cool-db.us-east-2.aws.neon.tech/x?sslmode=require", undefined, onReplit).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("stops at start-up with a clear message when the certificate can't be verified", async () => {
    failWith = Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
    const cfg = loadConfig({ APP_ENV: "test", DATABASE_URL: "postgres://app:pw@db.example.com/cc" });
    await expect(openDb(cfg)).rejects.toThrow(/couldn't be verified.*DATABASE_CA_CERT/s);
    expect(pools[0].opts.ssl).toEqual({ rejectUnauthorized: true });
    expect(pools[0].ended).toBe(true);
  });

  it("connects when the certificate is good", async () => {
    const cfg = loadConfig({ APP_ENV: "test", DATABASE_URL: "postgres://app:pw@db.example.com/cc" });
    const db = await openDb(cfg);
    expect(db.kind).toBe("postgres");
    expect(pools[0].ended).toBe(false);
  });

  it("explains other connection failures without hiding them", () => {
    expect(explainConnectError(new Error("ECONNREFUSED")).message).toMatch(/Couldn't connect to the database: ECONNREFUSED/);
  });
});
