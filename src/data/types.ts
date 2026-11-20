// Circle Care domain model. Everything here is fictional demo data held in the
// browser; a production build would keep it server-side, encrypted, behind
// role-based access checks (see Notion: CC-19 "Enforce access rules server-side").

export type Persona = "elder" | "caregiver" | "guardian" | "family";
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
  /** CC-246: stopped for good (not just paused). It sits on the Stopped list with no reminders. A stopped medicine is also paused. */
  stopped?: { at: string; by: string; reason?: string; demo?: boolean };
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
  /** CC-243: when the record was corrected, by whom. The earlier entry is kept in `doseHistory`. */
  correctedAt?: string;
  correctedBy?: string;
  /** CC-248: seeded by the Safer Doses demo scenario. */
  demo?: boolean;
}

/**
 * Sprint 26 "Safer Doses" (CC-243, CC-244): what happened to a dose record besides the record itself, oldest
 * first. Nothing here is ever removed, so a correction or an undo keeps the first entry.
 *  - duplicate: someone tried to mark a dose already marked; `firstBy` is who got there first. Their tap wasn't saved.
 *  - undone: the person who marked it took the mark back within 10 minutes.
 *  - corrected: Sarah or the person who marked it changed it from `from` to `status`; `firstBy` is who marked it.
 */
export interface DoseEvent {
  id: string;
  medId: string;
  date: string; // the day the dose was due
  time: string; // scheduled HH:MM
  kind: "duplicate" | "undone" | "corrected";
  /** The dose record this is about (for a duplicate, the one that was kept). */
  doseId?: string;
  /** When the dose was first marked (undone and corrected events). */
  markedAt?: string;
  status?: DoseStatus;
  from?: DoseStatus;
  firstBy?: string;
  by: string;
  at: string;
  reason?: string;
  demo?: boolean;
}

export interface CareTask {
  id: string;
  title: string;
  icon: string; // lucide icon key
  time: string; // HH:MM
  /** "once" is a next step from an after-visit note (CC-218): it shows only on `date`, for its one assignee. */
  recurrence: "daily" | "weekdays" | "weekends" | "once";
  assignee: "caregiver" | "elder" | string;
  /** CC-218: the day of a one-off next step. */
  date?: string;
  /** CC-218: the appointment whose notes added this next step. */
  apptId?: string;
  /** CC-227: the call log entry whose next step this is. */
  callId?: string;
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
  /** CC-229: sent to the backup in Sarah's place while she was away (the away period's id). */
  awayId?: string;
  /** CC-229: where the alert led for Sarah. */
  coverLink?: string;
  /** CC-230: still open at hand-back, so it moved to Sarah at this time. */
  movedToSarah?: string;
}

/** CC-229 – CC-231: Sarah's away dates and who covers. */
export interface Away {
  id: string;
  start: string; // YYYY-MM-DD, first day away
  end: string; // YYYY-MM-DD, last day away
  backupId: string;
  status: "asked" | "accepted" | "declined" | "ended" | "cancelled";
  by: string;
  at: string;
  updatedAt?: string;
  answeredAt?: string;
  /** Sarah was reminded a day before that nobody had accepted yet. */
  pickReminded?: boolean;
  /** CC-231: Maggie asked for someone else, at this time. */
  maggieAsked?: string;
  startedAt?: string;
  endedAt?: string;
  /** Sarah tapped I'm back before the end date. */
  endedEarly?: boolean;
  /** CC-230: what Sarah's summary counts, kept at hand-back. */
  summaryFor?: { alerts: number; tasksDone: number; sos: number; open: string[] };
  summarySeenAt?: string;
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
  /** CC-217: the shared question list. Unset until someone first opens it; the prep note then becomes its first item. */
  questions?: VisitQuestion[];
  /** CC-218: what the doctor said, written after the visit by Maggie, Sarah or whoever went. */
  notes?: VisitNotes;
  /** CC-218: the one reminder to add notes has been sent. */
  notesReminded?: boolean;
  status: "scheduled" | "done" | "cancelled";
  /** CC-121: cancelled by Circle Care because the medicine was paused (not by a person). */
  autoCancelled?: boolean;
  createdBy: string;
}

/* ---------------- Sprint 16: Help board (CC-209, CC-210) ---------------- */

export type HelpKind = "ride" | "groceries" | "company" | "visit" | "phone" | "other";
export type HelpStatus = "open" | "claimed" | "done" | "cancelled";

export interface HelpChange {
  at: string;
  by: string;
  change: string;
}

/** A small ask Sarah posts for the people she picks (CC-209), who can claim and finish it (CC-210). */
export interface HelpRequest {
  id: string;
  kind: HelpKind;
  /** Free text, up to 280 characters. Sarah sees the health-detail hint before it's posted. */
  note: string;
  /** When the help is needed. */
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  /** Tied to an appointment: people without appointment access see only "Appointment" and the time. */
  appointmentId?: string;
  /** Member ids Sarah chose. Maggie and Sarah always see it too. */
  audience: string[];
  by: string;
  at: string;
  status: HelpStatus;
  claimedBy?: string;
  claimedAt?: string;
  doneBy?: string;
  /** When it was finished or cancelled; boards drop it 30 days later. */
  closedAt?: string;
  /** Server revision: a claim succeeds only on the revision the claimer saw (first claim wins). */
  rev: number;
  /** Sarah was told it's still unclaimed 24 hours before it's due. */
  remindedUnclaimed?: boolean;
  /** The person who has it was asked once "Did this happen?" */
  askedDone?: boolean;
  /** They answered "Not yet". */
  notYet?: boolean;
  history: HelpChange[];
  /** CC-211: Maggie picked a day, not a time. */
  anyTime?: boolean;
  /** CC-213: the Coming Home plan item this request was made from; its title is the request's name. */
  planItemId?: string;
  title?: string;
}

/* ---------------- Sprint 17: Coming Home, visit questions (CC-213, CC-214, CC-217) ---------------- */

export type PlanItemKind = "meds" | "followup" | "home" | "night" | "custom";
export interface PlanItem {
  id: string;
  kind: PlanItemKind;
  title: string;
  /** Who has it: Sarah herself, or the person it went to as a help request. */
  assignee?: string;
  /** The help request this item became when Sarah gave it to someone (CC-213). */
  helpId?: string;
}
/** CC-213: Sarah's plan for the first days after Maggie leaves hospital. There is no field for why she was there. */
export interface ComingHome {
  id: string;
  /** The day Maggie comes home. */
  date: string;
  by: string;
  at: string;
  items: PlanItem[];
  /** CC-214: the first follow-up visit should be within this many days of coming home (7 by default). */
  followUpDays: number;
  /** CC-213: Sarah was told items were still unassigned a day before. */
  remindedUnassigned?: boolean;
  /** CC-214: days Sarah got the 9 AM follow-up reminder. */
  followUpReminded: string[];
  /** CC-213: read-only 30 days after coming home. */
  archived?: boolean;
}

/** CC-217: one question or observation on an appointment's shared list. */
export interface VisitQuestion {
  id: string;
  by: string;
  at: string;
  text: string;
  /** Maggie hid it: only Maggie and Sarah see it, and it's left off printouts unless Sarah adds it back. */
  hidden?: boolean;
}

export interface Settings {
  checkinWindow: { start: string; end: string };
  escalation: string[]; // ordered member ids
  escalationDelayMin: number;
  /** CC-239: withCaregiver tells the guardian at the same time as the caregiver. Off by default: caregiver first. */
  doseEscalation: { caregiverMin: number; guardianMin: number; withCaregiver?: boolean };
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
  /** CC-211: the people Maggie lets see the help she asks for herself. */
  helpFrom: string[];
  /** CC-226: the people Maggie lets see insurance and admin details (call outcomes, contacts, reference numbers). Sarah always does. */
  adminTo: string[];
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
  /** When the rules last ran (CC-199 review): follow-ups due while the app was asleep across midnight carry on. */
  lastRunAt?: string;
  elderId: string;
  members: Member[];
  meds: Medication[];
  doses: DoseLog[];
  /** CC-243, CC-244: every blocked double mark, undo and correction, oldest first. */
  doseHistory: DoseEvent[];
  /** CC-248: a demo scenario the presenter loaded, shown with a "Dummy profile (demo)" banner. */
  demoScenario?: "safer-doses";
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
  /** CC-209, CC-210: the Help board. */
  help: HelpRequest[];
  /** CC-213: Coming Home plans, newest last. */
  plans: ComingHome[];
  /** CC-226 – CC-228: calls with insurers, pharmacies and agencies. */
  calls: CallEntry[];
  /** CC-219: Maggie's What matters to me page. */
  aboutMe: AboutMe;
  /** CC-229: Sarah's away periods, newest last. */
  aways: Away[];
  /** CC-129: Maggie's resting and away days, newest last. */
  quietDays: QuietDay[];
  /** CC-138, CC-139: notes from family shown on Maggie's home. */
  memoryAids: MemoryAid[];
  /** CC-132, CC-133: Maggie's "Is this a scam?" reports, newest last. */
  scams: ScamReport[];
  /** CC-134: Maggie's weekly scam-awareness tips. */
  scamTips: ScamTips;
  /** Encrypted photos to remove from this device's file store (a deleted memory aid, an old scam photo). */
  filesToDelete: string[];
  settings: Settings;
}

/* ---------------- Sprint 22: Confident at Home (CC-129, CC-132 – CC-134, CC-138, CC-139) ---------------- */

/** CC-129: Maggie says she's resting today, or away until a date. Check-in alerts pause; medicine and SOS alerts don't. */
export interface QuietDay {
  id: string;
  kind: "resting" | "away";
  /** First day paused, YYYY-MM-DD. */
  from: string;
  /** Last day paused, YYYY-MM-DD. */
  until: string;
  by: string;
  at: string;
  /** Maggie tapped I'm back, at this time. Check-ins count again from her next window. */
  endedAt?: string;
}

/** CC-138, CC-139: a short note from family, with an optional photo, shown on Maggie's home and read aloud. */
export interface MemoryAid {
  id: string;
  text: string;
  /** The photo, encrypted in this device's file store (CC-67). */
  photoId?: string;
  /** Always on Maggie's home, or once at a date and time. */
  kind: "always" | "once";
  date?: string;
  time?: string;
  by: string;
  at: string;
  updatedAt?: string;
  /** Maggie turned it off in Settings, at this time. */
  offAt?: string;
  /** Maggie's last "Got it", which the writer sees as "Seen at …". */
  seenAt?: string;
  /** An always note Maggie tapped Got it on stays off her home for the rest of that day. */
  hiddenOn?: string;
  /** It was read aloud once when it first showed. */
  spokenAt?: string;
}

export type ScamKind = "call" | "text" | "email" | "door" | "payment";

/** CC-132, CC-133: Maggie asks "Is this a scam?"; her guardians work through a checklist and tell her she's safe. */
export interface ScamReport {
  id: string;
  kind: ScamKind;
  /** What Maggie typed. Guardian-only, never in the audit log. */
  note?: string;
  /** The photo, encrypted in this device's file store. Removed 30 days after the report is resolved. */
  photoId?: string;
  by: string;
  at: string;
  /** Checklist items a guardian ticked, shared by every guardian. */
  checked: string[];
  status: "open" | "resolved";
  resolvedBy?: string;
  resolvedAt?: string;
  /** What the guardian told Maggie when marking it resolved. */
  reply?: string;
  /** Maggie read the answer. */
  elderSeenAt?: string;
  photoRemovedAt?: string;
}

/** CC-134: which tips Maggie has finished, and this week's card. */
export interface ScamTips {
  done: { id: string; at: string }[];
  /** The Monday of the week the card's Not now count belongs to. */
  week?: string;
  /** How many times Maggie tapped Not now this week. */
  notNow: number;
  /** The day she last tapped Not now; the card comes back the next day. */
  hiddenOn?: string;
}

/* ---------------- Sprint 18: After-visit notes (CC-218) ---------------- */

/** One next step from a visit. Saving it makes a one-off care task for its owner on its date. */
export interface NextStep {
  id: string;
  text: string;
  owner: string;
  date: string;
  taskId: string;
  by: string;
  at: string;
}

/** The answers to the visit's questions, anything else the doctor said, and the next steps. */
export interface VisitNotes {
  /** Question id to answer. */
  answers: Record<string, string>;
  summary?: string;
  nextSteps: NextStep[];
  by: string;
  at: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** CC-226: one call Sarah or Maggie made to an insurer, a pharmacy or an agency. */
export interface CallEntry {
  id: string;
  org: string;
  date: string;
  /** The person spoken to. An insurance and admin detail. */
  contact?: string;
  /** What they agreed. An insurance and admin detail. */
  outcome?: string;
  /** Reference number. Masked to its last 4 in lists; only Maggie and Sarah can reveal it. Encrypted at rest in production. */
  ref?: string;
  /** CC-227: the follow-up, which becomes its owner's care task. */
  nextStep?: CallStep;
  by: string;
  at: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** CC-227: a call's next step and the care task it became. */
export interface CallStep {
  text: string;
  owner: string;
  date: string;
  taskId: string;
}

export type AboutKey = "day" | "food" | "help" | "avoid";

/** CC-219: one section of Maggie's What matters to me page, in her words. */
export interface AboutSection {
  key: AboutKey;
  text: string;
  by: string;
  at: string;
  /** Who Maggie lets see it, besides her and whoever first wrote it. Empty until she picks. */
  sharedWith: string[];
  /** CC-219 criterion 5: the last change someone else made, so Maggie sees what changed. */
  changedBy?: string;
  changedAt?: string;
  before?: string;
}

export interface AboutMe {
  sections: AboutSection[];
  /** Maggie can turn off Sarah's editing; Sarah still reads what's shared with her. */
  sarahCanEdit: boolean;
  /** When Maggie last opened the page, so she sees changes made since. */
  elderSeenAt?: string;
}
