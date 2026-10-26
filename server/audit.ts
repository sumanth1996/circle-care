// Audit trail (CC-185). Callers pass only masked details: last four digits,
// field names, counts. This module refuses obviously sensitive values as a
// second line of defence.

import type { Queryable } from "./db";

export type AuditAction =
  | "account.created" | "auth.signin" | "auth.failed" | "auth.locked" | "auth.signout"
  | "profile.updated" | "ssn.set" | "ssn.changed" | "ssn.duplicate"
  | "photo.updated" | "photo.removed"
  | "bank.added" | "bank.replaced"
  | "card.added" | "card.removed" | "card.primary"
  | "nonprod.blocked" | "audit.exported";

/** A standalone run of 9+ digits (SSN, account or card number) or a dashed SSN. Hex hashes don't match. */
export const LOOKS_SENSITIVE = /(^|[^0-9a-z])\d{9,}([^0-9a-z]|$)|\b\d{3}-\d{2}-\d{4}\b/i;

export async function audit(q: Queryable, e: { action: AuditAction; actor?: string | null; subject?: string | null; detail?: Record<string, unknown>; at?: Date }) {
  const detail = e.detail ?? {};
  const json = JSON.stringify(detail);
  if (LOOKS_SENSITIVE.test(json)) throw new Error("Refusing to write unmasked digits to the audit log");
  await q.query(
    "INSERT INTO audit_events (at, actor_user_id, subject_user_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [e.at ?? new Date(), e.actor ?? null, e.subject ?? e.actor ?? null, e.action, json],
  );
}

/** Plain-language descriptions for My account → Security (CC-185). */
export function describe(action: string, d: Record<string, unknown>): string {
  switch (action) {
    case "account.created": return "Account created";
    case "auth.signin": return "Signed in";
    case "auth.failed": return "Sign-in attempt with a wrong password";
    case "auth.locked": return "Sign-in locked for 15 minutes after too many attempts";
    case "auth.signout": return "Signed out";
    case "profile.updated": return `Profile updated (${(d.fields as string[] | undefined)?.join(", ") ?? "details"})`;
    case "ssn.set": return `Social Security number ending ${d.last4} added`;
    case "ssn.changed": return `Social Security number changed to one ending ${d.last4}`;
    case "ssn.duplicate": return "Someone tried to use a Social Security number that's already on another account";
    case "photo.updated": return "Profile photo updated";
    case "photo.removed": return "Profile photo removed";
    case "bank.added": return `Bank account ending ${d.last4} added`;
    case "bank.replaced": return `Bank account replaced — now ending ${d.last4}`;
    case "card.added": return `${d.brand} ending ${d.last4} added`;
    case "card.removed": return `${d.brand} ending ${d.last4} removed`;
    case "card.primary": return `${d.brand} ending ${d.last4} is now your primary payment method`;
    case "nonprod.blocked": return `A non-test ${d.field} was blocked in this test environment`;
    case "audit.exported": return "Masked audit export generated";
    default: return action;
  }
}
