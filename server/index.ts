// Production / Replit deployment entry point (CC-190):
//   npm run build && npm start
// Serves the built React app and the API from one Node process on $PORT.

import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
import { CLEANUP_EVERY_MS, cleanupExpired } from "./cleanup";
import { ConfigError, loadConfig } from "./config";
import { openDb } from "./db";
import { migrate } from "./migrate";

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) { console.error(e.message); process.exit(1); }
    throw e;
  }
  for (const w of cfg.warnings) console.warn(`[circle-care] warning: ${w}`);
  const db = await openDb(cfg);
  const applied = await migrate(db);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(", ")}`);

  // CC-201: delete expired sessions, reset tokens, sign-in challenges and rate-limit
  // buckets now and once a day. unref() so the timer never keeps the process alive.
  const sweep = async () => {
    try {
      const r = await cleanupExpired(db, cfg, new Date());
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      if (total) console.log(`[cleanup] removed ${Object.entries(r).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    } catch (e) {
      console.error("[cleanup] failed:", e instanceof Error ? e.message : "unknown");
    }
  };
  await sweep();
  setInterval(() => { void sweep(); }, CLEANUP_EVERY_MS).unref();

  const app = createApp({ cfg, db });
  const dist = join(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: "index.html", maxAge: "1h", setHeaders: (res, path) => { if (path.endsWith("index.html") || path.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api|vault).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
  }
  app.listen(cfg.port, "0.0.0.0", () => console.log(`[circle-care] ${cfg.env} server on :${cfg.port} (database: ${db.kind}${cfg.testData ? ", test data only" : ""})`));
}

main().catch((e) => { console.error("[circle-care] failed to start:", e instanceof Error ? e.message : e); process.exit(1); });
