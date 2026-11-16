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
