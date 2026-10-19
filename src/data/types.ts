// Circle Care domain model. Everything here is fictional demo data held in the
// browser; a production build would keep it server-side, encrypted, behind
// role-based access checks (see Notion: CC-19 "Enforce access rules server-side").

export type Persona = "elder" | "caregiver" | "guardian";
export type Role = "elder" | "guardian" | "family" | "pro";

export interface Member {
  id: string;
  name: string;
  short: string;
  role: Role;
  relation: string;
  phone: string;
  color: string;
  photo?: string;
  status: "active" | "pending" | "revoked";
  /** Guardian legal-authority verification (CC-23/24). */
  verification?: "verified" | "pending" | "none";
  /** Time-bound access end date, YYYY-MM-DD (CC-25). */
  expiresOn?: string;
  favorite?: boolean;
  invitedAt?: string;
}

export interface Medication {
  id: string;
  name: string;
  strength: string;
  dose: string;
  times: string[]; // "HH:MM"
  instructions: string;
  prescriber: string;
  purpose: string;
  critical: boolean;
  paused: boolean;
  pill: { color: string; shape: "round" | "oval" | "capsule" };
  history: { at: string; by: string; change: string }[];
}

export type DoseStatus = "taken" | "skipped" | "refused";
export interface DoseLog {
  id: string;
  medId: string;
  date: string; // YYYY-MM-DD
  time: string; // scheduled HH:MM
  status: DoseStatus;
  by: string; // member id
  at: string; // ISO
  verified: boolean; // caregiver-verified during a visit (CC-41)
  reason?: string;
}

export interface CareTask {
  id: string;
  title: string;
  icon: string; // lucide icon key
  time: string; // HH:MM
  recurrence: "daily" | "weekdays" | "weekends";
  assignee: "caregiver" | "elder" | string;
}
export interface TaskLog {
  taskId: string;
  date: string;
  by: string;
  at: string;
  note?: string;
}

export interface Shift {
  id: string;
  caregiverId: string | null;
  days: number[]; // 0 = Sunday
  start: string;
  end: string;
  accepted: boolean;
}

export interface Visit {
  id: string;
  shiftId: string;
  caregiverId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  manualReason?: string;
}

export interface Handoff {
  id: string;
  visitId: string;
  by: string;
  at: string;
  mood: string;
  meals: string;
  concerns: string;
  notes: string;
  summary: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  skippedReason?: string;
}

export interface SosEvent {
  id: string;
  startedAt: string;
  status: "active" | "acknowledged" | "resolved";
  step: number; // index into escalation chain
  responderId?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  outcome?: string;
  via: "app" | "sms-fallback";
}

export interface Checkin {
  date: string;
  at: string;
  mood?: string;
}

export interface Approval {
  id: string;
  kind: "med-change" | "member" | "shift-swap";
  title: string;
  detail: string;
  requestedBy: string;
  at: string;
  status: "pending" | "approved" | "declined";
  decidedAt?: string;
  note?: string;
  payload?: Record<string, unknown>;
  elderSeen?: boolean;
  elderQuestion?: string;
}

export interface CareNote {
  id: string;
  by: string;
  at: string;
  text: string;
  visibility: "everyone" | "guardian";
}

export interface CareDoc {
  id: string;
  name: string;
  kind: "Care plan" | "Discharge summary" | "Legal authority" | "Other";
  by: string;
  at: string;
  size: string;
  status?: "pending" | "verified" | "rejected";
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: "viewed" | "created" | "updated" | "removed" | "approved" | "declined" | "exported" | "signed in" | "denied";
  resource: string;
}

export interface Alert {
  id: string;
  /** De-duplication key for rule-generated alerts. */
  key?: string;
  at: string;
  to: Persona[];
  /** Lock-screen text: generic, never contains PHI (CC-31). */
  title: string;
  /** In-app detail, shown only after the app is unlocked. */
  detail: string;
  severity: "info" | "warning" | "critical";
  read: Persona[];
  link?: string;
}

export interface Settings {
  checkinWindow: { start: string; end: string };
  escalation: string[]; // ordered member ids
  escalationDelayMin: number;
  doseEscalation: { caregiverMin: number; guardianMin: number };
  quietHours: { on: boolean; start: string; end: string };
  channels: { push: boolean; sms: boolean; email: boolean };
  criticalBypass: boolean;
  textSize: "large" | "xl" | "xxl";
  highContrast: boolean;
  readAloud: boolean;
  sharingPaused: boolean;
  consent?: { version: string; at: string; by: string };
  sessionLockMin: number;
  emergencyCard: {
    allergies: string;
    conditions: string;
    directives: string;
    bloodType: string;
    approvedByElder: boolean;
    approvedAt?: string;
  };
}

export interface State {
  version: number;
  persona: Persona | null;
  signedIn: Record<Persona, boolean>;
  clockOffsetMin: number;
  elderId: string;
  members: Member[];
  meds: Medication[];
  doses: DoseLog[];
  tasks: CareTask[];
  taskLogs: TaskLog[];
  shifts: Shift[];
  visits: Visit[];
  handoffs: Handoff[];
  sos: SosEvent[];
  checkins: Checkin[];
  approvals: Approval[];
  notes: CareNote[];
  docs: CareDoc[];
  audit: AuditEvent[];
  alerts: Alert[];
  settings: Settings;
}
