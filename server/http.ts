// Small HTTP helpers shared by the route modules.

import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An error that is safe to show the user. `field` points the form at the right input. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, field: err.field, fields: err.fields });
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === "entity.too.large") { res.status(413).json({ error: "That file is too large. Photos must be 2 MB or smaller." }); return; }
  if (e?.type === "entity.parse.failed") { res.status(400).json({ error: "We couldn't read that request." }); return; }
  // Never log request bodies: they may contain SSNs or account numbers.
  console.error("[api] unexpected error:", err instanceof Error ? err.message : "unknown");
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

/** Fixed-window rate limiter kept in memory (one instance per server). */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string; message?: string; now?: () => number }): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  const now = opts.now ?? Date.now;
  return (req, res, next) => {
    const k = opts.key ? opts.key(req) : req.ip ?? "unknown";
    const t = now();
    const h = hits.get(k);
    if (!h || h.reset <= t) hits.set(k, { count: 1, reset: t + opts.windowMs });
    else if (++h.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - t) / 1000));
      res.status(429).json({ error: opts.message ?? "Too many requests. Please wait a few minutes and try again." });
      return;
    }
    next();
  };
}

/** Reads one cookie without a dependency. */
export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");
