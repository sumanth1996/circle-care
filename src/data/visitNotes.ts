import type { State, Appointment, CareTask, NextStep, VisitNotes, VisitQuestion } from "./types";
import { audit, allowed, pushAlert } from "./store";
import { can } from "./policy";
import { clock, nameOf, personaOf, todayOf } from "./selectors";
import { questionsFor } from "./visitQuestions";
import { at as atTime, fmtShortDay, uid, ymd, addDays } from "../lib/time";
import { ELDER, GUARDIAN } from "./demo";

// Sprint 18: after-visit notes and next steps (CC-218). Whoever went to the visit writes down the answers to the
// circle's questions, anything else the doctor said and the next steps. Each next step becomes a one-off care
// task for its owner on its date. Others read the notes only while Maggie shares her appointments with them.

export const ANSWER_MAX = 1000;
export const SUMMARY_MAX = 2000;
export const STEP_MAX = 120;
/** One reminder, two days after the visit ends, if nobody has written notes. */
export const NOTES_REMIND_HOURS = 48;
/** Older visits don't get the reminder; they're past being useful. */
export const NOTES_REMIND_UNTIL_DAYS = 7;
/** How far back the "Recent visits" list reaches. */
export const RECENT_DAYS = 30;
const STEP_TIME = "10:00";

/** A pharmacy pickup has no doctor to take notes from. */
const takesNotes = (a: Appointment) => a.kind !== "refill" && a.status !== "cancelled";

export function visitEnd(a: Appointment) {
  return new Date(atTime(a.date, a.time).getTime() + a.durationMin * 60000);
}

export function hasPassed(s: State, a: Appointment) {
  return takesNotes(a) && visitEnd(a).getTime() <= clock(s).getTime();
}

/** Reading needs appointment access too, so Maggie's sharing settings decide (criterion 3). */
export function canReadNotes(s: State, viewerId: string) {
  return can(s, viewerId, "read", "visitNotes") && can(s, viewerId, "read", "appointments");
}

/** Only Maggie, Sarah or the person recorded as going may write (criterion 5). */
export function isWriter(a: Appointment, personId: string) {
  return personId === ELDER || personId === GUARDIAN || (!!a.escortId && a.escortId === personId);
}

export function canWriteNotes(s: State, viewerId: string, a: Appointment) {
  return hasPassed(s, a) && isWriter(a, viewerId) && canReadNotes(s, viewerId) && can(s, viewerId, "write", "visitNotes");
}

/** Visits that ended in the last 30 days, newest first. */
export function recentVisits(s: State, viewerId: string): Appointment[] {
  if (!canReadNotes(s, viewerId)) return [];
  const since = ymd(addDays(clock(s), -RECENT_DAYS));
  return s.appointments
    .filter((a) => hasPassed(s, a) && a.date >= since)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** Who should write the notes: whoever went, or Sarah if no one was recorded. */
export const noteTaker = (a: Appointment) => a.escortId ?? GUARDIAN;

/** The visit's questions as part of its notes. Anyone who can read the notes sees them, so whoever went can answer
 *  them even off shift; an item Maggie hid stays with her and Sarah. */
function noteQuestions(s: State, viewerId: string, a: Appointment): VisitQuestion[] {
  const full = viewerId === ELDER || viewerId === GUARDIAN;
  return questionsFor(s, GUARDIAN, a.id).filter((q) => !q.hidden || full);
}

/** What one viewer sees: the questions they may see, each with its answer, the summary and the next steps. */
export function notesView(s: State, viewerId: string, apptId: string) {
  const a = s.appointments.find((x) => x.id === apptId);
  if (!a || !canReadNotes(s, viewerId) || !hasPassed(s, a)) return null;
  const qs = noteQuestions(s, viewerId, a);
  return {
    appt: a,
    questions: qs.map((q) => ({ q, answer: a.notes?.answers[q.id] ?? "" })),
    summary: a.notes?.summary ?? "",
    nextSteps: a.notes?.nextSteps ?? [],
    notes: a.notes,
    canWrite: canWriteNotes(s, viewerId, a),
  };
}

function writable(s: State, by: string, apptId: string) {
  const a = s.appointments.find((x) => x.id === apptId);
  if (!a || !hasPassed(s, a)) return undefined;
  if (!allowed(s, by, "write", "visitNotes") || !allowed(s, by, "read", "appointments")) return undefined;
  if (!isWriter(a, by)) { audit(s, by, "denied", "write after-visit notes"); return undefined; }
  return a;
}

function ensure(s: State, a: Appointment, by: string): VisitNotes {
  if (!a.notes) a.notes = { answers: {}, nextSteps: [], by, at: clock(s).toISOString() };
  else { a.notes.updatedBy = by; a.notes.updatedAt = clock(s).toISOString(); }
  return a.notes;
}

/** Saves the answers and the summary. Answers only to questions the writer can see; blank answers are dropped. */
export function saveNotes(s: State, by: string, apptId: string, input: { answers: Record<string, string>; summary: string }) {
  const a = writable(s, by, apptId);
  if (!a) return false;
  const visible = new Set(noteQuestions(s, by, a).map((q) => q.id));
  const answers: Record<string, string> = { ...(a.notes?.answers ?? {}) };
  for (const [id, text] of Object.entries(input.answers)) {
    if (!visible.has(id)) continue;
    const t = text.trim().slice(0, ANSWER_MAX);
    if (t) answers[id] = t; else delete answers[id];
  }
  const summary = input.summary.trim().slice(0, SUMMARY_MAX);
  if (!a.notes && !summary && Object.keys(answers).length === 0) return false;
  const n = ensure(s, a, by);
  n.answers = answers;
  n.summary = summary || undefined;
  audit(s, by, "updated", "after-visit notes");
  return true;
}

/** People a next step can go to: Maggie, Sarah and active members who can see care tasks. */
export function stepOwners(s: State) {
  const unpaused: State = { ...s, settings: { ...s.settings, sharingPaused: false } };
  return s.members.filter((m) => m.status === "active" && (m.id === ELDER || m.id === GUARDIAN || can(unpaused, m.id, "read", "tasks")));
}

/** Adds a next step, which becomes a one-off care task for its owner on its date (criterion 2). The screen shows
 *  the health-detail hint first (criterion 6). The owner is told, with the generic title on the lock screen. */
export function addNextStep(s: State, by: string, apptId: string, input: { text: string; owner: string; date: string }): NextStep | null {
  const a = writable(s, by, apptId);
  const text = input.text.trim();
  if (!a || !text || text.length > STEP_MAX || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < todayOf(s)) return null;
  if (!stepOwners(s).some((m) => m.id === input.owner)) return null;
  const task: CareTask = { id: uid("t"), title: text, icon: "heart", time: STEP_TIME, recurrence: "once", date: input.date, assignee: input.owner === ELDER ? "elder" : input.owner, apptId: a.id };
  s.tasks.push(task);
  const step: NextStep = { id: uid("ns"), text, owner: input.owner, date: input.date, taskId: task.id, by, at: clock(s).toISOString() };
  ensure(s, a, by).nextSteps.push(step);
  audit(s, by, "created", "a next step from a visit (care task)");
  const persona = personaOf(input.owner);
  if (persona && input.owner !== by && can(s, input.owner, "read", "tasks")) {
    pushAlert(s, { key: `step-${step.id}`, to: [persona], severity: "info", title: "You have a new task in Circle Care", detail: `${nameOf(s, by)} added a next step for you: ${text}, ${fmtShortDay(input.date)}.`, link: `/app/${persona}/visit-notes/${a.id}` });
  }
  return step;
}

/** Removes a next step and its care task, unless the task is already done. */
export function removeNextStep(s: State, by: string, apptId: string, stepId: string) {
  const a = writable(s, by, apptId);
  const step = a?.notes?.nextSteps.find((x) => x.id === stepId);
  if (!a || !step) return false;
  if (s.taskLogs.some((l) => l.taskId === step.taskId)) return false;
  a.notes!.nextSteps = a.notes!.nextSteps.filter((x) => x.id !== stepId);
  s.tasks = s.tasks.filter((t) => t.id !== step.taskId);
  audit(s, by, "removed", "a next step from a visit");
  return true;
}

/** One person's next steps: anything not done yet, up to a week ahead, and anything done today. */
export function nextStepsFor(s: State, personId: string) {
  if (!can(s, personId, "read", "tasks")) return [];
  const today = todayOf(s);
  const weekOut = ymd(addDays(clock(s), 7));
  const assignee = personId === ELDER ? "elder" : personId;
  return s.tasks
    .filter((t) => t.recurrence === "once" && t.assignee === assignee && t.date)
    .map((t) => {
      const log = s.taskLogs.find((l) => l.taskId === t.id);
      return { task: t, log, done: !!log, overdue: !log && t.date! < today };
    })
    .filter((x) => (x.done ? x.log!.date === today : x.task.date! <= weekOut))
    .sort((a, b) => a.task.date!.localeCompare(b.task.date!));
}

/** Finishing a next step logs it once, on the day it's done. Only its owner, Sarah or Maggie may. */
export function finishNextStep(s: State, by: string, taskId: string) {
  const t = s.tasks.find((x) => x.id === taskId && x.recurrence === "once");
  if (!t || !allowed(s, by, "write", "tasks")) return false;
  const owner = t.assignee === "elder" ? ELDER : t.assignee;
  if (by !== owner && by !== GUARDIAN && by !== ELDER) { audit(s, by, "denied", "finish someone else's next step"); return false; }
  if (s.taskLogs.some((l) => l.taskId === t.id)) return false;
  s.taskLogs.push({ taskId: t.id, date: todayOf(s), by, at: clock(s).toISOString() });
  audit(s, by, "updated", "a next step (done)");
  return true;
}

/** Criterion 4 and 7: no notes two days after the visit, so whoever went gets one reminder with the generic title. */
export function runVisitNotes(s: State) {
  const now = clock(s).getTime();
  for (const a of s.appointments) {
    if (!hasPassed(s, a) || a.notes || a.notesReminded) continue;
    const end = visitEnd(a).getTime();
    if (now < end + NOTES_REMIND_HOURS * 3600000) continue;
    if (now > end + NOTES_REMIND_UNTIL_DAYS * 86400000) continue;
    a.notesReminded = true;
    const who = noteTaker(a);
    const persona = personaOf(who);
    if (!persona || !canReadNotes(s, who)) continue;
    pushAlert(s, { key: `notes-remind-${a.id}`, to: [persona], severity: "info", title: "You have a reminder from Circle Care", detail: `Add notes from Maggie's visit on ${fmtShortDay(a.date)}.`, link: `/app/${persona}/visit-notes/${a.id}` });
  }
}
