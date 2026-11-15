// Data classification (CC-9). Every field of the demo state (src/data/types.ts)
// and every column of the Postgres schema (server/migrations) is tagged here.
// A unit test (src/__tests__/classification.test.ts) reads both sources and
// fails, naming the field, when one is added without a tag here. The data
// inventory (docs/compliance/09-data-inventory.md) is written from this file.

import type { Resource } from "./policy";

/**
 * PHI: health information about Maggie, or something that reveals it.
 * PII: identifies a person but says nothing about health on its own.
 * Sensitive: financial or identity data (SSNs, bank and card details, credentials).
 * Operational: ids, timestamps, settings and flags needed to run the service.
 */
export type DataClass = "PHI" | "PII" | "Sensitive" | "Operational";

export const CLASS_LABEL: Record<DataClass, string> = {
  PHI: "PHI",
  PII: "PII",
  Sensitive: "Sensitive financial or identity",
  Operational: "Operational",
};

export interface EntityClassification {
  /** The permission-matrix resource that guards it (see src/data/policy.ts). */
  resource: Resource | Resource[] | null;
  /** Field name to class. Fields of inline objects use dots ("pill.color"). */
  fields: Record<string, DataClass>;
}

const P = "PHI", I = "PII", S = "Sensitive", O = "Operational";

/** Demo state, one entry per exported interface in src/data/types.ts. */
export const STATE_CLASSIFICATION: Record<string, EntityClassification> = {
  State: {
    resource: null,
    fields: {
      version: O, persona: O, signedIn: O, clockOffsetMin: O, elderId: O,
      "health.heightCm": P, "health.birthYear": I, "health.device": O,
      "health.overrides.at": P, "health.overrides.hr": P, "health.overrides.spo2": P, "health.overrides.addedAt": O,
    },
  },
  Member: {
    resource: "circle",
    fields: {
      id: O, name: I, short: I, role: I, relation: I, phone: I, color: O, photo: I,
      status: O, verification: I, expiresOn: O, favorite: O, invitedAt: O,
    },
  },
  Medication: {
    resource: "meds",
    fields: {
      id: O, name: P, strength: P, dose: P, times: P, instructions: P, prescriber: P, purpose: P,
      critical: P, paused: P, "pill.color": P, "pill.shape": P,
      "history.at": P, "history.by": P, "history.change": P,
    },
  },
  MedSupply: {
    resource: "supply",
    fields: { count: P, countedAt: P, perDose: P, bottleId: O, requestedAt: P, requestedBy: P, pharmacy: P },
  },
  DoseLog: {
    resource: "doses",
    fields: { id: O, medId: P, date: P, time: P, status: P, by: P, at: P, verified: P, reason: P },
  },
  CareTask: {
    resource: "tasks",
    fields: { id: O, title: P, icon: P, time: P, recurrence: P, assignee: P },
  },
  TaskLog: {
    resource: "tasks",
    fields: { taskId: P, date: P, by: P, at: P, note: P },
  },
  Shift: {
    resource: "schedule",
    fields: { id: O, caregiverId: P, days: P, start: P, end: P, accepted: O },
  },
  Visit: {
    resource: "schedule",
    fields: { id: O, shiftId: O, caregiverId: P, date: P, checkIn: P, checkOut: P, manualReason: P },
  },
  Handoff: {
    resource: "handoffs",
    fields: {
      id: O, visitId: O, by: P, at: P, mood: P, meals: P, concerns: P, notes: P, summary: P,
      acknowledgedBy: O, acknowledgedAt: O, skippedReason: P,
    },
  },
  SosEvent: {
    resource: "sos",
    fields: { id: O, startedAt: P, status: P, step: O, responderId: P, acknowledgedAt: P, resolvedAt: P, outcome: P, via: O },
  },
  Checkin: {
    resource: "history",
    fields: { date: P, at: P, mood: P },
  },
  DailyLog: {
    resource: "wellbeing",
    fields: { date: P, feeling: P, feelingAt: P, water: P, meals: P, updatedAt: P, private: O },
  },
  ChatMessage: {
    resource: "chat",
    fields: { id: O, by: I, at: O, text: P, via: O },
  },
  Chat: {
    resource: "chat",
    fields: { pros: O, readAt: O, joinedAt: O },
  },
  Approval: {
    resource: "approvals",
    fields: {
      id: O, kind: O, title: P, detail: P, requestedBy: O, at: O, status: O, decidedAt: O,
      note: P, payload: P, elderSeen: O, elderQuestion: P,
    },
  },
  CareNote: {
    resource: ["notes", "notes.private"],
    fields: { id: O, by: O, at: O, text: P, visibility: O },
  },
  CareDoc: {
    resource: ["docs", "docs.legal"],
    fields: { id: O, name: P, kind: P, by: O, at: O, size: O, status: O, rejectReason: I, fileId: O, mime: O },
  },
  AuditEvent: {
    resource: "audit",
    fields: { id: O, at: O, actorId: O, action: O, resource: O, prev: O, hash: O },
  },
  Alert: {
    resource: null,
    fields: { id: O, key: O, at: O, to: O, title: O, detail: P, severity: O, read: O, link: O },
  },
  Appointment: {
    resource: "appointments",
    fields: {
      id: O, date: P, time: P, durationMin: P, kind: P, title: P, provider: P, location: P, medIds: P,
      escortId: I, prep: P, status: O, autoCancelled: O, createdBy: O,
    },
  },
  Settings: {
    resource: ["settings", "emergencyCard", "vitals", "wellbeing"],
    fields: {
      "checkinWindow.start": O, "checkinWindow.end": O, escalation: O, escalationDelayMin: O,
      "doseEscalation.caregiverMin": O, "doseEscalation.guardianMin": O,
      "quietHours.on": O, "quietHours.start": O, "quietHours.end": O,
      "channels.push": O, "channels.sms": O, "channels.email": O, criticalBypass: O,
      textSize: I, highContrast: I, readAloud: I, sharingPaused: O,
      "consent.version": O, "consent.at": O, "consent.by": O, "consent.onBehalfReason": P,
      sessionLockMin: O, elderLockMin: O, toured: O, setupCallRequested: O,
      "vitals.intervalMin": O,
      "vitals.thresholds.hrHigh": P, "vitals.thresholds.hrLow": P, "vitals.thresholds.hrJump": P,
      "vitals.thresholds.spo2Low": P, "vitals.thresholds.spo2Drop": P,
      "vitals.shareWithGuardian": O, refillAlertDays: O,
      "dailyLog.shareWithGuardian": O, "dailyLog.waterGoal": O, "dailyLog.sharedSince": O,
      recapNotify: O, elderChatOnHome: O,
      "emergencyCard.allergies": P, "emergencyCard.conditions": P, "emergencyCard.directives": P,
      "emergencyCard.bloodType": P, "emergencyCard.approvedByElder": O, "emergencyCard.approvedAt": O,
    },
  },
};

const persona = { id: O, user_id: O, first_name: I, last_name: I, phone: I, email: I, ssn_enc: S, ssn_last4: S, created_at: O, updated_at: O } as const;

/** Postgres, one entry per table created in server/migrations (and schema_migrations in server/migrate.ts). */
export const DB_CLASSIFICATION: Record<string, Record<string, DataClass>> = {
  users: {
    id: O, email: I, password_hash: S, role: O, failed_attempts: O, first_failed_at: O, locked_until: O,
    created_at: O, updated_at: O,
  },
  sessions: { token_hash: O, user_id: O, created_at: O, last_seen_at: O, expires_at: O },
  elders: { ...persona },
  caregivers: { ...persona },
  guardians: { ...persona },
  ssn_fingerprints: { fingerprint: S, user_id: O },
  photos: { user_id: O, content_type: O, data_enc: I, size_bytes: O, updated_at: O },
  vault_tokens: { token: S, kind: O, owner_user_id: O, metadata: S, created_at: O, attached_at: O, revoked_at: O },
  bank_accounts: {
    id: O, user_id: O, vault_token: S, bank_name: S, holder_name: I, account_type: S,
    account_last4: S, routing_last4: S, ach_fee_cents: O, created_at: O,
  },
  payment_cards: {
    id: O, user_id: O, vault_token: S, holder_name: I, brand: S, funding: S, last4: S,
    exp_month: S, exp_year: S, is_primary: O, created_at: O,
  },
  audit_events: { id: O, at: O, actor_user_id: O, subject_user_id: O, action: O, detail: O },
  schema_migrations: { version: O, applied_at: O },
};
