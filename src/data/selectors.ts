import type { State, Medication, DoseLog, CareTask, Member, Persona, Shift } from "./types";
import { doseEventText, DEMO_LABEL } from "./saferDoses";
import { ymd, toMin, minutesOfDay, nowFrom, addDays, at, fmtShortDay } from "../lib/time";
import { CAREGIVER, ELDER, FAMILY, GUARDIAN } from "./demo";

export const clock = (s: State) => nowFrom(s.clockOffsetMin);
export const todayOf = (s: State) => ymd(clock(s));
/** The day before today on the demo clock (CC-199). */
export const yesterdayOf = (s: State) => ymd(addDays(clock(s), -1));

export const member = (s: State, id?: string | null): Member | undefined => s.members.find((m) => m.id === id);
export const nameOf = (s: State, id?: string | null) => member(s, id)?.short ?? "Someone";

/** Which member the current persona signs in as in the demo. */
export const meId = (p: Persona | null) => (p === "elder" ? ELDER : p === "caregiver" ? CAREGIVER : p === "family" ? FAMILY : GUARDIAN);
/** The demo app view a member signs in to, if they have one. */
export const personaOf = (id: string): Persona | undefined => (id === ELDER ? "elder" : id === GUARDIAN ? "guardian" : id === CAREGIVER ? "caregiver" : id === FAMILY ? "family" : undefined);

export type DoseState = "taken" | "skipped" | "refused" | "upcoming" | "due" | "late" | "escalated";
export interface DoseSlot {
  /** The day the dose was due (YYYY-MM-DD). */
  date: string;
  key: string;
  med: Medication;
  time: string;
  log?: DoseLog;
  state: DoseState;
  minutesLate: number;
}

export function doseThresholds(s: State, med: Medication) {
  const k = med.critical ? 0.5 : 1; // CC: high-priority meds escalate twice as fast
  const e = s.settings.doseEscalation;
  const caregiver = Math.round(e.caregiverMin * k);
  // CC-239: a guardian who opts in hears at the same moment as the caregiver; otherwise the caregiver goes first.
  return { caregiver, guardian: e.withCaregiver ? caregiver : Math.round(e.guardianMin * k) };
}

export function dosesFor(s: State, date = todayOf(s)): DoseSlot[] {
  const now = clock(s);
  const isToday = date === ymd(now);
  const isYesterday = date === ymd(addDays(now, -1));
  const nowMin = minutesOfDay(now);
  const slots: DoseSlot[] = [];
  for (const med of s.meds) {
    if (med.paused) continue;
    for (const time of med.times) {
      const log = s.doses.find((d) => d.medId === med.id && d.date === date && d.time === time);
      // Yesterday's doses count their minutes across midnight, so a late-evening dose escalates on time (CC-199).
      const late = isToday ? nowMin - toMin(time) : isYesterday ? nowMin + 1440 - toMin(time) : date < ymd(now) ? 9999 : -9999;
      const th = doseThresholds(s, med);
      let state: DoseState;
      if (log) state = log.status;
      else if (late < -15) state = "upcoming";
      else if (late < th.caregiver) state = "due";
      else if (late < th.guardian) state = "late";
      else state = "escalated";
      slots.push({ date, key: `${med.id}@${time}`, med, time, log, state, minutesLate: Math.max(0, late) });
    }
  }
  return slots.sort((a, b) => toMin(a.time) - toMin(b.time));
}

/**
 * CC-199: yesterday's unconfirmed doses whose escalation was still running at midnight, because the guardian step
 * falls at or after 00:00 (a 23:30 dose alerts Sarah at 00:30). They escalate across midnight like any other dose.
 * Doses that finished escalating before midnight, and every earlier day, are never looked at again.
 */
export function overnightDoses(s: State): DoseSlot[] {
  return dosesFor(s, yesterdayOf(s)).filter((d) => !d.log && toMin(d.time) + doseThresholds(s, d.med).guardian >= 1440);
}

export const isOpen = (d: DoseSlot) => d.state === "due" || d.state === "late" || d.state === "escalated";

/**
 * Last night's doses still open after midnight: the ones in `overnightDoses`, which the rules engine is still
 * following up. Screens list them, labelled as from last night, so they can be marked and their alerts settle.
 */
export const lastNightDoses = (s: State): DoseSlot[] => followUpDoses(s).filter(isOpen);

/**
 * Whether a follow-up from yesterday still runs today (CC-199 review). `started` is its first alert, due at `dueMs`;
 * `next` is the one that should have followed by `stepMs`. It carries on when `next` went out after midnight (so
 * screens keep it until it's settled), or hasn't gone out although its time came, because the app was asleep across
 * midnight (a closed laptop, a phone tab in the background): either `started` went out, or the app last ran
 * yesterday after it was due and before `next` was. A first run with no record of a last run looks back at nothing.
 */
function chainCarriesOver(s: State, started: string, next: string, dueMs: number, stepMs: number) {
  const midnight = at(todayOf(s), "00:00").getTime();
  const sent = s.alerts.find((a) => a.key === next);
  if (sent) return new Date(sent.at).getTime() >= midnight;
  if (stepMs >= midnight) return false; // still to come today, handled by the ordinary rules
  if (s.alerts.some((a) => a.key === started)) return true;
  const last = s.lastRunAt ? new Date(s.lastRunAt).getTime() : NaN;
  return last >= at(yesterdayOf(s), "00:00").getTime() && last < midnight && last >= dueMs && last < stepMs;
}

/**
 * Yesterday's unconfirmed doses the rules engine still follows up today: the `overnightDoses`, plus any whose
 * escalation the app slept through before midnight (CC-199 review).
 */
export function followUpDoses(s: State): DoseSlot[] {
  const y = yesterdayOf(s);
  const overnight = overnightDoses(s);
  const carried = dosesFor(s, y).filter((d) => !d.log && !overnight.some((o) => o.key === d.key)
    && chainCarriesOver(s, `dose-cg-${y}-${d.key}`, `dose-g-${y}-${d.key}`, at(y, d.time).getTime(), at(y, d.time).getTime() + doseThresholds(s, d.med).guardian * 60000));
  return [...overnight, ...carried].sort((a, b) => toMin(a.time) - toMin(b.time));
}

/** Maggie's daily routines for a day. One-off next steps from visit notes (CC-218) are listed by `nextStepsFor`. */
export function tasksFor(s: State, date = todayOf(s)) {
  const d = new Date(`${date}T12:00:00`).getDay();
  const now = clock(s);
  const isToday = date === ymd(now);
  return s.tasks
    .filter((t) => t.recurrence !== "once")
    .filter((t) => t.recurrence === "daily" || (t.recurrence === "weekdays" ? d >= 1 && d <= 5 : d === 0 || d === 6))
    .map((t) => {
      const log = s.taskLogs.find((l) => l.taskId === t.id && l.date === date);
      const overdue = !log && isToday && minutesOfDay(now) > toMin(t.time) + 60;
      return { task: t, log, done: !!log, overdue };
    })
    .sort((a, b) => toMin(a.task.time) - toMin(b.task.time));
}

export type NextUp =
  | { kind: "dose"; slot: DoseSlot }
  | { kind: "task"; task: CareTask }
  | { kind: "none" };

/** The single "What's next" item on the elder's home screen. */
export function nextUp(s: State): NextUp {
  const doses = dosesFor(s);
  // A dose from last night that is still being followed up comes first, so Maggie can say whether she took it.
  const open = lastNightDoses(s)[0] ?? doses.find(isOpen);
  if (open) return { kind: "dose", slot: open };
  const nowMin = minutesOfDay(clock(s));
  const upcomingDose = doses.find((d) => d.state === "upcoming");
  const upcomingTask = tasksFor(s).find((t) => !t.done && toMin(t.task.time) >= nowMin - 60);
  if (upcomingDose && (!upcomingTask || toMin(upcomingDose.time) <= toMin(upcomingTask.task.time))) return { kind: "dose", slot: upcomingDose };
  if (upcomingTask) return { kind: "task", task: upcomingTask.task };
  return { kind: "none" };
}

export function shiftForDay(s: State, date: string) {
  const d = new Date(`${date}T12:00:00`).getDay();
  return s.shifts.filter((sh) => sh.days.includes(d));
}

export function todayVisit(s: State, caregiverId = CAREGIVER) {
  return s.visits.find((v) => v.date === todayOf(s) && v.caregiverId === caregiverId);
}

export function caregiverOnShift(s: State) {
  const v = s.visits.find((v) => v.date === todayOf(s) && v.checkIn && !v.checkOut);
  return v ? member(s, v.caregiverId) : undefined;
}

export function lateCheckins(s: State) {
  const now = clock(s);
  const today = ymd(now);
  return shiftForDay(s, today)
    .filter((sh) => sh.caregiverId && sh.accepted)
    .filter((sh) => {
      const v = s.visits.find((v) => v.date === today && v.shiftId === sh.id);
      return !v?.checkIn && minutesOfDay(now) > toMin(sh.start) + 15 && minutesOfDay(now) < toMin(sh.end);
    });
}

export function coverageGaps(s: State, days = 14) {
  const now = clock(s);
  const gaps: { date: string; shift: Shift }[] = [];
  for (let i = 0; i < days; i++) {
    const date = ymd(addDays(now, i));
    for (const sh of shiftForDay(s, date)) {
      if (!sh.caregiverId || !sh.accepted) {
        if (i === 0 && minutesOfDay(now) > toMin(sh.end)) continue;
        gaps.push({ date, shift: sh });
      }
    }
  }
  return gaps;
}

export function checkinToday(s: State) {
  return s.checkins.find((c) => c.date === todayOf(s));
}

/**
 * Missed daily check-in follow-ups (CC-52, CC-199): each check-in window still waiting for Maggie, with the minutes
 * since it ended. A window belongs to the day it opens. One that ends after midnight (22:00–00:30), or whose
 * prompt to Sarah falls after midnight, is followed up the next day too; earlier windows are never looked at again.
 */
export function checkinFollowUps(s: State): { date: string; minutesPast: number }[] {
  const now = clock(s);
  const nowMin = minutesOfDay(now);
  // Minutes from the opening day's midnight to the window's end.
  const endsAt = toMin(s.settings.checkinWindow.end) + (wrapsMidnight(s) ? 1440 : 0);
  const out: { date: string; minutesPast: number }[] = [];
  // Yesterday's window, when Sarah's prompt (15 minutes after the end) could not go out before midnight.
  // Also an earlier window whose prompts the app slept through before midnight (CC-199 review).
  const date = yesterdayOf(s);
  const endMs = at(date, "00:00").getTime() + endsAt * 60000;
  if (endsAt + 15 >= 1439 || chainCarriesOver(s, `checkin-elder-${date}`, `checkin-${date}`, endMs, endMs + 15 * 60000)) {
    if (!checkedInFor(s, date) && nowMin + 1440 > endsAt) out.push({ date, minutesPast: nowMin + 1440 - endsAt });
  }
  if (!checkinToday(s) && nowMin > endsAt) out.push({ date: ymd(now), minutesPast: nowMin - endsAt });
  // CC-129: a window on a day Maggie said she's resting or away isn't followed up.
  return out.filter((w) => !quietFor(s, w.date));
}

/**
 * CC-129: the resting or away day that covers the check-in window opening on `date`, if any. After Maggie taps
 * I'm back, only windows that opened before she came back stay paused, so check-ins count from her next window.
 */
export function quietFor(s: State, date: string) {
  const opens = at(date, s.settings.checkinWindow.start).getTime();
  return (s.quietDays ?? []).find((q) => q.from <= date && date <= q.until && (!q.endedAt || opens < new Date(q.endedAt).getTime()));
}

/** CC-129: Maggie's resting or away day that is on now: today is within its dates and she hasn't said she's back. */
export function currentQuiet(s: State) {
  const today = todayOf(s);
  return (s.quietDays ?? []).find((q) => !q.endedAt && q.from <= today && today <= q.until);
}

const wrapsMidnight = (s: State) => toMin(s.settings.checkinWindow.end) < toMin(s.settings.checkinWindow.start);

/**
 * Whether Maggie has checked in for the window that opens on `date`. Any check-in that day counts, and so does one
 * made later. For a window that ends after midnight, only one made once her button showed (an hour before the
 * start) counts, so an early check-in for the night before never covers it (CC-199).
 */
function checkedInFor(s: State, date: string) {
  const opened = at(date, s.settings.checkinWindow.start).getTime() - 60 * 60000;
  return s.checkins.some((c) => (!wrapsMidnight(s) && c.date === date) || new Date(c.at).getTime() >= opened);
}

/** Today's window ended without a check-in. Same rule as `checkinFollowUps`, so a window that ends after midnight is never missed before it ends. */
export function checkinMissed(s: State) {
  return checkinFollowUps(s).some((w) => w.date === todayOf(s));
}

/** Last night's window, which ended after midnight or too late for Sarah's prompt to go out before it, was missed (CC-199). */
export function checkinMissedLastNight(s: State) {
  return checkinFollowUps(s).some((w) => w.date === yesterdayOf(s));
}

/**
 * Whether Maggie's "I'm OK" button shows. It shows from an hour before her window starts. For a window that ends
 * after midnight it keeps showing until the window ends, and it shows while last night's window is being followed
 * up, so her answer to that reminder is one tap. Same rules as `checkinFollowUps` (CC-199).
 */
export function checkinButtonShows(s: State) {
  if (checkinMissedLastNight(s)) return true;
  const nowMin = minutesOfDay(clock(s));
  const { start, end } = s.settings.checkinWindow;
  if (!wrapsMidnight(s)) return !checkinToday(s) && nowMin >= toMin(start) - 60;
  if (nowMin <= toMin(end)) return !checkedInFor(s, yesterdayOf(s)); // last night's window, still open after midnight
  return nowMin >= toMin(start) - 60 && !checkedInFor(s, todayOf(s));
}

export function checkinStreak(s: State) {
  let streak = 0;
  const now = clock(s);
  for (let i = checkinToday(s) ? 0 : 1; i < 60; i++) {
    if (s.checkins.some((c) => c.date === ymd(addDays(now, -i)))) streak++;
    else break;
  }
  return streak;
}

export function adherenceByDay(s: State, days = 7) {
  const now = clock(s);
  const out: { date: string; taken: number; total: number; pct: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = ymd(addDays(now, -i));
    const slots = dosesFor(s, date).filter((d) => i > 0 || d.state !== "upcoming");
    const taken = slots.filter((d) => d.state === "taken").length;
    out.push({ date, taken, total: slots.length, pct: slots.length ? Math.round((taken / slots.length) * 100) : 100 });
  }
  return out;
}

/** North Star: verified care tasks completed on time this week. */
export function northStar(s: State) {
  const now = clock(s);
  const weekAgo = ymd(addDays(now, -6));
  const doses = s.doses.filter((d) => d.date >= weekAgo && d.status === "taken" && new Date(d.at).getTime() - at(d.date, d.time).getTime() <= 60 * 60000);
  const tasks = s.taskLogs.filter((t) => t.date >= weekAgo);
  return doses.length + tasks.length;
}

export function activeSos(s: State) {
  return s.sos.find((e) => e.status !== "resolved");
}

/** Alerts this person has been sent. One held for their quiet hours shows once the morning summary releases it (CC-208). */
export function alertsFor(s: State, p: Persona) {
  return s.alerts.filter((a) => a.to.includes(p) && !a.held?.includes(p)).sort((a, b) => b.at.localeCompare(a.at));
}

export const unreadCount = (s: State, p: Persona) => alertsFor(s, p).filter((a) => !a.read.includes(p)).length;

export const pendingApprovals = (s: State) => s.approvals.filter((a) => a.status === "pending");

export function feed(s: State) {
  type Item = { at: string; kind: "dose" | "task" | "visit" | "note" | "sos" | "checkin" | "approval" | "handoff"; text: string; by?: string; tone?: "good" | "warn" | "bad" };
  const items: Item[] = [];
  for (const d of s.doses) {
    const med = s.meds.find((m) => m.id === d.medId);
    items.push({ at: d.at, kind: "dose", by: d.by, tone: d.status === "taken" ? "good" : "warn", text: `${med?.name ?? "Medication"} ${d.status}${d.verified ? " · verified by caregiver" : ""}${d.reason ? ` — “${d.reason}”` : ""}${d.correctedBy ? ` · corrected by ${nameOf(s, d.correctedBy)}` : ""}${d.demo ? ` · ${DEMO_LABEL}` : ""}` });
  }
  // CC-243, CC-244: blocked double marks, undos and corrections, with the first entry kept.
  for (const e of s.doseHistory ?? []) items.push({ at: e.at, kind: "dose", by: e.by, tone: "warn", text: `${doseEventText(s, e)}${e.demo ? ` · ${DEMO_LABEL}` : ""}` });
  // CC-246: a stopped medicine.
  for (const m of s.meds) if (m.stopped) items.push({ at: m.stopped.at, kind: "dose", by: m.stopped.by, tone: "warn", text: `${m.name} stopped${m.stopped.reason ? ` — “${m.stopped.reason}”` : ""}${m.stopped.demo ? ` · ${DEMO_LABEL}` : ""}` });
  for (const l of s.taskLogs) {
    const t = s.tasks.find((t) => t.id === l.taskId);
    items.push({ at: l.at, kind: "task", by: l.by, tone: "good", text: `${t?.title ?? "Task"} done${l.note ? ` — “${l.note}”` : ""}` });
  }
  for (const v of s.visits) {
    if (v.checkIn) items.push({ at: v.checkIn, kind: "visit", by: v.caregiverId, text: `${nameOf(s, v.caregiverId)} checked in${v.manualReason ? ` (manual: ${v.manualReason})` : ""}` });
    if (v.checkOut) items.push({ at: v.checkOut, kind: "visit", by: v.caregiverId, text: `${nameOf(s, v.caregiverId)} checked out` });
  }
  for (const h of s.handoffs) items.push({ at: h.at, kind: "handoff", by: h.by, text: h.skippedReason ? `Hand-off skipped — ${h.skippedReason}` : `Hand-off note: ${h.notes || h.summary}` });
  for (const n of s.notes) items.push({ at: n.at, kind: "note", by: n.by, text: n.text });
  for (const c of s.checkins) items.push({ at: c.at, kind: "checkin", by: ELDER, tone: "good", text: "Checked in: “I'm OK”" });
  // CC-129: Maggie's resting and away days show in the history, with when she came back.
  for (const q of s.quietDays ?? []) {
    items.push({ at: q.at, kind: "checkin", by: q.by, text: q.kind === "resting" ? "Resting today. Check-in reminders paused" : `Away until ${fmtShortDay(q.until)}. Check-in reminders paused` });
    if (q.endedAt) items.push({ at: q.endedAt, kind: "checkin", by: q.by, text: "Back. Check-in reminders are on again" });
  }
  for (const e of s.sos) items.push({ at: e.startedAt, kind: "sos", by: ELDER, tone: e.status === "resolved" ? "warn" : "bad", text: e.status === "resolved" ? `SOS resolved — ${e.outcome ?? ""}` : "SOS is active" });
  for (const a of s.approvals) if (a.decidedAt) items.push({ at: a.decidedAt, kind: "approval", by: GUARDIAN, text: `${a.status === "approved" ? "Approved" : "Declined"}: ${a.title}` });
  return items.filter((i) => i.at <= clock(s).toISOString()).sort((a, b) => b.at.localeCompare(a.at));
}

/** Where an alert's link opens for one person. /app/sos, /app/chat and /app/help open that page in their own view. */
export function alertLink(p: Persona, link?: string) {
  const l = link ?? "";
  if (l === "/app/help") return p === "family" ? "/app/family" : `/app/${p}/help`;
  if (l === "/app/sos" || l === "/app/chat") return `/app/${p}/${l.slice(5)}`;
  return l.startsWith(`/app/${p}`) ? l : undefined;
}
