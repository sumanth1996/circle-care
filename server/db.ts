// Database access (CC-189). PostgreSQL everywhere:
// - DATABASE_URL set (Replit PostgreSQL, Neon, RDS) → node-postgres pool.
// - otherwise, development/test → PGlite, a real Postgres compiled to WASM,
//   stored in .data/pglite (or in memory for tests).

import type { Config } from "./config";

export type Row = Record<string, unknown>;
export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs several statements with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}
export interface Db extends Queryable {
  kind: "postgres" | "embedded";
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "helium"];

/** The host node-postgres will really connect to, lower-cased; undefined if the URL won't parse. */
function dbHost(url: string, env: Record<string, string | undefined>): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  return ((u.searchParams.get("host") ?? decodeURIComponent(u.hostname)) || env.PGHOST || "localhost").toLowerCase();
}

/**
 * True for local databases and Replit's built-in development database (helium), where TLS isn't needed.
 * It checks the host node-postgres will actually use: a `host` query parameter wins over the URL's host,
 * and an empty host falls back to PGHOST (which Replit points at its remote database), then to localhost.
 * A unix socket path is local.
 */
export function isLocalDb(url: string, env: Record<string, string | undefined> = process.env): boolean {
  const host = dbHost(url, env);
  return !!host && (host.startsWith("/") || LOCAL_HOSTS.includes(host));
}

/**
 * True for Replit's built-in development database. Replit gives every Repl a PostgreSQL server at the
 * bare host name "helium" on the Repl's private network, and its DATABASE_URL ends in sslmode=disable
 * because that server doesn't offer TLS. We allow it only when the app is running on Replit (REPL_ID
 * is set) and the host is exactly "helium", so no other host can borrow the exception.
 */
export function isReplitDevDb(url: string, env: Record<string, string | undefined> = process.env): boolean {
  return !!env.REPL_ID && dbHost(url, env) === "helium";
}

// Query parameters that would change how node-postgres sets up TLS. They are
// read from the URL after our own `ssl` option, so a remote URL that says
// sslmode=no-verify could quietly turn certificate checks off again (CC-203).
const TLS_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "sslpassword", "uselibpqcompat"];

/**
 * How to connect (CC-203): a remote database always uses TLS and the server's
 * certificate is verified against the system CAs, plus DATABASE_CA_CERT if the
 * provider uses its own CA. A local database connects without TLS.
 */
export function pgConnection(url: string, ca?: string, env: Record<string, string | undefined> = process.env): { connectionString: string; ssl?: { rejectUnauthorized: true; ca?: string } } {
  if (isLocalDb(url, env) || isReplitDevDb(url, env)) return { connectionString: url };
  const u = new URL(url);
  if (u.searchParams.get("sslmode") === "disable") {
    throw new Error("DATABASE_URL turns TLS off (sslmode=disable) for a remote database. Remove sslmode=disable: Circle Care only connects to a remote database over verified TLS. (Replit's built-in development database at host \"helium\" is the one exception, and only when running on Replit.)");
  }
  for (const p of TLS_PARAMS) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true } };
}

/** Turns a TLS failure at start-up into a message an operator can act on. */
export function explainConnectError(err: unknown): Error {
  const e = err as { code?: string; message?: string };
  const tls = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|DEPTH_ZERO|HOSTNAME/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`);
  if (tls) return new Error(`The database's TLS certificate couldn't be verified (${e?.code ?? "TLS error"}). Circle Care won't connect to a database it can't verify. If your provider uses its own certificate authority, put its CA certificate (PEM) in DATABASE_CA_CERT.`);
  return new Error(`Couldn't connect to the database: ${e?.message ?? "unknown error"}`);
}

export async function openDb(cfg: Config, opts: { memory?: boolean } = {}): Promise<Db> {
  if (cfg.databaseUrl && !opts.memory) {
    const { default: pg } = await import("pg");
    const conn = pgConnection(cfg.databaseUrl, cfg.databaseCaCert);
    const pool = new pg.Pool({ ...conn, max: 10 });
    // Connect once now, so a certificate that can't be verified stops the
    // server before it listens instead of failing on the first request.
    try { await pool.query("SELECT 1"); } catch (err) { await pool.end().catch(() => undefined); throw explainConnectError(err); }
    const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
      query: async <T extends Row>(s: string, p?: unknown[]) => ({ rows: (await c.query(s, p)).rows as T[] }),
      exec: async (s: string) => { await c.query(s); },
    });
    return {
      kind: "postgres",
      ...wrap(pool),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn(wrap(client));
          await client.query("COMMIT");
          return out;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  if (cfg.isProd) throw new Error("The embedded database is not allowed in production.");
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = opts.memory || cfg.env === "test" ? new PGlite() : new PGlite(`${cfg.dataDir}/pglite`);
  await lite.waitReady;
  type LiteLike = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> };
  const wrap = (c: LiteLike): Queryable => ({
    query: async <T extends Row>(s: string, p?: unknown[]) => ({ rows: (await c.query(s, p)).rows as T[] }),
    exec: async (s: string) => { await c.exec(s); },
  });
  // PGlite runs one connection, so serialise transactions to keep them isolated.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    kind: "embedded",
    ...wrap(lite as unknown as LiteLike),
    tx(fn) {
      const run = chain.then(() => lite.transaction((t) => fn(wrap(t as unknown as LiteLike))));
      chain = run.catch(() => undefined);
      return run;
    },
    close: () => lite.close(),
  };
}
