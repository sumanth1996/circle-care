// Shared rate limits (CC-204). Counts live in Postgres, so every server
// instance (the deploy is autoscale) shares them and a restart doesn't reset
// them. Each hit is one atomic upsert: two instances can't both read "29" and
// both let the 31st request through.

import type { Request, RequestHandler } from "express";
import { audit } from "./audit";
import type { Config } from "./config";
import { sha256 } from "./crypto";
import type { Db, Queryable } from "./db";

export interface Hit { count: number; resetAt: Date }

/** Counts one hit against `key` in a fixed window and returns the new count. Safe under concurrency. */
export async function hit(q: Queryable, key: string, windowMs: number, now: Date): Promise<Hit> {
  const { rows } = await q.query<{ count: number; reset_at: Date }>(
    `INSERT INTO rate_limits (key, reset_at, count) VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE SET
       count    = CASE WHEN rate_limits.reset_at <= $3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= $3 THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [key, new Date(now.getTime() + windowMs), now],
  );
  return { count: rows[0].count, resetAt: new Date(rows[0].reset_at) };
}

/** Reads a bucket without counting. Expired buckets read as empty. */
export async function peek(q: Queryable, key: string, now: Date): Promise<Hit | null> {
  const r = (await q.query<{ count: number; reset_at: Date }>("SELECT count, reset_at FROM rate_limits WHERE key = $1 AND reset_at > $2", [key, now])).rows[0];
  return r ? { count: r.count, resetAt: new Date(r.reset_at) } : null;
}

/** Clears a bucket (e.g. after a correct code). */
export async function clearHits(q: Queryable, key: string) {
  await q.query("DELETE FROM rate_limits WHERE key = $1", [key]);
}

/** Deletes every bucket whose window has passed. Returns how many were removed. */
export async function pruneRateLimits(q: Queryable, now: Date): Promise<number> {
  const { rows } = await q.query("DELETE FROM rate_limits WHERE reset_at <= $1 RETURNING key", [now]);
  return rows.length;
}

/** Bucket key for a limit and a subject (address or account id). Hashed, so raw addresses aren't stored. */
export const bucket = (name: string, subject: string) => `${name}:${sha256(subject).slice(0, 40)}`;

export const retryAfterSeconds = (h: Hit, now: Date) => Math.max(1, Math.ceil((h.resetAt.getTime() - now.getTime()) / 1000));

// Opportunistic pruning: every PRUNE_EVERY counted requests in this process, expired
// buckets are deleted, so storage stays small between the daily cleanups (CC-201).
const PRUNE_EVERY = 200;
let sincePrune = 0;

export interface LimitOpts {
  /** Short name used in the bucket key and the audit event, e.g. "signin". */
  name: string;
  windowMs: number;
  max: number;
  /** "ip" uses the address Express derives with `trust proxy`; "user" the signed-in account. */
  by: "ip" | "user";
  message?: string;
  /** Write a `ratelimit.exceeded` audit event the first time an account goes over in a window. */
  auditOnExceed?: boolean;
  /** Only count these methods (default: all). */
  methods?: string[];
}

const DEFAULT_MESSAGE = "Too many requests. Please wait a few minutes and try again.";

/**
 * Express middleware for a shared limit. In the test environment limits are off
 * unless RATE_LIMITS=on, so the bulk API suite can create hundreds of accounts
 * from one address; the limiter's own tests turn them on.
 */
export function limit(d: { cfg: Config; db: Db; now: () => Date }, o: LimitOpts): RequestHandler {
  if (!d.cfg.rateLimits) return (_req, _res, next) => next();
  return (req, res, next) => {
    if (o.methods && !o.methods.includes(req.method)) return next();
    const subject = subjectOf(req, o.by);
    if (!subject) return next();
    const now = d.now();
    (async () => {
      const h = await hit(d.db, bucket(o.name, subject), o.windowMs, now);
      if (++sincePrune >= PRUNE_EVERY) { sincePrune = 0; await pruneRateLimits(d.db, now); }
      if (h.count <= o.max) return next();
      // Audit once per window (the first request over the limit), so a flood can't flood the audit log too.
      // Only the limit's name is recorded: never the request body, parameters or address.
      if (o.auditOnExceed && o.by === "user" && h.count === o.max + 1) {
        await audit(d.db, { action: "ratelimit.exceeded", actor: req.user!.id, detail: { limit: o.name }, at: now });
      }
      res.setHeader("Retry-After", String(retryAfterSeconds(h, now)));
      res.status(429).json({ error: o.message ?? DEFAULT_MESSAGE, code: "rate_limited" });
    })().catch(next);
  };
}

function subjectOf(req: Request, by: "ip" | "user"): string | undefined {
  if (by === "user") return req.user?.id;
  // With `trust proxy` set to the number of hops, req.ip is the address the outermost
  // trusted proxy saw; entries a client adds further left in X-Forwarded-For are ignored.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
