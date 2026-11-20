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
 *
 * Two rules keep the tags consistent (the test checks both):
 * - In a record that holds PHI, who did it (a member id) and when are PHI too,
 *   because together they say who cared for Maggie, and when. Each nested
 *   object counts as its own record, and a link to another record doesn't make
 *   it one (Chat's read times are Operational though its messages are PHI).
 *   This rule doesn't by itself make an id, status or flag PHI.
 * - Demo ids are readable ("med-lisinopril", "t-bath", "ap-metformin", "s-ana",
 *   "appt-auto-med-lisinopril-…", "b-" + count time), so those ids, and keys
 *   built from them, are PHI. Production should use opaque ids.
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

/** Demo state, one entry per interface (or object type) in src/data/types.ts. */
export const STATE_CLASSIFICATION: Record<string, EntityClassification> = {
  State: {
    resource: null,
    fields: {
      version: O, persona: O, signedIn: O, clockOffsetMin: O, lastRunAt: O, elderId: O, filesToDelete: O, demoScenario: O,
      "health.heightCm": P, "health.birthYear": I, "health.device": O,
      "health.overrides.at": P, "health.overrides.hr": P, "health.overrides.spo2": P, "health.overrides.addedAt": P,
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
      id: P, name: P, strength: P, dose: P, times: P, instructions: P, prescriber: P, purpose: P,
      critical: P, paused: P, "pill.color": P, "pill.shape": P,
      "history.at": P, "history.by": P, "history.change": P,
      "stopped.at": P, "stopped.by": P, "stopped.reason": P, "stopped.demo": O,
    },
  },
  MedSupply: {
    resource: "supply",
    fields: { count: P, countedAt: P, perDose: P, bottleId: P, requestedAt: P, requestedBy: P, pharmacy: P },
  },
  DoseLog: {
    resource: "doses",
    fields: {
      id: O, medId: P, date: P, time: P, status: P, by: P, at: P, verified: P, reason: P,
      correctedAt: P, correctedBy: P, demo: O,
    },
  },
  // CC-243, CC-244: every mark, blocked double mark, undo and correction of a dose. Who and when someone
  // gave Maggie a medicine, so PHI like the dose record itself.
  DoseEvent: {
    resource: "doses",
    fields: {
      id: O, medId: P, date: P, time: P, kind: P, doseId: O, status: P, from: P, firstBy: P, by: P, at: P,
      markedAt: P, reason: P, demo: O,
    },
  },
  CareTask: {
    resource: "tasks",
    fields: { id: P, title: P, icon: P, time: P, recurrence: P, assignee: P, date: P, apptId: P, callId: P },
  },
  TaskLog: {
    resource: "tasks",
    fields: { taskId: P, date: P, by: P, at: P, note: P },
  },
  Shift: {
    resource: "schedule",
    fields: { id: P, caregiverId: P, days: P, start: P, end: P, accepted: O },
  },
  Visit: {
    resource: "schedule",
    fields: { id: O, shiftId: P, caregiverId: P, date: P, checkIn: P, checkOut: P, manualReason: P },
  },
  Handoff: {
    resource: "handoffs",
    fields: {
      id: O, visitId: O, by: P, at: P, mood: P, meals: P, concerns: P, notes: P, summary: P,
      acknowledgedBy: P, acknowledgedAt: P, skippedReason: P,
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
    fields: { id: O, by: P, at: P, text: P, via: O },
  },
  Chat: {
    resource: "chat",
    fields: { pros: O, readAt: O, joinedAt: O },
  },
  Approval: {
    resource: "approvals",
    fields: {
      id: P, kind: O, title: P, detail: P, requestedBy: P, at: P, status: O, decidedAt: P,
      note: P, payload: P, elderSeen: O, elderQuestion: P,
    },
  },
  CareNote: {
    resource: ["notes", "notes.private"],
    fields: { id: O, by: P, at: P, text: P, visibility: O },
  },
  CareDoc: {
    resource: ["docs", "docs.legal"],
    fields: { id: O, name: P, kind: P, by: P, at: P, size: O, status: O, rejectReason: P, fileId: O, mime: O },
  },
  AuditEvent: {
    resource: "audit",
    fields: { id: O, at: P, actorId: P, action: O, resource: P, prev: O, hash: O },
  },
  Alert: {
    resource: null,
    fields: {
      id: O, key: P, at: P, to: O, title: O, detail: P, severity: O, read: O, link: O,
      urgent: O, held: O, items: P, awayId: O, coverLink: O, movedToSarah: P,
    },
  },
  // CC-206: how a missed dose was settled (who marked it, when, and why), shown on the earlier alert.
  AlertResolution: {
    resource: null,
    fields: { at: P, by: P, outcome: P, reason: P },
  },
  // CC-207: one dose's reminders today. The key names the medicine, so the record is PHI.
  DoseReminder: {
    resource: "doses",
    fields: { date: P, key: P, limit: O, sent: P, nextAt: P, snoozed: P },
  },
  // CC-209, CC-210: a help request. What, when and the note describe Maggie's care needs, and an
  // appointment link points at her health record, so the request is PHI. Lock screens show none of it.
  HelpRequest: {
    resource: "help",
    fields: {
      id: O, kind: P, note: P, date: P, time: P, appointmentId: P, audience: P, by: P, at: P, status: O,
      claimedBy: P, claimedAt: P, doneBy: P, closedAt: P, rev: O, remindedUnclaimed: O, askedDone: O, notYet: O,
      anyTime: O, planItemId: P, title: P,
    },
  },
  HelpChange: {
    resource: "help",
    fields: { at: P, by: P, change: P },
  },
  // CC-213, CC-214: the Coming Home plan says Maggie left hospital on a given day, so all of it is PHI,
  // though it never says why she was there.
  ComingHome: {
    resource: "plan",
    fields: { id: O, date: P, by: P, at: P, followUpDays: P, remindedUnassigned: O, followUpReminded: P, archived: O },
  },
  PlanItem: {
    resource: "plan",
    fields: { id: O, kind: P, title: P, assignee: P, helpId: O },
  },
  // CC-218: what the doctor said and the next steps are about Maggie's health.
  VisitNotes: {
    resource: "visitNotes",
    fields: { answers: P, summary: P, by: P, at: P, updatedBy: P, updatedAt: P },
  },
  NextStep: {
    resource: "visitNotes",
    fields: { id: P, text: P, owner: P, date: P, taskId: P, by: P, at: P },
  },
  // CC-226: which insurer, pharmacy or agency Maggie deals with, and what they agreed, says something about her care.
  CallEntry: {
    resource: ["calls", "calls.admin", "calls.ref"],
    fields: { id: O, org: P, date: P, contact: P, outcome: P, ref: P, by: P, at: P, updatedBy: P, updatedAt: P },
  },
  CallStep: {
    resource: "calls",
    fields: { text: P, owner: P, date: P, taskId: P },
  },
  // CC-219: Maggie's routines, food and how she likes to be helped can describe her health and needs.
  AboutMe: {
    resource: "aboutMe",
    fields: { sarahCanEdit: O, elderSeenAt: O },
  },
  AboutSection: {
    resource: "aboutMe",
    fields: { key: O, text: P, by: P, at: P, sharedWith: O, changedBy: P, changedAt: P, before: P },
  },
  // CC-229: Sarah's away dates and who covers. About Sarah and James, not Maggie's health; the counts in the
  // summary are just numbers. Personal, because it says when Sarah's home is empty.
  Away: {
    resource: "away",
    fields: {
      id: O, start: I, end: I, backupId: I, status: O, by: I, at: O, updatedAt: O, answeredAt: O, pickReminded: O,
      maggieAsked: O, startedAt: O, endedAt: O, endedEarly: O, summarySeenAt: O,
      "summaryFor.alerts": O, "summaryFor.tasksDone": O, "summaryFor.sos": O, "summaryFor.open": O,
    },
  },
  // CC-129: Maggie's resting or away days. Personal, not health: no reason is asked or kept, but it says when she
  // may not be home.
  QuietDay: {
    resource: "quietDays",
    fields: { id: O, kind: I, from: I, until: I, by: I, at: O, endedAt: O },
  },
  // CC-138, CC-139: a note to help Maggie remember says something about her memory, so the note, its photo and
  // who wrote or read it when are health data.
  MemoryAid: {
    resource: "memoryAids",
    fields: {
      id: O, text: P, photoId: P, kind: O, date: O, time: O, by: P, at: P, updatedAt: P, offAt: P, seenAt: P,
      hiddenOn: O, spokenAt: P,
    },
  },
  // CC-132, CC-133: what Maggie shares about a possible scam can hold account or card details, so the note and photo
  // are sensitive. Guardians and Maggie only; never the audit log. The photo goes 30 days after it's resolved.
  ScamReport: {
    resource: "scams",
    fields: {
      id: O, kind: I, note: S, photoId: S, by: I, at: I, checked: O, status: O, resolvedBy: I, resolvedAt: O,
      reply: I, elderSeenAt: O, photoRemovedAt: O,
    },
  },
  // CC-134: which weekly tips Maggie has finished.
  ScamTips: {
    resource: "tips",
    fields: { "done.id": O, "done.at": O, week: O, notNow: O, hiddenOn: O },
  },
  // CC-217: questions and observations for a visit describe Maggie's health.
  VisitQuestion: {
    resource: "questions",
    fields: { id: O, by: P, at: P, text: P, hidden: O },
  },
  Appointment: {
    resource: "appointments",
    fields: {
      id: P, date: P, time: P, durationMin: P, kind: P, title: P, provider: P, location: P, medIds: P,
      escortId: P, prep: P, notesReminded: O, status: O, autoCancelled: O, createdBy: P,
    },
  },
  Settings: {
    resource: ["settings", "emergencyCard", "vitals", "wellbeing"],
    fields: {
      "checkinWindow.start": O, "checkinWindow.end": O, escalation: O, escalationDelayMin: O,
      "doseEscalation.caregiverMin": O, "doseEscalation.guardianMin": O, "doseEscalation.withCaregiver": O,
      "quietHours.on": O, "quietHours.start": O, "quietHours.end": O, reminderRepeats: O,
      "channels.push": O, "channels.sms": O, "channels.email": O, criticalBypass: O,
      textSize: O, highContrast: O, readAloud: O, sharingPaused: O,
      "consent.version": O, "consent.at": P, "consent.by": P, "consent.onBehalfReason": P,
      sessionLockMin: O, elderLockMin: O, toured: O, setupCallRequested: O,
      "vitals.intervalMin": O,
      "vitals.thresholds.hrHigh": P, "vitals.thresholds.hrLow": P, "vitals.thresholds.hrJump": P,
      "vitals.thresholds.spo2Low": P, "vitals.thresholds.spo2Drop": P,
      "vitals.shareWithGuardian": O, refillAlertDays: O,
      "dailyLog.shareWithGuardian": O, "dailyLog.waterGoal": O, "dailyLog.sharedSince": O,
      recapNotify: O, elderChatOnHome: O, helpFrom: O, adminTo: O,
      "emergencyCard.allergies": P, "emergencyCard.conditions": P, "emergencyCard.directives": P,
      "emergencyCard.bloodType": P, "emergencyCard.approvedByElder": O, "emergencyCard.approvedAt": P,
    },
  },
};

const persona = { id: O, user_id: O, first_name: I, last_name: I, phone: I, email: I, ssn_enc: S, ssn_last4: S, created_at: O, updated_at: O } as const;

/** Postgres, one entry per table and view that the migrations create (the test reads them from the database catalog). */
export const DB_CLASSIFICATION: Record<string, Record<string, DataClass>> = {
  users: {
    id: O, email: I, password_hash: S, role: O, failed_attempts: O, first_failed_at: O, locked_until: O,
    created_at: O, updated_at: O,
    // Two-step sign-in (CC-200): the authenticator secret is encrypted like an SSN.
    mfa_secret_enc: S, mfa_pending_secret_enc: S, mfa_pending_at: O, mfa_enabled_at: O, totp_last_counter: O,
  },
  sessions: { token_hash: S, user_id: O, created_at: O, last_seen_at: O, expires_at: O },
  // Forgotten-password links (CC-201): only a hash of each link is kept.
  password_resets: { token_hash: S, user_id: O, created_at: O, expires_at: O, used_at: O },
  // Recovery codes and pending second steps (CC-200): hashes only.
  mfa_recovery_codes: { id: O, user_id: O, code_hash: S, created_at: O, used_at: O },
  mfa_challenges: { token_hash: S, user_id: O, created_at: O, expires_at: O },
  // Resetting two-step sign-in after a lost phone (CC-235): link hashes only.
  mfa_recovery_requests: {
    id: O, user_id: O, confirm_hash: S, cancel_hash: S, created_at: O, confirm_expires_at: O,
    confirmed_at: O, ready_at: O, cancelled_at: O, completed_at: O,
  },
  // Shared rate-limit counters (CC-204): keys are hashes of an address or account id.
  rate_limits: { key: O, reset_at: O, count: O },
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
  audit_events: { id: O, at: O, actor_user_id: O, subject_user_id: O, action: O, detail: S },
  schema_migrations: { version: O, applied_at: O },
  // Masked views for auditors (CC-184).
  audit_people_masked: { user_id: O, role: O, name_masked: I, email_masked: I, phone_masked: I, ssn_masked: S, created_at: O },
  audit_payment_methods_masked: {
    user_id: O, kind: O, label: S, detail: S, number_masked: S, routing_masked: S, is_primary: O, fee_cents: O, created_at: O,
  },
};
