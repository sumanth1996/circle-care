// Development: Vite loads this module and mounts the API on its own server,
// so `npm run dev` serves the app and /api on one port (5000) with hot reload.

import type { Express } from "express";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { migrate } from "./migrate";

const g = globalThis as unknown as { __ccDevApp?: Promise<Express> };

export function getDevApp(): Promise<Express> {
  g.__ccDevApp ??= (async () => {
    const cfg = loadConfig();
    const db = await openDb(cfg);
    const applied = await migrate(db);
    if (applied.length) console.log(`[db] applied migrations: ${applied.join(", ")}`);
    console.log(`[api] ${cfg.env} API ready (database: ${db.kind}, test data only)`);
    return createApp({ cfg, db, dev: true });
  })();
  return g.__ccDevApp;
}
