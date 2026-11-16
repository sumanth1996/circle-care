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
  /** Pills on hand (CC-120). Counted when a bottle is opened; each taken dose since then is subtracted. */
  supply?: MedSupply;
}

/** CC-120 – CC-121: how much of a medicine is left. */
export interface MedSupply {
  /** Pills (or softgels) counted at `countedAt`. */
  count: number;
  countedAt: string; // ISO
  /** Pills used by one dose. */
  perDose: number;
  /** Which bottle this is. Only a new bottle changes it; editing the dose keeps it. */
  bottleId?: string;
  /** When someone asked the pharmacy for a refill for this bottle. */
  requestedAt?: string;
  requestedBy?: string;
  pharmacy?: string;
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

/** CC-142: Maggie's optional one-tap daily check-ins. No emoji: faces are drawn. */
export type Feeling = "great" | "good" | "calm" | "okay" | "uneasy" | "low";
export type Meal = "breakfast" | "lunch" | "dinner";
export interface DailyLog {
  date: string; // YYYY-MM-DD
  feeling?: Feeling;
  feelingAt?: string;
  water: number; // glasses
  meals: Meal[];
  updatedAt: string;
  /** Logged while Maggie wasn't sharing: stays private for the whole day, even if she turns sharing on later (review F2-2). */
  private?: boolean;
}

/** CC-164 – CC-165: the circle's private family chat. */
export interface ChatMessage {
  id: string;
  by: string;
  at: string;
  text: string;
  /** CC-165: Maggie spoke it and read it back before sending. */
  via?: "voice";
}
export interface Chat {
  messages: ChatMessage[];
  /** Paid caregivers join only when Maggie or Sarah adds them. */
  pros: string[];
  /** Last time each member read the chat. */
  readAt: Record<string, string>;
  /** When each added caregiver joined. They see messages from then on, not the history before. */
  joinedAt: Record<string, string>;
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
  /** Reviewer's reason when a legal document is rejected (CC-24). */
  rejectReason?: string;
  /** Encrypted file content id in the device file store (CC-67). */
  fileId?: string;
  mime?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: "viewed" | "created" | "updated" | "removed" | "approved" | "declined" | "exported" | "signed in" | "signed out" | "denied";
  resource: string;
  /** Hash of the previous entry and of this entry — a tamper-evident chain (CC-28). */
  prev: string;
  hash: string;
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
  /** CC-208: delivered at once even in quiet hours (SOS, falls, high-priority medicines and security notices). */
  urgent?: boolean;
  /** CC-208: held for these people's quiet hours. Not pushed or listed until the morning summary releases it. */
  held?: Persona[];
  /** CC-208: the morning summary lists what waited overnight (in-app only). */
  items?: string[];
  /** CC-206: a missed-dose alert or reminder that was settled when the dose was marked. */
  resolved?: AlertResolution;
}

/** CC-206: how a missed dose was settled, shown on the earlier alert. */
export interface AlertResolution {
  at: string;
  by: string;
  outcome: DoseStatus;
  reason?: string;
}

/** CC-207: one dose's reminders today. Reminder 1 comes at the dose time, then every 10 minutes (or 15 after a snooze). */
export interface DoseReminder {
  date: string; // YYYY-MM-DD
  key: string; // medId@HH:MM
  /** Reminders allowed for this dose, set when its first reminder went out. */
  limit: number;
  sent: number;
  nextAt: string; // ISO
  snoozed?: boolean;
}

/** Medication-related appointments on the guardian Calendar (CC-94 – CC-98). */
export type AppointmentKind = "doctor" | "lab" | "refill" | "review";
export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMin: number;
  kind: AppointmentKind;
  title: string;
  /** Who the appointment is with, or the pharmacy. */
  provider: string;
  location: string;
  /** Medicines this appointment is about. */
  medIds: string[];
  /** Member taking Maggie, if any. */
  escortId?: string;
  prep?: string;
  status: "scheduled" | "done" | "cancelled";
  /** CC-121: cancelled by Circle Care because the medicine was paused (not by a person). */
  autoCancelled?: boolean;
  createdBy: string;
}

export interface Settings {
  checkinWindow: { start: string; end: string };
  escalation: string[]; // ordered member ids
  escalationDelayMin: number;
  doseEscalation: { caregiverMin: number; guardianMin: number };
  quietHours: { on: boolean; start: string; end: string };
  /** CC-207: how many reminders Maggie gets for one dose, 1 to 5. Default 3. */
  reminderRepeats: number;
  channels: { push: boolean; sms: boolean; email: boolean };
  criticalBypass: boolean;
  textSize: "large" | "xl" | "xxl";
  highContrast: boolean;
  readAloud: boolean;
  sharingPaused: boolean;
  consent?: { version: string; at: string; by: string; onBehalfReason?: string };
  sessionLockMin: number;
  /** Elder-chosen lock interval in minutes; 0 = never (CC-14). */
  elderLockMin: number;
  /** Personas that have seen the welcome tour (CC-75). */
  toured: Partial<Record<Persona, boolean>>;
  /** Pilot setup-call requests (CC-75). */
  setupCallRequested?: string;
  /** Health readings from Maggie's watch (CC-84 – CC-88). */
  vitals: {
    /** Minutes between readings; 30 by default. */
    intervalMin: number;
    thresholds: { hrHigh: number; hrLow: number; hrJump: number; spo2Low: number; spo2Drop: number };
    /** Maggie's choice to share health readings with her guardian. */
    shareWithGuardian: boolean;
  };
  /** CC-121: warn when a medicine has this many days left (3–14). */
  refillAlertDays: number;
  /** CC-142 – CC-143: Maggie's daily check-ins. */
  dailyLog: {
    /** Maggie's choice to share feeling, water and meals with her guardian. */
    shareWithGuardian: boolean;
    waterGoal: number;
    /** When Sarah last gained access (sharing turned on or resumed). Unset means shared from the start. */
    sharedSince?: string;
  };
  /** CC-191: Sarah's one evening-recap notification at 7 PM. The card on Home shows from 6 PM either way. */
  recapNotify: boolean;
  /** CC-165: Maggie can hide the family chat from her home screen. It stays under Family. */
  elderChatOnHome: boolean;
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
  dailyLogs: DailyLog[];
  chat: Chat;
  approvals: Approval[];
  notes: CareNote[];
  docs: CareDoc[];
  appointments: Appointment[];
  /** Body measurements and simulated device readings (CC-84). */
  health: {
    heightCm: number;
    birthYear: number;
    device: string;
    /** Readings injected by the presenter to demonstrate alerts. */
    overrides: { at: string; hr?: number; spo2?: number; addedAt: string }[];
  };
  audit: AuditEvent[];
  alerts: Alert[];
  /** CC-207: today's dose reminders. */
  reminders: DoseReminder[];
  settings: Settings;
}
