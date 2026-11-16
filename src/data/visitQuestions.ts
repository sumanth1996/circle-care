import type { State, Appointment, VisitQuestion } from "./types";
import { audit, allowed } from "./store";
import { can } from "./policy";
import { clock, todayOf } from "./selectors";
import { uid } from "../lib/time";
import { ELDER, GUARDIAN } from "./demo";

// Sprint 17: the shared question list for the next doctor visit (CC-217). Sarah, James, Maggie, and Ana while
// she's on shift can add to it, and everyone sees who added what. Maggie can hide an item so only she and
// Sarah see it. Sarah sets the order and prints it in large type for the visit.

export const QUESTION_MAX = 280;

/** Seeing the list needs appointment access as well as the list itself, so Ana off shift sees nothing. */
export function canSeeQuestions(s: State, viewerId: string) {
  return can(s, viewerId, "read", "questions") && can(s, viewerId, "read", "appointments");
}

const full = (viewerId: string) => viewerId === ELDER || viewerId === GUARDIAN;

/** Appointments that can take questions: upcoming and still scheduled. */
export function upcomingVisits(s: State, viewerId: string): Appointment[] {
  if (!canSeeQuestions(s, viewerId)) return [];
  const today = todayOf(s);
  return s.appointments.filter((a) => a.status === "scheduled" && a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** The list as stored, or, until someone first changes it, the appointment's prep note as its first item. */
function listOf(a: Appointment): VisitQuestion[] {
  if (a.questions) return a.questions;
  return a.prep ? [{ id: `q-prep-${a.id}`, by: a.createdBy, at: `${a.date}T00:00:00`, text: a.prep }] : [];
}

function materialize(a: Appointment) {
  if (!a.questions) a.questions = listOf(a).map((q) => ({ ...q }));
  return a.questions;
}

/** What one viewer sees, in Sarah's order. Hidden items show only to Maggie and Sarah. */
export function questionsFor(s: State, viewerId: string, apptId: string): VisitQuestion[] {
  const a = s.appointments.find((x) => x.id === apptId);
  if (!a || !canSeeQuestions(s, viewerId)) return [];
  return listOf(a).filter((q) => !q.hidden || full(viewerId));
}

function writable(s: State, by: string, apptId: string) {
  const a = s.appointments.find((x) => x.id === apptId);
  if (!a) return undefined;
  if (!allowed(s, by, "write", "questions") || !allowed(s, by, "read", "appointments")) return undefined;
  if (a.status !== "scheduled" || a.date < todayOf(s)) return undefined;
  return a;
}

/** Anyone allowed adds a question or something they noticed. The screen shows the health-detail hint first. */
export function addQuestion(s: State, by: string, apptId: string, text: string): VisitQuestion | null {
  const a = writable(s, by, apptId);
  const t = text.trim();
  if (!a || !t || t.length > QUESTION_MAX) return null;
  const q: VisitQuestion = { id: uid("q"), by, at: clock(s).toISOString(), text: t };
  materialize(a).push(q);
  audit(s, by, "created", "a question for a visit");
  return q;
}

/** Maggie hides an item (or shows it again). Only she can. */
export function hideQuestion(s: State, by: string, apptId: string, qid: string, hidden: boolean) {
  if (by !== ELDER) { audit(s, by, "denied", "hide a visit question"); return false; }
  const a = writable(s, by, apptId);
  const q = a ? materialize(a).find((x) => x.id === qid) : undefined;
  if (!q) return false;
  q.hidden = hidden;
  audit(s, by, "updated", hidden ? "a visit question (hidden)" : "a visit question (shown)");
  return true;
}

/** Sarah sets the order the questions are asked in. */
export function moveQuestion(s: State, by: string, apptId: string, qid: string, dir: -1 | 1) {
  if (by !== GUARDIAN) { audit(s, by, "denied", "reorder visit questions"); return false; }
  const a = writable(s, by, apptId);
  if (!a) return false;
  const list = materialize(a);
  const i = list.findIndex((x) => x.id === qid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  audit(s, by, "updated", "the order of visit questions");
  return true;
}

/** The person who added it, or Sarah, can take it off. */
export function removeQuestion(s: State, by: string, apptId: string, qid: string) {
  const a = writable(s, by, apptId);
  if (!a) return false;
  const list = materialize(a);
  const q = list.find((x) => x.id === qid);
  if (!q || (q.by !== by && by !== GUARDIAN) || (q.hidden && !full(by))) { audit(s, by, "denied", "remove a visit question"); return false; }
  a.questions = list.filter((x) => x.id !== qid);
  audit(s, by, "removed", "a question for a visit");
  return true;
}

/** CC-217: the printout, in Sarah's order. Hidden items stay off unless Sarah or Maggie adds them back. */
export function printList(s: State, viewerId: string, apptId: string, includeHidden = false) {
  if (!full(viewerId)) return [];
  return questionsFor(s, viewerId, apptId).filter((q) => includeHidden || !q.hidden);
}
