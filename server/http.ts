// Small HTTP helpers shared by the route modules.

import type { NextFunction, Request, RequestHandler, Response } from "express";

// Rate limits moved to a shared Postgres store in CC-204: see ratelimit.ts.

/** An error that is safe to show the user. `field` points the form at the right input. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string, public fields?: Record<string, string>, public code?: string) {
    super(message);
  }
}

export const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, field: err.field, fields: err.fields, code: err.code });
    return;
  }
  const e = err as { type?: string; status?: number; code?: string };
  // Unique-index race on real Postgres (two identical requests at once): a conflict, not a crash.
  if (e?.code === "23505") { res.status(409).json({ error: "That was already saved. Please refresh and try again." }); return; }
  if (e?.type === "entity.too.large") { res.status(413).json({ error: "That file is too large. Photos must be 2 MB or smaller." }); return; }
  if (e?.type === "entity.parse.failed") { res.status(400).json({ error: "We couldn't read that request." }); return; }
  // Never log request bodies: they may contain SSNs or account numbers.
  console.error("[api] unexpected error:", err instanceof Error ? err.message : "unknown");
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

/** Reads one cookie without a dependency. */
export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");
