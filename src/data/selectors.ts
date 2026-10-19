import type { State, Medication, DoseLog, CareTask, Member, Persona, Shift } from "./types";
import { ymd, toMin, minutesOfDay, nowFrom, addDays, at } from "../lib/time";
import { CAREGIVER, ELDER, GUARDIAN } from "./demo";

export const clock = (s: State) => nowFrom(s.clockOffsetMin);
export const todayOf = (s: State) => ymd(clock(s));

export const member = (s: State, id?: string | null): Member | undefined => s.members.find((m) => m.id === id);
export const nameOf = (s: State, id?: string | null) => member(s, id)?.short ?? "Someone";

/** Which member the current persona signs in as in the demo. */
export const meId = (p: Persona | null) => (p === "elder" ? ELDER : p === "caregiver" ? CAREGIVER : GUARDIAN);

export type DoseState = "taken" | "skipped" | "refused" | "upcoming" | "due" | "late" | "escalated";
export interface DoseSlot {
  key: string;
  med: Medication;
  time: string;
  log?: DoseLog;
  state: DoseState;
  minutesLate: number;
}

export function doseThresholds(s: State, med: Medication) {
  const k = med.critical ? 0.5 : 1; // CC: high-priority meds escalate twice as fast
  return { caregiver: Math.round(s.settings.doseEscalation.caregiverMin * k), guardian: Math.round(s.settings.doseEscalation.guardianMin * k) };
}

export function dosesFor(s: State, date = todayOf(s)): DoseSlot[] {
  const now = clock(s);
  const isToday = date === ymd(now);
  const nowMin = minutesOfDay(now);
  const slots: DoseSlot[] = [];
  for (const med of s.meds) {
    if (med.paused) continue;
    for (const time of med.times) {
      const log = s.doses.find((d) => d.medId === med.id && d.date === date && d.time === time);
      const late = isToday ? nowMin - toMin(time) : date < ymd(now) ? 9999 : -9999;
      const th = doseThresholds(s, med);
      let state: DoseState;
      if (log) state = log.status;
      else if (late < -15) state = "upcoming";
      else if (late < th.caregiver) state = "due";
      else if (late < th.guardian) state = "late";
      else state = "escalated";
      slots.push({ key: `${med.id}@${time}`, med, time, log, state, minutesLate: Math.max(0, late) });
    }
  }
  return slots.sort((a, b) => toMin(a.time) - toMin(b.time));
}

export const isOpen = (d: DoseSlot) => d.state === "due" || d.state === "late" || d.state === "escalated";

export function tasksFor(s: State, date = todayOf(s)) {
  const d = new Date(`${date}T12:00:00`).getDay();
  const now = clock(s);
  const isToday = date === ymd(now);
  return s.tasks
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
  const open = doses.find(isOpen);
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

export function checkinMissed(s: State) {
  return !checkinToday(s) && minutesOfDay(clock(s)) > toMin(s.settings.checkinWindow.end);
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

export function alertsFor(s: State, p: Persona) {
  return s.alerts.filter((a) => a.to.includes(p)).sort((a, b) => b.at.localeCompare(a.at));
}

export const unreadCount = (s: State, p: Persona) => alertsFor(s, p).filter((a) => !a.read.includes(p)).length;

export const pendingApprovals = (s: State) => s.approvals.filter((a) => a.status === "pending");

export function feed(s: State) {
  type Item = { at: string; kind: "dose" | "task" | "visit" | "note" | "sos" | "checkin" | "approval" | "handoff"; text: string; by?: string; tone?: "good" | "warn" | "bad" };
  const items: Item[] = [];
  for (const d of s.doses) {
    const med = s.meds.find((m) => m.id === d.medId);
    items.push({ at: d.at, kind: "dose", by: d.by, tone: d.status === "taken" ? "good" : "warn", text: `${med?.name ?? "Medication"} ${d.status}${d.verified ? " · verified by caregiver" : ""}${d.reason ? ` — “${d.reason}”` : ""}` });
  }
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
  for (const c of s.checkins) items.push({ at: c.at, kind: "checkin", by: ELDER, tone: "good", text: `Checked in: “I'm OK” ${c.mood ?? ""}` });
  for (const e of s.sos) items.push({ at: e.startedAt, kind: "sos", by: ELDER, tone: e.status === "resolved" ? "warn" : "bad", text: e.status === "resolved" ? `SOS resolved — ${e.outcome ?? ""}` : "SOS is active" });
  for (const a of s.approvals) if (a.decidedAt) items.push({ at: a.decidedAt, kind: "approval", by: GUARDIAN, text: `${a.status === "approved" ? "Approved" : "Declined"}: ${a.title}` });
  return items.filter((i) => i.at <= clock(s).toISOString()).sort((a, b) => b.at.localeCompare(a.at));
}
