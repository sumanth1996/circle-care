// Sprint 26 "Safer Doses": one record per dose (CC-243), undo within 10 minutes (CC-244), stopped medicines on
// their own list (CC-246) and a demo scenario with labelled dummy profiles (CC-248).

import type { DoseEvent, DoseLog, DoseStatus, Medication, State } from "./types";
import { allowed, audit, pushAlert } from "./store";
import { settleDose } from "./calmAlerts";
import { clock, dosesFor, nameOf, personaOf, todayOf, yesterdayOf } from "./selectors";
import { ELDER, GUARDIAN, CAREGIVER, FAMILY } from "./demo";
import { addDays, at as atTime, fmtTime, uid } from "../lib/time";

/** "Jan 5" */
const monthDay = (d: string | Date) => new Date(typeof d === "string" && d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** CC-244: how long the person who marked a dose can take it back. After that only "Correct this" is offered. */
export const UNDO_MIN = 10;

export const statusWord: Record<DoseStatus, string> = { taken: "Taken", skipped: "Skipped", refused: "Declined" };

const minutesSince = (s: State, iso: string) => (clock(s).getTime() - new Date(iso).getTime()) / 60000;

/** The dose record for one slot, if anyone marked it. */
export const slotDose = (s: State, medId: string, date: string, time: string) =>
  s.doses.find((d) => d.medId === medId && d.date === date && d.time === time);

function addEvent(s: State, e: Omit<DoseEvent, "id"> & { id?: string }) {
  const ev = { ...e, id: e.id ?? uid("de") } as DoseEvent;
  s.doseHistory = [...(s.doseHistory ?? []), ev];
  return ev;
}

/* ---------- CC-243: one record per dose ---------- */

/**
 * A second mark of a dose already marked isn't saved: it's kept as a "duplicate" event naming who got there
 * first, and audited. Called from logDose before anything changes.
 */
export function refuseDuplicate(s: State, by: string, existing: DoseLog, status: DoseStatus) {
  addEvent(s, {
    kind: "duplicate", medId: existing.medId, date: existing.date, time: existing.time,
    doseId: existing.id, status, firstBy: existing.by, by, at: clock(s).toISOString(),
  });
  audit(s, by, "denied", `a second record of a dose (${medName(s, existing.medId)}), already recorded by ${nameOf(s, existing.by)}`);
}

/** CC-243: Sarah, or the person who marked the dose, may correct it. Nobody else is offered it. */
export const canCorrect = (who: string, d: DoseLog) => who === GUARDIAN || who === d.by;

/** CC-244: the person who marked it, within 10 minutes, and only before anyone corrected it. */
export const canUndo = (s: State, who: string, d: DoseLog) => {
  // A mark stamped after this tab's clock (another device a little ahead) isn't "just now" here, so it isn't offered.
  const m = minutesSince(s, d.at);
  return who === d.by && !d.correctedAt && m >= 0 && m < UNDO_MIN;
};

/** Minutes of undo left, rounded up (0 when gone). */
export const undoLeft = (s: State, d: DoseLog) => Math.max(0, Math.ceil(UNDO_MIN - minutesSince(s, d.at)));

/**
 * CC-243 criterion 3: change a dose's status (and note). The first entry stays in `doseHistory`, the change is
 * audited, and the person who marked it is told when someone else made the change.
 */
export function correctDose(s: State, by: string, doseId: string, status: DoseStatus, reason?: string) {
  const d = s.doses.find((x) => x.id === doseId);
  if (!d) return false;
  if (!canCorrect(by, d)) { audit(s, by, "denied", `correct a dose record (${medName(s, d.medId)})`); return false; }
  if (!allowed(s, by, "write", "doses")) return false;
  const note = status === "taken" ? undefined : reason?.trim() || undefined;
  if (d.status === status && (d.reason ?? undefined) === note) return false;
  const at = clock(s).toISOString();
  addEvent(s, {
    kind: "corrected", medId: d.medId, date: d.date, time: d.time, doseId: d.id, from: d.status, status,
    firstBy: d.by, markedAt: d.at, by, at, ...(note ? { reason: note } : {}),
  });
  d.status = status;
  d.reason = note;
  d.correctedAt = at;
  d.correctedBy = by;
  audit(s, by, "updated", `a dose record (${medName(s, d.medId)}): ${statusWord[status].toLowerCase()}, first entry kept`);
  if (status === "taken") settleDose(s, by, d.medId, d.time, status, undefined, d.date);
  const first = personaOf(d.by);
  if (by !== d.by && first) {
    pushAlert(s, {
      key: `dose-fix-${d.id}-${at}`, to: [first], severity: "info", title: "Update from Circle Care",
      detail: `${nameOf(s, by)} corrected the ${fmtTime(d.time)} dose you recorded. It now says ${statusWord[status].toLowerCase()}.`,
      link: `/app/${first}`,
    });
  }
  return true;
}

/* ---------- CC-244: undo ---------- */

/**
 * Take back a mark made by mistake. The record goes, history says "undone", the missed-dose escalation this
 * mark settled is open again (and carries on from where it was), and if an all-clear went out, the same
 * people get one short note with no medicine name.
 */
export function undoDose(s: State, by: string, doseId: string) {
  const d = s.doses.find((x) => x.id === doseId);
  if (!d) return false;
  if (!canUndo(s, by, d)) { audit(s, by, "denied", `undo a dose record (${medName(s, d.medId)})`); return false; }
  if (!allowed(s, by, "write", "doses")) return false;
  const key = `${d.medId}@${d.time}`;
  s.doses = s.doses.filter((x) => x.id !== d.id);
  const ev = addEvent(s, { kind: "undone", medId: d.medId, date: d.date, time: d.time, doseId: d.id, status: d.status, firstBy: d.by, markedAt: d.at, by, at: clock(s).toISOString() });
  // What this mark settled (CC-206 resolutions are stamped with who and when) is unsettled again.
  const settledByIt = (r?: { at: string; by: string }) => !!r && r.by === d.by && Math.abs(new Date(r.at).getTime() - new Date(d.at).getTime()) < 5000;
  for (const a of s.alerts) {
    if (!a.key) continue;
    const missed = a.key === `dose-cg-${d.date}-${key}` || a.key === `dose-g-${d.date}-${key}`;
    const reminder = a.key.startsWith(`dose-rem-${d.date}-${key}-`);
    if ((missed || reminder) && settledByIt(a.resolved)) delete a.resolved;
  }
  const clear = s.alerts.find((a) => a.key === `dose-clear-${d.date}-${key}`);
  if (clear) {
    // Keep the old all-clear under another key, so a new mark can send a fresh one.
    clear.key = `${clear.key}-undone-${ev.id}`;
    pushAlert(s, {
      key: `dose-undo-${d.date}-${key}-${ev.id}`, to: clear.to, severity: "info", title: "Update from Circle Care",
      detail: `Correction: the ${fmtTime(d.time)} dose was marked by mistake and has been undone. It isn't confirmed yet.`,
      link: clear.link,
    });
  }
  audit(s, by, "removed", `a dose record (${medName(s, d.medId)}), undone within ${UNDO_MIN} minutes`);
  return true;
}

/** CC-244: the dose Maggie (or whoever) marked most recently that she can still undo. */
export function undoable(s: State, who: string) {
  return [...s.doses].filter((d) => canUndo(s, who, d)).sort((a, b) => b.at.localeCompare(a.at))[0];
}

/* ---------- CC-246: stopped medicines ---------- */

export const isStopped = (m: Medication) => !!m.stopped;

/** A stopped medicine with this name (ignoring case and spaces), for the "Add it again?" check. */
export function stoppedMatch(s: State, name: string) {
  const n = name.trim().toLowerCase();
  return n ? s.meds.find((m) => m.stopped && m.name.trim().toLowerCase() === n) : undefined;
}

export const stoppedLine = (s: State, m: Medication) =>
  m.stopped ? `Stopped on ${monthDay(m.stopped.at)} by ${nameOf(s, m.stopped.by)}` : "";

/** Stop a medicine for good: it moves to the Stopped list, with no reminders and no escalation. */
export function stopMed(s: State, by: string, medId: string, reason?: string) {
  if (!allowed(s, by, "write", "meds")) return false;
  const m = s.meds.find((x) => x.id === medId);
  if (!m || m.stopped) return false;
  const at = clock(s).toISOString();
  m.stopped = { at, by, ...(reason?.trim() ? { reason: reason.trim() } : {}) };
  m.paused = true;
  m.history = [...m.history, { at, by, change: `Stopped${reason?.trim() ? `: ${reason.trim()}` : ""}` }];
  s.reminders = (s.reminders ?? []).filter((r) => !r.key.startsWith(`${m.id}@`));
  s.approvals.push({ id: uid("ap"), kind: "med-change", title: `Stopped ${m.name}`, detail: "Changed directly by the guardian.", requestedBy: by, at, status: "approved", decidedAt: at, elderSeen: s.persona === "elder" });
  audit(s, by, "updated", `medication ${m.name} (stopped)`);
  return true;
}

/** Restart a stopped medicine. Sarah's change is approved directly and recorded, as any other (CC-37). */
export function restartMed(s: State, by: string, medId: string) {
  if (!allowed(s, by, "write", "meds")) return false;
  const m = s.meds.find((x) => x.id === medId);
  if (!m?.stopped) return false;
  const at = clock(s).toISOString();
  delete m.stopped;
  m.paused = false;
  m.history = [...m.history, { at, by, change: "Restarted" }];
  s.approvals.push({ id: uid("ap"), kind: "med-change", title: `Restarted ${m.name}`, detail: "Changed directly by the guardian.", requestedBy: by, at, status: "approved", decidedAt: at, elderSeen: s.persona === "elder" });
  audit(s, by, "updated", `medication ${m.name} (restarted)`);
  return true;
}

/* ---------- Two tabs or two phones at once (CC-243 criterion 2) ---------- */

/**
 * Another tab saved the circle. Take its state, keep this tab's persona, and reconcile doses: for each dose
 * the earliest mark wins, and a later one becomes a "duplicate" event, so the second person sees who got
 * there first. Records undone anywhere stay gone. Deterministic, so both tabs agree.
 * A record or event only this tab has is kept if it's recent (within 10 minutes of when the other tab last
 * ran), so an old one that a reset in the other tab cleared isn't brought back.
 */
export function mergeFromOtherTab(local: State, incoming: State): State {
  const since = incoming.lastRunAt ? new Date(new Date(incoming.lastRunAt).getTime() - 10 * 60000).toISOString() : "";
  // Only marks made up to now (allowing two minutes of clock difference between devices) can be "made here since
  // the other tab last saved"; a record stamped hours ahead isn't a fresh mark.
  const until = new Date(clock(incoming).getTime() + 2 * 60000).toISOString();
  const recent = (iso: string) => iso >= since && iso <= until;
  const inIds = new Set(incoming.doses.map((d) => d.id));
  const inEvents = new Set((incoming.doseHistory ?? []).map((e) => e.id));
  const events = new Map<string, DoseEvent>();
  for (const e of incoming.doseHistory ?? []) events.set(e.id, e);
  for (const e of local.doseHistory ?? []) if (!inEvents.has(e.id) && recent(e.at)) events.set(e.id, e);
  const undone = new Set([...events.values()].filter((e) => e.kind === "undone").map((e) => e.doseId));
  // Same record in both: the later version (a correction) wins.
  const byId = new Map<string, DoseLog>();
  for (const d of [...incoming.doses, ...local.doses.filter((d) => inIds.has(d.id) || recent(d.at))]) {
    if (undone.has(d.id)) continue;
    const had = byId.get(d.id);
    if (!had || (d.correctedAt ?? d.at) > (had.correctedAt ?? had.at)) byId.set(d.id, d);
  }
  const slots = new Map<string, DoseLog[]>();
  for (const d of byId.values()) {
    const k = `${d.date}|${d.medId}|${d.time}`;
    slots.set(k, [...(slots.get(k) ?? []), d]);
  }
  const doses: DoseLog[] = [];
  for (const list of slots.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const [win, ...lost] = list;
    doses.push(win);
    for (const l of lost) {
      const id = `dup-${l.id}`;
      if (!events.has(id)) events.set(id, { id, kind: "duplicate", medId: l.medId, date: l.date, time: l.time, doseId: win.id, status: l.status, firstBy: win.by, by: l.by, at: l.at });
    }
  }
  const order = new Map(incoming.doses.map((d, i) => [d.id, i]));
  doses.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.at.localeCompare(b.at));
  return {
    ...incoming,
    persona: local.persona,
    doses,
    doseHistory: [...events.values()].sort((a, b) => a.at.localeCompare(b.at)),
  };
}

/** True when merging changed nothing but this tab's persona, so there's nothing new to save back. */
export function sameAsIncoming(merged: State, incoming: State) {
  return JSON.stringify({ ...merged, persona: incoming.persona }) === JSON.stringify(incoming);
}

/* ---------- CC-248: the Safer Doses demo scenario ---------- */

export const DEMO_LABEL = "Dummy profile (demo)";

/**
 * Loads a short dose story on the fictional circle, every record marked demo: a medicine Sarah stopped, a
 * blocked double mark (Ana first, James second) and a dose Maggie undid. History shows each one.
 */
export function loadSaferDosesDemo(s: State) {
  const now = clock(s);
  const yesterday = yesterdayOf(s);
  const at = (date: string, time: string, plusMin: number) => new Date(atTime(date, time).getTime() + plusMin * 60000).toISOString();
  // Clear an earlier run, so loading twice gives the same story.
  s.meds = s.meds.filter((m) => !m.stopped?.demo);
  s.doseHistory = (s.doseHistory ?? []).filter((e) => !e.demo);
  s.doses = s.doses.filter((d) => !d.demo);

  const stopDay = addDays(now, -3);
  s.meds.push({
    id: "med-demo-ibuprofen", name: "Ibuprofen", strength: "200 mg", dose: "1 tablet", times: ["12:00"],
    instructions: "With food", prescriber: "Dr. Okafor (demo)", purpose: "Knee pain", critical: false, paused: true,
    pill: { color: "#c0392b", shape: "round" },
    history: [
      { at: addDays(now, -40).toISOString(), by: GUARDIAN, change: "Added to schedule" },
      { at: stopDay.toISOString(), by: GUARDIAN, change: "Stopped: upset stomach (demo)" },
    ],
    stopped: { at: stopDay.toISOString(), by: GUARDIAN, reason: "Upset stomach (demo)", demo: true },
  } as Medication);

  const slots = dosesFor(s, yesterday);
  const [first, second] = slots;
  if (first) {
    let rec = slotDose(s, first.med.id, yesterday, first.time);
    if (!rec) {
      rec = { id: uid("dose"), medId: first.med.id, date: yesterday, time: first.time, status: "taken", by: CAREGIVER, at: at(yesterday, first.time, 5), verified: false, demo: true };
      s.doses.push(rec);
    }
    addEvent(s, {
      kind: "duplicate", medId: first.med.id, date: yesterday, time: first.time, doseId: rec.id, status: "taken",
      firstBy: rec.by, by: FAMILY, at: new Date(new Date(rec.at).getTime() + 40000).toISOString(), demo: true,
    });
  }
  if (second) {
    addEvent(s, {
      kind: "undone", medId: second.med.id, date: yesterday, time: second.time, status: "taken", firstBy: ELDER,
      by: ELDER, markedAt: at(yesterday, second.time, -50), at: at(yesterday, second.time, -47), demo: true,
    });
  }
  s.doseHistory.sort((a, b) => a.at.localeCompare(b.at));
  s.demoScenario = "safer-doses";
  audit(s, GUARDIAN, "created", "the Safer Doses demo scenario (dummy profiles)");
  return true;
}

/** Plain-language history lines for the guardian's History (CC-248 criterion 2). */
export function doseEventText(s: State, e: DoseEvent) {
  const med = medName(s, e.medId);
  const when = `${e.date === todayOf(s) ? "" : `${monthDay(e.date)}, `}${fmtTime(e.time)}`;
  if (e.kind === "duplicate") return `${med} (${when}): ${nameOf(s, e.by)} tried to mark it again. Not saved, because ${nameOf(s, e.firstBy)} already recorded it`;
  if (e.kind === "undone") return `${med} (${when}): ${nameOf(s, e.by)} undid a "${statusWord[e.status ?? "taken"].toLowerCase()}" mark made by mistake`;
  return `${med} (${when}): ${nameOf(s, e.by)} corrected ${nameOf(s, e.firstBy)}'s entry from ${statusWord[e.from ?? "taken"].toLowerCase()} to ${statusWord[e.status ?? "taken"].toLowerCase()}${e.reason ? ` (“${e.reason}”)` : ""}`;
}

function medName(s: State, medId: string) {
  return s.meds.find((m) => m.id === medId)?.name ?? "A medicine";
}
