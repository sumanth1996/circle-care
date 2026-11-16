import type { State, ScamKind, ScamReport } from "./types";
import { audit, allowed, pushAlert } from "./store";
import { can } from "./policy";
import { clock, nameOf, todayOf } from "./selectors";
import { addDays, at, uid, ymd } from "../lib/time";
import { ELDER } from "./demo";
import { SCAM_TIPS } from "./scamTips";

// Sprint 22: scam help (CC-132 – CC-134). Maggie taps "Is this a scam?", says what kind of contact it was, and can
// add a short note or a photo. Her guardians are alerted at once (even in quiet hours) and work through a checklist;
// when one marks it resolved, Maggie sees she's safe. The note and photo reach her guardians only, never family or
// caregivers, and never the audit log. The photo is removed 30 days after the report is resolved.

export const SCAM_KINDS: { kind: ScamKind; label: string; said: string }[] = [
  { kind: "call", label: "Phone call", said: "a phone call" },
  { kind: "text", label: "Text message", said: "a text message" },
  { kind: "email", label: "Email", said: "an email" },
  { kind: "door", label: "Someone at the door", said: "someone at the door" },
  { kind: "payment", label: "Payment request", said: "a request for money" },
];

export const SCAM_NOTE_MAX = 280;
/** Days after a report is resolved that its photo is kept. */
export const SCAM_PHOTO_DAYS = 30;

/** CC-133: what a guardian works through. Circle Care names where to report but never fills in or sends anything. */
export const SCAM_CHECKLIST: { id: string; text: string }[] = [
  { id: "bank", text: "Call Maggie's bank using the number on her card or statement" },
  { id: "card", text: "Freeze or replace any card whose details she shared" },
  { id: "codes", text: "Change any password or code she shared" },
  { id: "report", text: "Report it to the FTC or the state attorney general's office" },
];

const kindSaid = (k: ScamKind) => SCAM_KINDS.find((x) => x.kind === k)?.said ?? "something";

/** The guardians who hear about a report: active members with the guardian role. */
export const scamGuardians = (s: State) => s.members.filter((m) => m.role === "guardian" && m.status === "active");

/** CC-132 criterion 3: what Maggie sees the moment she sends it. */
export function scamSentLine(s: State) {
  const g = scamGuardians(s)[0];
  return g ? `Don't send money or share codes. ${g.short} has been told.` : "Don't send money or share codes. Hang up and call someone you trust.";
}

export type ScamInput = { kind: ScamKind; note?: string; photoId?: string };

/** CC-132: Maggie reports a possible scam. Only Maggie. The audit log says a report was made, never what it said. */
export function reportScam(s: State, by: string, input: ScamInput): ScamReport | null {
  if (by !== ELDER) { audit(s, by, "denied", "report a scam for Maggie"); return null; }
  if (!allowed(s, by, "write", "scams")) return null;
  if (!SCAM_KINDS.some((k) => k.kind === input.kind)) return null;
  const note = input.note?.trim().slice(0, SCAM_NOTE_MAX) || undefined;
  const r: ScamReport = { id: uid("scam"), kind: input.kind, by, at: clock(s).toISOString(), checked: [], status: "open", ...(note ? { note } : {}), ...(input.photoId ? { photoId: input.photoId } : {}) };
  s.scams = [...(s.scams ?? []), r];
  audit(s, by, "created", "a scam report");
  // The lock screen shows no details; the alert opens the report. Urgent, so quiet hours don't hold it (CC-208).
  pushAlert(s, {
    key: `scam-${r.id}`, to: ["guardian"], severity: "warning", urgent: true, title: "Circle Care needs your attention",
    detail: `Maggie asked "Is this a scam?" about ${kindSaid(r.kind)}. Call her before she sends money or shares a code.`,
    link: `/app/guardian/scams/${r.id}`,
  });
  return r;
}

/** Who can open a report: Maggie and her guardians. */
export const canSeeScams = (s: State, viewer: string) => can(s, viewer, "read", "scams");

/** CC-133 criterion 2: a guardian ticks or unticks a checklist item. Every guardian sees the same list. */
export function checkScam(s: State, by: string, id: string, item: string, on: boolean) {
  const r = s.scams.find((x) => x.id === id);
  if (!r || !SCAM_CHECKLIST.some((c) => c.id === item)) return false;
  if (!allowed(s, by, "respond", "scams")) return false;
  r.checked = on ? [...new Set([...r.checked, item])] : r.checked.filter((c) => c !== item);
  audit(s, by, "updated", "a scam report's checklist");
  return true;
}

/** CC-133 criterion 3: a guardian marks it resolved, with or without a note for Maggie. */
export function resolveScam(s: State, by: string, id: string, reply?: string) {
  const r = s.scams.find((x) => x.id === id);
  if (!r || r.status === "resolved") return false;
  if (!allowed(s, by, "respond", "scams")) return false;
  r.status = "resolved";
  r.resolvedBy = by;
  r.resolvedAt = clock(s).toISOString();
  const text = reply?.trim().slice(0, SCAM_NOTE_MAX);
  if (text) r.reply = text;
  audit(s, by, "updated", "resolved a scam report");
  pushAlert(s, { key: `scam-safe-${r.id}`, to: ["elder"], severity: "info", title: "Update from Circle Care", detail: scamAnswer(s, r), link: "/app/elder" });
  return true;
}

/** What Maggie sees once it's resolved: the guardian's note, or "Sarah checked this. You're safe." */
export function scamAnswer(s: State, r: ScamReport) {
  return r.reply ? `${nameOf(s, r.resolvedBy)}: ${r.reply}` : `${nameOf(s, r.resolvedBy)} checked this. You're safe.`;
}

/** Maggie read the answer. */
export function seeScamAnswer(s: State, by: string, id: string) {
  const r = s.scams.find((x) => x.id === id);
  if (!r || by !== ELDER || r.status !== "resolved") return false;
  r.elderSeenAt = clock(s).toISOString();
  return true;
}

/** Maggie's reports: open ones, and resolved ones she hasn't read yet. */
export const elderScams = (s: State) => (s.scams ?? []).filter((r) => r.status === "open" || !r.elderSeenAt);

export const openScams = (s: State) => (s.scams ?? []).filter((r) => r.status === "open");

/** Runs on every tick: a resolved report's photo is removed after 30 days. */
export function runScams(s: State) {
  const now = clock(s);
  for (const r of s.scams ?? []) {
    if (r.status !== "resolved" || !r.photoId || !r.resolvedAt) continue;
    if (now.getTime() - new Date(r.resolvedAt).getTime() >= SCAM_PHOTO_DAYS * 86400000) {
      s.filesToDelete = [...(s.filesToDelete ?? []), r.photoId];
      r.photoId = undefined;
      r.photoRemovedAt = now.toISOString();
    }
  }
}

/** Whether Maggie has someone to tell: shown on the report screen when she has no guardian. */
export const hasGuardian = (s: State) => scamGuardians(s).length > 0;

/* ---------------- CC-134: weekly scam-awareness tips ---------------- */

/** When the weekly card first shows on Monday, in Maggie's time zone. */
export const TIP_FROM = "08:00";
/** "Not now" brings the card back the next day, at most twice a week. */
export const TIP_NOT_NOW_MAX = 3;

/** The Monday of the week `d` is in, YYYY-MM-DD. */
export function mondayOf(d: Date) {
  const back = (d.getDay() + 6) % 7;
  return ymd(addDays(d, -back));
}

/** The next tip Maggie hasn't finished, in order. */
export const nextTip = (s: State) => SCAM_TIPS.find((t) => !(s.scamTips?.done ?? []).some((d) => d.id === t.id));

/** "3 of 12 tips". */
export const tipProgress = (s: State) => `${(s.scamTips?.done ?? []).length} of ${SCAM_TIPS.length} tips`;

/**
 * CC-134: this week's card, if it shows now. From Monday 8 AM, one tip a week, until Maggie taps Got it. Not now hides
 * it until the next day, and it comes back at most twice. Nothing once all 12 are done.
 */
export function tipCard(s: State) {
  const tip = nextTip(s);
  if (!tip) return undefined;
  const now = clock(s);
  const monday = mondayOf(now);
  if (now.getTime() < at(monday, TIP_FROM).getTime()) return undefined;
  const t = s.scamTips;
  if ((t?.done ?? []).some((d) => d.at >= at(monday, "00:00").toISOString())) return undefined;
  if (t?.week === monday && (t.notNow >= TIP_NOT_NOW_MAX || t.hiddenOn === todayOf(s))) return undefined;
  return tip;
}

/** Maggie tapped Got it: the tip is done and the progress moves on. Only Maggie. */
export function tipGotIt(s: State, by: string) {
  const tip = tipCard(s);
  if (!tip || by !== ELDER || !allowed(s, by, "write", "tips")) return false;
  s.scamTips = { ...s.scamTips, done: [...s.scamTips.done, { id: tip.id, at: clock(s).toISOString() }] };
  return true;
}

/** Maggie tapped Not now: the card comes back tomorrow, at most twice this week. */
export function tipNotNow(s: State, by: string) {
  if (!tipCard(s) || by !== ELDER || !allowed(s, by, "write", "tips")) return false;
  const monday = mondayOf(clock(s));
  const notNow = s.scamTips.week === monday ? s.scamTips.notNow + 1 : 1;
  s.scamTips = { ...s.scamTips, week: monday, notNow, hiddenOn: todayOf(s) };
  return true;
}
