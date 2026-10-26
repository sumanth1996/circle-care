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

export async function openDb(cfg: Config, opts: { memory?: boolean } = {}): Promise<Db> {
  if (cfg.databaseUrl && !opts.memory) {
    const { default: pg } = await import("pg");
    const ssl = /sslmode=disable/.test(cfg.databaseUrl) || /localhost|127\.0\.0\.1/.test(cfg.databaseUrl) ? undefined : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 10 });
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
