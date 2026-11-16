import type { State, Member } from "./types";
import { todayOf } from "./selectors";

// Role permission matrix (CC-18) and the single enforcement point every
// action goes through (CC-19). In this prototype the check runs in the
// data layer on the device; in production the identical policy runs in the
// API so no client can bypass it. See docs/security/permission-matrix.md.

export type Resource =
  | "meds" | "doses" | "tasks" | "notes" | "notes.private" | "docs" | "docs.legal" | "approvals"
  | "handoffs" | "vitals" | "appointments" | "circle" | "schedule" | "history" | "digest" | "audit" | "settings" | "emergencyCard" | "sos" | "data"
  | "supply" | "wellbeing" | "chat" | "help" | "plan" | "questions";
export type Action = "read" | "write" | "propose" | "approve" | "invite" | "revoke" | "export" | "delete" | "review" | "respond";

/** A rule is a role, or "pro@shift": a professional caregiver currently checked in. */
type Rule = Member["role"] | "pro@shift" | "reviewer";

export const MATRIX: Record<Resource, Partial<Record<Action, Rule[]>>> = {
  meds:            { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian"], propose: ["family", "pro@shift"] },
  doses:           { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian", "family", "pro@shift"] },
  tasks:           { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian", "family", "pro@shift"], propose: ["family", "pro@shift"] },
  notes:           { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian", "family", "pro@shift"] },
  "notes.private": { read: ["guardian"], write: ["guardian", "family", "pro@shift"] },
  docs:            { read: ["elder", "guardian", "family", "pro@shift"], write: ["guardian", "family", "pro@shift"] },
  "docs.legal":    { read: ["elder", "guardian"], write: ["guardian"], review: ["reviewer"] },
  approvals:       { read: ["elder", "guardian"], approve: ["guardian"], propose: ["family", "pro@shift", "pro"] },
  handoffs:        { read: ["guardian", "family", "pro"], write: ["pro@shift"] },
  vitals:          { read: ["elder", "guardian"], write: ["guardian"] },
  appointments:    { read: ["elder", "guardian", "family", "pro"], write: ["guardian"] },
  circle:          { read: ["elder", "guardian", "family", "pro"], invite: ["elder", "guardian"], revoke: ["elder", "guardian"] },
  schedule:        { read: ["elder", "guardian", "family", "pro"], write: ["guardian"], propose: ["pro", "family"] },
  history:         { read: ["elder", "guardian", "family"] },
  digest:          { read: ["elder", "guardian"] },
  audit:           { read: ["elder", "guardian"] },
  settings:        { read: ["elder", "guardian"], write: ["guardian"] },
  emergencyCard:   { read: ["elder", "guardian", "family", "pro"], write: ["elder"], propose: ["guardian"] },
  sos:             { read: ["elder", "guardian", "family", "pro"], write: ["elder"], respond: ["guardian", "family", "pro"] },
  data:            { export: ["elder", "guardian"], delete: ["elder", "guardian"] },
  // Sprint 12 — Everyday Care (CC-120 – CC-121, CC-142 – CC-143)
  supply:          { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian", "family", "pro@shift"] },
  wellbeing:       { read: ["elder", "guardian"], write: ["elder"] },
  // CC-164: paid caregivers are in the family chat only once Maggie or Sarah adds them (see can()).
  chat:            { read: ["elder", "guardian", "family", "pro"], write: ["elder", "guardian", "family", "pro"], invite: ["elder", "guardian"] },
  // Sprint 16 — Help board (CC-209, CC-210). Sarah posts and cancels; the people she picks claim and finish.
  // Who sees each request is narrowed further to its audience (see canSeeHelp in help.ts).
  // CC-211: Maggie asks for a hand herself ("propose"), to the people she chose in her Privacy Center.
  help:            { read: ["elder", "guardian", "family", "pro"], write: ["guardian"], respond: ["guardian", "family", "pro"], propose: ["elder"] },
  // Sprint 17 — Coming Home plan (CC-213, CC-214). Sarah writes it; others see only items given to them, as help requests.
  plan:            { read: ["elder", "guardian"], write: ["guardian"] },
  // CC-217: the shared question list for an appointment. A paid caregiver only while on shift.
  questions:       { read: ["elder", "guardian", "family", "pro@shift"], write: ["elder", "guardian", "family", "pro@shift"] },
};

/** Even when sharing is paused, these stay available to family and caregivers. */
const ALWAYS_SHARED: Resource[] = ["sos", "emergencyCard", "circle"];

export function roleOf(s: State, actorId: string): Rule | null {
  if (actorId === "trust-safety") return "reviewer";
  const m = s.members.find((x) => x.id === actorId);
  if (!m || m.status !== "active") return null;
  return m.role;
}

export function onShift(s: State, actorId: string) {
  return s.visits.some((v) => v.caregiverId === actorId && v.date === todayOf(s) && !!v.checkIn && !v.checkOut);
}

export function can(s: State, actorId: string, action: Action, resource: Resource): boolean {
  const role = roleOf(s, actorId);
  if (!role) return false;
  const rules = MATRIX[resource][action] ?? [];
  const allowed = rules.includes(role) || (role === "pro" && rules.includes("pro@shift") && onShift(s, actorId));
  if (!allowed) return false;
  // The elder's "Pause sharing" switch (CC-81) limits family and caregivers to emergencies.
  if (s.settings.sharingPaused && (role === "family" || role === "pro") && !ALWAYS_SHARED.includes(resource)) return false;
  // Health readings reach the guardian only while Maggie chooses to share them (CC-87).
  if (resource === "vitals" && role === "guardian" && action === "read" && !s.settings.vitals.shareWithGuardian) return false;
  // Feeling, water and meals reach the guardian only while Maggie shares them (CC-143).
  // Pausing all sharing hides them too: only emergency alerts are shared then.
  if (resource === "wellbeing" && role === "guardian" && (!s.settings.dailyLog.shareWithGuardian || s.settings.sharingPaused)) return false;
  // CC-164: a paid caregiver reads and writes in the family chat only after someone adds them.
  if (resource === "chat" && role === "pro" && !s.chat.pros.includes(actorId)) return false;
  return true;
}

/** Plain-language summary of the matrix, for docs and the Privacy Center. */
export function describe(role: Member["role"]) {
  const out: string[] = [];
  for (const [res, acts] of Object.entries(MATRIX)) {
    const ok = Object.entries(acts).filter(([, rules]) => rules!.includes(role) || (role === "pro" && rules!.includes("pro@shift"))).map(([a]) => a);
    if (ok.length) out.push(`${res}: ${ok.join(", ")}`);
  }
  return out;
}
