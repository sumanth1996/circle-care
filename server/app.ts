// The Circle Care API (CC-190). One Express app serves:
//   /api/...    accounts, profiles, payments
//   /vault/v1   the simulated payment vault (never in production)
// plus security headers. index.ts adds static hosting for production.

import express, { type Express } from "express";
import { accountRouter } from "./account";
import { authRouter, sessionMiddleware, type Deps } from "./auth";
import type { Config } from "./config";
import type { Db } from "./db";
import { errorHandler, HttpError } from "./http";
import { paymentsRouter } from "./payments";
import { TEST_CARDS, TEST_ROUTING } from "../src/lib/validation";
import { vaultRouter } from "./vault";

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "frame-src blob:",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function createApp(opts: { cfg: Config; db: Db; now?: () => Date; dev?: boolean }): Express {
  const d: Deps = { cfg: opts.cfg, db: opts.db, now: opts.now ?? (() => new Date()) };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Replit and most hosts sit behind one proxy

  app.use((req, res, next) => {
    if (!opts.dev) res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "geolocation=(), camera=(), payment=(self)");
    if (d.cfg.isProd) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    if (req.path.startsWith("/api") || req.path.startsWith("/vault")) res.setHeader("Cache-Control", "no-store");
    next();
  });

  // CSRF: browsers can't add custom headers cross-site without a CORS preflight,
  // which this API never grants. Together with SameSite=Strict cookies this
  // blocks cross-site requests that change data (CC-174).
  app.use(["/api", "/vault"], (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("X-Requested-With") !== "circle-care") return next(new HttpError(403, "This request was blocked for your security. Please reload the page."));
    next();
  });

  app.use(["/api", "/vault"], express.json({ limit: "32kb" }), sessionMiddleware(d));

  app.get("/api/health", (_req, res) => { res.json({ ok: true, env: d.cfg.env, db: d.db.kind === "postgres" ? "postgres" : "embedded" }); });
  app.get("/api/config", (_req, res) => {
    res.json({
      env: d.cfg.env,
      testData: d.cfg.testData,
      paymentProvider: d.cfg.paymentProvider,
      achFeeCents: d.cfg.achFeeCents,
      testValues: d.cfg.testData ? {
        ssn: "900-12-3456",
        routingNumber: TEST_ROUTING,
        accountNumber: "000123456789",
        cards: Object.entries(TEST_CARDS).map(([number, c]) => ({ number, label: c.label })),
      } : undefined,
    });
  });

  app.use("/api/auth", authRouter(d));
  app.get("/api/auth/me", (req, res) => {
    if (!req.user) { res.status(401).json({ error: "Please sign in.", code: res.locals.sessionExpired ? "session_expired" : "signed_out" }); return; }
    res.json({ user: req.user });
  });
  app.use("/api/me/payment-methods", paymentsRouter(d));
  app.use("/api/me", accountRouter(d));

  if (!d.cfg.isProd && d.cfg.paymentProvider === "simulated") app.use("/vault/v1", vaultRouter(d));
  app.use(["/api", "/vault"], (_req, res) => { res.status(404).json({ error: "Not found" }); });
  app.use(errorHandler);
  return app;
}
