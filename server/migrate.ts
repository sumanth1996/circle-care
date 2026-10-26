// Versioned migrations (CC-189): each file in server/migrations runs once,
// in name order, inside a transaction, and is recorded in schema_migrations.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(db: Db): Promise<string[]> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(DIR, f), "utf8");
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}
