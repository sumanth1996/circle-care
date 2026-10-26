// Production / Replit deployment entry point (CC-190):
//   npm run build && npm start
// Serves the built React app and the API from one Node process on $PORT.

import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
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
  const db = await openDb(cfg);
  const applied = await migrate(db);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(", ")}`);

  const app = createApp({ cfg, db });
  const dist = join(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: "index.html", maxAge: "1h", setHeaders: (res, path) => { if (path.endsWith("index.html") || path.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api|vault).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
  }
  app.listen(cfg.port, "0.0.0.0", () => console.log(`[circle-care] ${cfg.env} server on :${cfg.port} (database: ${db.kind}${cfg.testData ? ", test data only" : ""})`));
}

main().catch((e) => { console.error("[circle-care] failed to start:", e instanceof Error ? e.message : e); process.exit(1); });
