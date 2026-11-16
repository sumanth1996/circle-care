import type { State, HelpRequest, HelpKind, Persona } from "./types";
import { audit, pushAlert, allowed } from "./store";
import { can } from "./policy";
import { clock, nameOf, personaOf, member } from "./selectors";
import { at as atTime, addDays, fmtShortDay, fmtTime, uid, ymd } from "../lib/time";
import { ELDER, GUARDIAN } from "./demo";
import { sendChat } from "./everydayActions";

// Sprint 16 "Help board" (CC-209, CC-210). Plain functions on the state, so the store, the tests and a
// future API share them. In production these run on the server: the revision check in claimHelp is the
// server deciding which of two claims came first.

export const HELP_NOTE_MAX = 280;
/** CC-209: Sarah is told when a request is still unclaimed this long before it's due. */
export const UNCLAIMED_NOTICE_H = 24;
/** CC-210: the person who has it is asked "Did this happen?" this long after its time. */
export const ASK_DONE_AFTER_MIN = 60;
/** CC-209: finished and cancelled requests leave the boards after 30 days. */
export const BOARD_DAYS = 30;

export const HELP_KINDS: { key: HelpKind; label: string }[] = [
  { key: "ride", label: "A ride" },
  { key: "groceries", label: "Groceries" },
  { key: "company", label: "Company" },
  { key: "visit", label: "A visit" },
  { key: "phone", label: "Help with my phone" },
  { key: "other", label: "Something else" },
];
const KIND_NOUN: Record<HelpKind, string> = { ride: "Ride", groceries: "Groceries", company: "Company", visit: "Visit", phone: "Phone help", other: "Help" };

/** CC-211: the choices on Maggie's "I could use a hand" screen, as she'd say them. "Something else" is typed or dictated. */
export const ELDER_HELP_KINDS: { key: HelpKind; label: string }[] = [
  { key: "groceries", label: "Groceries" },
  { key: "ride", label: "A ride" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Help with my phone" },
  { key: "other", label: "Something else" },
];

const dueOf = (r: HelpRequest) => atTime(r.date, r.anyTime ? "23:59" : r.time);
const when = (r: HelpRequest) => (r.anyTime ? fmtShortDay(r.date) : `${fmtShortDay(r.date)} at ${fmtTime(r.time)}`);
/** The safe name of a request, for alerts and the circle: never an appointment's reason, clinic or the free text.
 *  A Coming Home item (CC-213) goes by its item name, which has no reason for the hospital stay. */
export const helpLabel = (r: HelpRequest) => (r.title ? r.title : !r.appointmentId ? KIND_NOUN[r.kind] : r.kind === "ride" ? "Ride to an appointment" : `${KIND_NOUN[r.kind]} for an appointment`);

/** Who may see one request: the people Sarah (or Maggie) picked, plus Maggie and Sarah, while the sharing rules allow it. */
export function canSeeHelp(s: State, viewerId: string, r: HelpRequest) {
  if (!can(s, viewerId, "read", "help")) return false;
  return viewerId === ELDER || viewerId === GUARDIAN || r.audience.includes(viewerId);
}

/** People Sarah can pick: everyone active in the circle whose role may read help requests, except Maggie and Sarah.
 *  Maggie's "Pause sharing" doesn't shrink the list: a request posted while paused waits on the board and reaches
 *  them once sharing is back on (no alert goes out while paused). */
export function helpCandidates(s: State) {
  const unpaused: State = { ...s, settings: { ...s.settings, sharingPaused: false } };
  return s.members.filter((m) => m.status === "active" && m.id !== ELDER && m.id !== GUARDIAN && can(unpaused, m.id, "read", "help"));
}

/** Whether a request still belongs on the boards (CC-209: closed ones leave after 30 days; cancelled ones at once). */
export function onBoard(s: State, r: HelpRequest) {
  if (r.status === "open" || r.status === "claimed") return true;
  if (r.status === "cancelled") return false;
  return !!r.closedAt && new Date(r.closedAt).getTime() > addDays(clock(s), -BOARD_DAYS).getTime();
}

/** The board one person sees: open, claimed and recently done requests they may see. */
export function helpBoard(s: State, viewerId: string) {
  return (s.help ?? []).filter((r) => canSeeHelp(s, viewerId, r) && onBoard(s, r)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** CC-209: every request ever posted, for Maggie and Sarah only. */
export function helpHistory(s: State, viewerId: string) {
  if (viewerId !== ELDER && viewerId !== GUARDIAN) return [];
  if (!can(s, viewerId, "read", "help")) return [];
  return [...(s.help ?? [])].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * What one viewer sees of a request (CC-209). A request tied to an appointment shows as an appointment only:
 * the doctor and the reason stay with Maggie and Sarah. Someone without appointment access sees only
 * "Appointment" and the time, with no note. The person who has the request, with appointment access, also
 * sees where to go, so they can do it.
 */
export function helpView(s: State, viewerId: string, r: HelpRequest) {
  const appt = r.appointmentId ? s.appointments.find((a) => a.id === r.appointmentId) : undefined;
  if (!r.appointmentId) return { title: r.title ?? KIND_NOUN[r.kind], when: when(r), note: r.note, place: "", masked: false };
  if (!can(s, viewerId, "read", "appointments")) return { title: "Appointment", when: when(r), note: "", place: "", masked: true };
  const full = viewerId === ELDER || viewerId === GUARDIAN;
  const title = full && appt ? `${KIND_NOUN[r.kind]} for ${appt.title}` : helpLabel(r);
  const place = appt && (full || (r.status === "claimed" && r.claimedBy === viewerId)) ? appt.location : "";
  return { title, when: when(r), note: r.note, place, masked: false };
}

/** Alerts go only to people who may see the request right now (so never while sharing is paused). */
function personasFor(s: State, r: HelpRequest, ids: string[], except?: string): Persona[] {
  const out = new Set<Persona>();
  for (const id of ids) {
    if (id === except || !canSeeHelp(s, id, r)) continue;
    const p = personaOf(id);
    if (p) out.add(p);
  }
  return [...out];
}

function note(s: State, r: HelpRequest, by: string, change: string) {
  r.history.push({ at: clock(s).toISOString(), by, change });
}

export type HelpInput = { kind: HelpKind; note: string; date: string; time: string; appointmentId?: string; audience: string[] };

/** CC-209: Sarah posts a request; each person she picked gets "New help request in Circle Care". */
export function postHelp(s: State, by: string, input: HelpInput): HelpRequest | null {
  if (!allowed(s, by, "write", "help")) return null;
  if (!HELP_KINDS.some((k) => k.key === input.kind)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time) || Number.isNaN(atTime(input.date, input.time).getTime())) return null;
  const text = input.note.trim().slice(0, HELP_NOTE_MAX);
  if (input.kind === "other" && !text) return null;
  const allowedIds = new Set(helpCandidates(s).map((m) => m.id));
  const audience = [...new Set(input.audience)].filter((id) => allowedIds.has(id));
  if (!audience.length) return null;
  const appointmentId = input.appointmentId && s.appointments.some((a) => a.id === input.appointmentId) ? input.appointmentId : undefined;
  const now = clock(s).toISOString();
  const r: HelpRequest = { id: uid("help"), kind: input.kind, note: text, date: input.date, time: input.time, appointmentId, audience, by, at: now, status: "open", rev: 1, history: [] };
  note(s, r, by, "Posted");
  s.help = [...(s.help ?? []), r];
  audit(s, by, "created", "a help request");
  announce(s, r, `new-${r.id}`);
  return r;
}

function announce(s: State, r: HelpRequest, key: string) {
  const to = personasFor(s, r, r.audience, r.by);
  if (to.length) pushAlert(s, { key: `help-${key}`, to, severity: "info", title: "New help request in Circle Care", detail: `${nameOf(s, r.by)} asked for help: ${helpLabel(r)}, ${when(r)}.`, link: "/app/help" });
}

/* ---------------- CC-211: Maggie asks for a hand herself ---------------- */

/** The people Maggie lets see the help she asks for, still in the circle and still allowed to see help requests. */
export function helpFromPeople(s: State) {
  const ok = new Set(helpCandidates(s).map((m) => m.id));
  return (s.settings.helpFrom ?? []).filter((id) => ok.has(id));
}

/** CC-211: Maggie chooses who sees her requests (Privacy Center). Only she can; the change is audited. */
export function setHelpFrom(s: State, by: string, ids: string[]) {
  if (by !== ELDER || !allowed(s, by, "propose", "help")) { if (by !== ELDER) audit(s, by, "denied", "change who sees Maggie's help requests"); return false; }
  const ok = new Set(helpCandidates(s).map((m) => m.id));
  s.settings = { ...s.settings, helpFrom: [...new Set(ids)].filter((id) => ok.has(id)) };
  audit(s, by, "updated", "who sees the help she asks for");
  return true;
}

export type AskInput = { kind: HelpKind; date: string; note?: string };

/**
 * CC-211: Maggie picks what and which day, and taps Send. It goes to the people she allowed, and Sarah is told.
 * There is no time: it shows as the day only. Spoken "Something else" arrives as text; no audio is kept.
 */
export function askHelp(s: State, by: string, input: AskInput): HelpRequest | null {
  if (by !== ELDER || !allowed(s, by, "propose", "help")) return null;
  if (!ELDER_HELP_KINDS.some((k) => k.key === input.kind)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < ymd(clock(s))) return null;
  const text = (input.note ?? "").trim().slice(0, HELP_NOTE_MAX);
  if (input.kind === "other" && !text) return null;
  const audience = helpFromPeople(s);
  if (!audience.length) return null;
  const now = clock(s).toISOString();
  const r: HelpRequest = { id: uid("help"), kind: input.kind, note: text, date: input.date, time: "12:00", anyTime: true, audience, by, at: now, status: "open", rev: 1, history: [] };
  note(s, r, by, "Asked");
  s.help = [...(s.help ?? []), r];
  audit(s, by, "created", "a help request");
  announce(s, r, `new-${r.id}`);
  tellSarah(s, r, `asked-${r.id}`, `Maggie asked for help: ${helpLabel(r)}, ${when(r)}.`);
  return r;
}

const DOING: Record<HelpKind, string> = {
  ride: "is giving you a ride", groceries: "is bringing groceries", company: "is coming to keep you company",
  visit: "is coming to visit", phone: "is helping with your phone", other: "is helping you",
};

/** CC-211: what Maggie's home says about the help she asked for, like "James is bringing groceries Tuesday". */
export function elderHelpLines(s: State) {
  const today = ymd(clock(s));
  return (s.help ?? [])
    .filter((r) => r.by === ELDER && r.date >= today && (r.status === "open" || r.status === "claimed"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const day = r.date === today ? "today" : fmtShortDay(r.date).split(",")[0];
      return {
        id: r.id,
        text: r.status === "claimed" && r.claimedBy ? `${member(s, r.claimedBy)?.short ?? nameOf(s, r.claimedBy)} ${DOING[r.kind]} ${day}` : `You asked for ${helpLabel(r).toLowerCase()} ${day}. No one has it yet.`,
        claimed: r.status === "claimed",
      };
    });
}

/** CC-209: still unclaimed a day before; Sarah sends it again to the same people. */
export function repostHelp(s: State, by: string, id: string) {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || r.status !== "open" || !allowed(s, by, "write", "help")) return false;
  r.rev += 1;
  note(s, r, by, "Posted again");
  audit(s, by, "updated", "a help request (posted again)");
  announce(s, r, `again-${r.id}-${r.rev}`);
  return true;
}

/** CC-209: Sarah cancels; it leaves every board and whoever had it is told. */
export function cancelHelp(s: State, by: string, id: string) {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || (r.status !== "open" && r.status !== "claimed") || !allowed(s, by, "write", "help")) return false;
  const had = r.claimedBy;
  r.status = "cancelled";
  r.closedAt = clock(s).toISOString();
  r.rev += 1;
  note(s, r, by, "Cancelled");
  audit(s, by, "removed", "a help request (cancelled)");
  if (had && had !== by) {
    const to = personasFor(s, r, [had]);
    if (to.length) pushAlert(s, { key: `help-cancel-${r.id}`, to, severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, by)} cancelled a help request you had: ${helpLabel(r)}, ${when(r)}.`, link: "/app/help" });
  }
  return true;
}

export type ClaimResult = { ok: true } | { ok: false; heldBy?: string };

/**
 * CC-210: "I'll do it". The claim carries the revision the person saw. Only the first claim on that
 * revision succeeds; a second one at the same moment sees who has it.
 */
export function claimHelp(s: State, by: string, id: string, seenRev: number): ClaimResult {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || !canSeeHelp(s, by, r)) { audit(s, by, "denied", "respond help"); return { ok: false }; }
  if (!allowed(s, by, "respond", "help")) return { ok: false };
  if (r.status !== "open" || r.rev !== seenRev) return { ok: false, heldBy: r.status === "claimed" ? r.claimedBy : undefined };
  r.status = "claimed";
  r.claimedBy = by;
  r.claimedAt = clock(s).toISOString();
  r.askedDone = false;
  r.notYet = false;
  r.rev += 1;
  note(s, r, by, "Claimed");
  audit(s, by, "updated", "a help request (claimed)");
  if (by !== GUARDIAN) tellSarah(s, r, `claim-${r.id}-${r.rev}`, `${nameOf(s, by)} has this: ${helpLabel(r)}, ${when(r)}.`);
  return { ok: true };
}

function tellSarah(s: State, _r: HelpRequest, key: string, detail: string) {
  if (can(s, GUARDIAN, "read", "help")) pushAlert(s, { key: `help-${key}`, to: ["guardian"], severity: "info", title: "Update from Circle Care", detail, link: "/app/help" });
}

/** CC-210: "Can't anymore". The request reopens and Sarah is told. */
export function releaseHelp(s: State, by: string, id: string) {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || r.status !== "claimed" || r.claimedBy !== by) return false;
  r.status = "open";
  r.claimedBy = undefined;
  r.claimedAt = undefined;
  r.askedDone = false;
  r.notYet = false;
  r.rev += 1;
  note(s, r, by, "Can't do it anymore");
  audit(s, by, "updated", "a help request (reopened)");
  if (by !== GUARDIAN) tellSarah(s, r, `release-${r.id}-${r.rev}`, `${nameOf(s, by)} can't do this anymore, so it's open again: ${helpLabel(r)}, ${when(r)}.`);
  return true;
}

/** CC-210: marked done; it moves to Done with the time and counts in Who did what this week. */
export function finishHelp(s: State, by: string, id: string) {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || r.status !== "claimed" || r.claimedBy !== by) return false;
  r.status = "done";
  r.doneBy = by;
  r.closedAt = clock(s).toISOString();
  r.rev += 1;
  note(s, r, by, "Done");
  audit(s, by, "updated", "a help request (done)");
  if (by !== GUARDIAN) tellSarah(s, r, `done-${r.id}`, `${nameOf(s, by)} finished: ${helpLabel(r)}, ${when(r)}.`);
  return true;
}

/** CC-210: "Not yet" to "Did this happen?". The question isn't asked again. */
export function notYetHelp(s: State, by: string, id: string) {
  const r = (s.help ?? []).find((x) => x.id === id);
  if (!r || r.status !== "claimed" || r.claimedBy !== by) return false;
  r.notYet = true;
  note(s, r, by, "Not done yet");
  return true;
}

/** Whether to show "Did this happen?" on the card of the person who has it. */
export const askingDone = (r: HelpRequest, viewerId: string) => r.status === "claimed" && r.claimedBy === viewerId && !!r.askedDone && !r.notYet;

/** Scheduler step, run with the rest of the rules engine: the 24-hour notice and the "Did this happen?" question. */
export function runHelp(s: State) {
  const now = clock(s).getTime();
  for (const r of s.help ?? []) {
    const due = dueOf(r).getTime();
    // CC-209: posted more than a day ahead and still unclaimed a day before.
    if (r.status === "open" && !r.remindedUnclaimed && now >= due - UNCLAIMED_NOTICE_H * 3600000 && now < due && new Date(r.at).getTime() <= due - UNCLAIMED_NOTICE_H * 3600000) {
      r.remindedUnclaimed = true;
      tellSarah(s, r, `unclaimed-${r.id}`, `No one has picked up ${helpLabel(r).toLowerCase()}, ${when(r)}. Post it again or do it yourself.`);
    }
    // CC-210: an hour after its time, the person who has it is asked once.
    if (r.status === "claimed" && r.claimedBy && !r.askedDone && now >= due + ASK_DONE_AFTER_MIN * 60000) {
      r.askedDone = true;
      const to = personasFor(s, r, [r.claimedBy]);
      if (to.length) pushAlert(s, { key: `help-ask-${r.id}-${r.rev}`, to, severity: "info", title: "Update from Circle Care", detail: `Did this happen? ${helpLabel(r)}, ${when(r)}.`, link: "/app/help" });
    }
  }
}

/** CC-210: Who helped this week. Requests finished in the last 7 days, by person, in A to Z order (nobody is ranked). */
export function helpWeek(s: State, viewerId: string) {
  const since = addDays(clock(s), -7).getTime();
  const by = new Map<string, string[]>();
  for (const r of s.help ?? []) {
    if (r.status !== "done" || !r.doneBy || !r.closedAt || new Date(r.closedAt).getTime() < since || !canSeeHelp(s, viewerId, r)) continue;
    by.set(r.doneBy, [...(by.get(r.doneBy) ?? []), helpView(s, viewerId, r).title]);
  }
  return [...by.entries()].map(([id, did]) => ({ id, name: member(s, id)?.short ?? nameOf(s, id), did })).sort((a, b) => a.name.localeCompare(b.name));
}


/* ---------------- CC-212: Who did what this week ---------------- */

export type WhoDid = { id: string; name: string; help: number; tasks: number; visits: number; left: boolean };

/**
 * CC-212: everyone who helped in the last 7 days, A to Z, with what they did and how many: help requests
 * finished, care tasks done (by anyone but Maggie) and caregiver visits finished. Nobody is ranked and nothing
 * is counted as missed. Someone who has left the circle still shows for what they did, without a Thank button.
 * Sarah and Maggie see it.
 */
export function whoDidWhat(s: State, viewerId: string): WhoDid[] {
  if (viewerId !== ELDER && viewerId !== GUARDIAN) return [];
  if (!can(s, viewerId, "read", "help")) return [];
  const since = addDays(clock(s), -7).getTime();
  const rows = new Map<string, WhoDid>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      const m = s.members.find((x) => x.id === id);
      r = { id, name: m?.short ?? nameOf(s, id), help: 0, tasks: 0, visits: 0, left: !m || m.status !== "active" };
      rows.set(id, r);
    }
    return r;
  };
  for (const r of s.help ?? []) if (r.status === "done" && r.doneBy && r.closedAt && new Date(r.closedAt).getTime() >= since) row(r.doneBy).help += 1;
  for (const l of s.taskLogs) if (l.by !== ELDER && l.by !== "system" && new Date(l.at).getTime() >= since && new Date(l.at).getTime() <= clock(s).getTime()) row(l.by).tasks += 1;
  for (const v of s.visits) if (v.checkOut && new Date(v.checkOut).getTime() >= since && new Date(v.checkOut).getTime() <= clock(s).getTime()) row(v.caregiverId).visits += 1;
  return [...rows.values()].filter((r) => r.id !== ELDER).sort((a, b) => a.name.localeCompare(b.name));
}

/** What one row says, in plain words: "2 help requests, 5 care tasks, 3 visits". */
export function whoDidLine(r: WhoDid) {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "");
  return [part(r.help, "help request", "help requests"), part(r.tasks, "care task", "care tasks"), part(r.visits, "visit", "visits")].filter(Boolean).join(", ");
}

/** CC-212: Maggie's Thank button sends a short note in the family chat. Not for someone who has left. */
export function thankFor(s: State, by: string, personId: string) {
  if (by !== ELDER) { audit(s, by, "denied", "send a thank-you"); return false; }
  const m = s.members.find((x) => x.id === personId && x.status === "active");
  if (!m || m.id === ELDER) return false;
  return sendChat(s, by, `Thank you, ${m.short}, for all your help this week.`);
}
