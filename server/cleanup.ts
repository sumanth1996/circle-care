// Deletes rows that have expired, so the tables don't grow without bound
// (CC-201, CC-204). Runs when the server starts and then once a day
// (server/index.ts). Safe to run on several instances at once: each statement
// is a plain DELETE of rows that are already dead.

import type { Config } from "./config";
import type { Queryable } from "./db";
import { pruneRateLimits } from "./ratelimit";

export interface CleanupResult { sessions: number; passwordResets: number; mfaChallenges: number; mfaPendingSetups: number; rateLimits: number }

export async function cleanupExpired(q: Queryable, cfg: Pick<Config, "sessionIdleMinutes">, now: Date): Promise<CleanupResult> {
  const idleCutoff = new Date(now.getTime() - cfg.sessionIdleMinutes * 60_000);
  const sessions = (await q.query("DELETE FROM sessions WHERE expires_at <= $1 OR last_seen_at <= $2 RETURNING token_hash", [now, idleCutoff])).rows.length;
  const passwordResets = (await q.query("DELETE FROM password_resets WHERE expires_at <= $1 OR used_at IS NOT NULL RETURNING token_hash", [now])).rows.length;
  const mfaChallenges = (await q.query("DELETE FROM mfa_challenges WHERE expires_at <= $1 RETURNING token_hash", [now])).rows.length;
  // An authenticator setup that was started but never confirmed (15 minutes) drops its secret.
  const mfaPendingSetups = (await q.query("UPDATE users SET mfa_pending_secret_enc = NULL, mfa_pending_at = NULL WHERE mfa_pending_at <= $1 RETURNING id", [new Date(now.getTime() - 15 * 60_000)])).rows.length;
  const rateLimits = await pruneRateLimits(q, now);
  return { sessions, passwordResets, mfaChallenges, mfaPendingSetups, rateLimits };
}

export const CLEANUP_EVERY_MS = 24 * 3600_000;

export interface CleanupSchedule {
  /** The sweep made at start-up (null if it failed; the failure is logged without details). */
  first: Promise<CleanupResult | null>;
  stop(): void;
}

/**
 * Sweeps now, then every CLEANUP_EVERY_MS. The timer is unref'd, so it never
 * keeps the process alive on its own. Used by server/index.ts and server/dev.ts.
 */
export function scheduleCleanup(
  q: Queryable,
  cfg: Pick<Config, "sessionIdleMinutes">,
  opts: { now?: () => Date; log?: (line: string) => void } = {},
): CleanupSchedule {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line: string) => console.log(line));
  const sweep = async (): Promise<CleanupResult | null> => {
    try {
      const r = await cleanupExpired(q, cfg, now());
      if (Object.values(r).some((n) => n > 0)) log(`[cleanup] removed ${Object.entries(r).map(([k, v]) => `${v} ${k}`).join(", ")}`);
      return r;
    } catch (e) {
      log(`[cleanup] failed: ${e instanceof Error ? e.message : "unknown"}`);
      return null;
    }
  };
  const first = sweep();
  const timer = setInterval(() => { void sweep(); }, CLEANUP_EVERY_MS);
  timer.unref();
  return { first, stop: () => clearInterval(timer) };
}
