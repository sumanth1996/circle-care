import type { AuditEvent } from "./types";
import { sha256 } from "../lib/sha256";

// Tamper-evident audit log (CC-28). Each entry stores the hash of the entry
// before it, and its own hash covers its fields plus that link. Changing,
// removing or reordering any entry breaks every hash after it, which
// verifyChain() detects. Entries hold identifiers and resource names only —
// never health values.

export const GENESIS = "0".repeat(64);
export type RawAudit = Omit<AuditEvent, "prev" | "hash">;

const digest = (e: RawAudit, prev: string) => sha256(JSON.stringify([e.id, e.at, e.actorId, e.action, e.resource, prev]));

export function link(prev: string, e: RawAudit): AuditEvent {
  return { ...e, prev, hash: digest(e, prev) };
}

export function chain(events: RawAudit[]): AuditEvent[] {
  const out: AuditEvent[] = [];
  let prev = GENESIS;
  for (const e of events) {
    const linked = link(prev, e);
    out.push(linked);
    prev = linked.hash;
  }
  return out;
}

export function append(log: AuditEvent[], e: RawAudit) {
  log.push(link(log.length ? log[log.length - 1].hash : GENESIS, e));
}

export function verifyChain(log: AuditEvent[]): { ok: true; count: number } | { ok: false; count: number; brokenAt: number } {
  let prev = GENESIS;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.prev !== prev || e.hash !== digest(e, prev)) return { ok: false, count: log.length, brokenAt: i };
    prev = e.hash;
  }
  return { ok: true, count: log.length };
}

/** Retention: entries are kept at least six years (production policy). */
export const RETENTION_YEARS = 6;
