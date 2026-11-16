import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate } from "../data/store";
import { clock, tasksFor, todayOf } from "../data/selectors";
import { addQuestion, hideQuestion, questionsFor } from "../data/visitQuestions";
import { notesView, canWriteNotes, saveNotes, addNextStep, removeNextStep, finishNextStep, nextStepsFor, recentVisits, runVisitNotes, hasPassed, STEP_MAX } from "../data/visitNotes";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";


// Sprint 18: after-visit notes and next steps (CC-218). Times are pinned so a test never crosses midnight by accident.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, days: number, time = "12:00") => { s.clockOffsetMin += days * 24 * 60; at(s, time); evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
/** Ana took Maggie to the Diabetes follow-up two days from the demo's start. */
const followUp = (s: State) => s.appointments.find((a) => a.title === "Diabetes follow-up")!;
/** The day after the follow-up, at noon: it has passed and no reminder is due yet. */
const afterVisit = () => { const s = noon(); later(s, 3); return s; };

describe("After-visit notes: who writes and who reads (CC-218)", () => {
  it("before the visit there's nothing to write; after it, each question has space for an answer", () => {
    const s = noon();
    const a = followUp(s);
    expect(hasPassed(s, a)).toBe(false);
    expect(notesView(s, CAREGIVER, a.id)).toBeNull();
    later(s, 3);
    const v = notesView(s, CAREGIVER, a.id)!;
    expect(v.questions.map((x) => x.q.text)).toEqual(["Bring the glucose log."]);
    expect(v.questions[0].answer).toBe("");
    expect(v.nextSteps).toEqual([]);
    expect(v.canWrite).toBe(true);
  });

  it("only Maggie, Sarah or whoever went can write; anyone else is refused and audited", () => {
    const s = afterVisit();
    const a = followUp(s);
    expect(a.escortId).toBe(CAREGIVER);
    expect(canWriteNotes(s, CAREGIVER, a)).toBe(true);
    expect(canWriteNotes(s, ELDER, a)).toBe(true);
    expect(canWriteNotes(s, GUARDIAN, a)).toBe(true);
    expect(canWriteNotes(s, FAMILY, a)).toBe(false);
    expect(saveNotes(s, FAMILY, a.id, { answers: {}, summary: "Doctor was happy" })).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied", resource: "write after-visit notes" });
    expect(a.notes).toBeUndefined();
    expect(addNextStep(s, FAMILY, a.id, { text: "Call the clinic", owner: FAMILY, date: inDays(s, 1) })).toBeNull();
  });

  it("saved notes show to others only while Maggie shares appointments with them", () => {
    const s = afterVisit();
    const a = followUp(s);
    const qid = notesView(s, CAREGIVER, a.id)!.questions[0].q.id;
    expect(saveNotes(s, CAREGIVER, a.id, { answers: { [qid]: "She looked at the log and was pleased." }, summary: "Come back in three months." })).toBe(true);
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "updated", resource: "after-visit notes" });
    const james = notesView(s, FAMILY, a.id)!;
    expect(james.questions[0].answer).toBe("She looked at the log and was pleased.");
    expect(james.summary).toBe("Come back in three months.");
    expect(james.canWrite).toBe(false);
    s.settings.sharingPaused = true;
    expect(notesView(s, FAMILY, a.id)).toBeNull();
    expect(notesView(s, CAREGIVER, a.id)).toBeNull();
    expect(notesView(s, GUARDIAN, a.id)!.summary).toBe("Come back in three months.");
    expect(recentVisits(s, FAMILY)).toEqual([]);
  });

  it("an answer to a question Maggie hid shows only to her and Sarah", () => {
    const s = noon();
    const a = followUp(s);
    const q = addQuestion(s, GUARDIAN, a.id, "Is the dizziness worth a test?")!;
    hideQuestion(s, ELDER, a.id, q.id, true);
    later(s, 3);
    saveNotes(s, GUARDIAN, a.id, { answers: { [q.id]: "Not for now." }, summary: "" });
    expect(notesView(s, ELDER, a.id)!.questions.find((x) => x.q.id === q.id)!.answer).toBe("Not for now.");
    expect(notesView(s, FAMILY, a.id)!.questions.some((x) => x.q.id === q.id)).toBe(false);
    // Ana can't answer a question she can't see.
    saveNotes(s, CAREGIVER, a.id, { answers: { [q.id]: "Changed" }, summary: "" });
    expect(a.notes!.answers[q.id]).toBe("Not for now.");
  });

  it("a pharmacy pickup takes no notes, and recent visits are newest first", () => {
    const s = afterVisit();
    const refill = s.appointments.find((x) => x.kind === "refill" && x.date < todayOf(s))!;
    expect(hasPassed(s, refill)).toBe(false);
    const recent = recentVisits(s, GUARDIAN);
    expect(recent.every((x) => x.kind !== "refill")).toBe(true);
    expect(recent.map((x) => x.title)).toContain("Diabetes follow-up");
    const keys = recent.map((x) => x.date + x.time);
    expect(keys).toEqual([...keys].sort().reverse());
  });
});

describe("Next steps become care tasks (CC-218)", () => {
  it("a next step with an owner and a day becomes a one-off task for that person on that day, and they're told", () => {
    const s = afterVisit();
    const a = followUp(s);
    const step = addNextStep(s, CAREGIVER, a.id, { text: "Book the eye exam", owner: FAMILY, date: inDays(s, 2) })!;
    expect(step).toBeTruthy();
    const task = s.tasks.find((t) => t.id === step.taskId)!;
    expect(task).toMatchObject({ title: "Book the eye exam", recurrence: "once", date: inDays(s, 2), assignee: FAMILY, apptId: a.id });
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "created", resource: "a next step from a visit (care task)" });
    expect(keyed(s, `step-${step.id}`)).toEqual([expect.objectContaining({ to: ["family"], title: "You have a new task in Circle Care" })]);
    // It isn't one of Maggie's daily routines.
    expect(tasksFor(s, inDays(s, 2)).some((t) => t.task.id === task.id)).toBe(false);
    expect(nextStepsFor(s, FAMILY).map((x) => x.task.title)).toEqual(["Book the eye exam"]);
    expect(nextStepsFor(s, CAREGIVER)).toEqual([]);
    expect(notesView(s, GUARDIAN, a.id)!.nextSteps.map((x) => x.text)).toEqual(["Book the eye exam"]);
  });

  it("a step for Maggie goes on her list as hers; no alert when you give one to yourself", () => {
    const s = afterVisit();
    const a = followUp(s);
    const mine = addNextStep(s, GUARDIAN, a.id, { text: "Pick up the new test strips", owner: GUARDIAN, date: todayOf(s) })!;
    expect(keyed(s, `step-${mine.id}`)).toEqual([]);
    const hers = addNextStep(s, GUARDIAN, a.id, { text: "Walk after lunch", owner: ELDER, date: todayOf(s) })!;
    expect(s.tasks.find((t) => t.id === hers.taskId)!.assignee).toBe("elder");
    expect(nextStepsFor(s, ELDER).map((x) => x.task.title)).toEqual(["Walk after lunch"]);
    expect(keyed(s, `step-${hers.id}`)[0].to).toEqual(["elder"]);
  });

  it("refuses a day in the past, someone outside the circle, or a step that's too long", () => {
    const s = afterVisit();
    const a = followUp(s);
    expect(addNextStep(s, GUARDIAN, a.id, { text: "Too late", owner: FAMILY, date: inDays(s, -1) })).toBeNull();
    expect(addNextStep(s, GUARDIAN, a.id, { text: "Who?", owner: "m-ruth", date: inDays(s, 1) })).toBeNull();
    expect(addNextStep(s, GUARDIAN, a.id, { text: "x".repeat(STEP_MAX + 1), owner: FAMILY, date: inDays(s, 1) })).toBeNull();
    expect(addNextStep(s, GUARDIAN, a.id, { text: "  ", owner: FAMILY, date: inDays(s, 1) })).toBeNull();
    expect(s.tasks.filter((t) => t.recurrence === "once")).toEqual([]);
  });

  it("only the owner, Sarah or Maggie finish a step; a done step can't be removed", () => {
    const s = afterVisit();
    const a = followUp(s);
    const step = addNextStep(s, GUARDIAN, a.id, { text: "Call the clinic about the results", owner: FAMILY, date: todayOf(s) })!;
    expect(finishNextStep(s, CAREGIVER, step.taskId)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "denied" });
    expect(finishNextStep(s, FAMILY, step.taskId)).toBe(true);
    expect(finishNextStep(s, FAMILY, step.taskId)).toBe(false);
    expect(nextStepsFor(s, FAMILY)[0]).toMatchObject({ done: true });
    expect(removeNextStep(s, GUARDIAN, a.id, step.id)).toBe(false);
    const other = addNextStep(s, GUARDIAN, a.id, { text: "Order new strips", owner: FAMILY, date: inDays(s, 3) })!;
    expect(removeNextStep(s, GUARDIAN, a.id, other.id)).toBe(true);
    expect(s.tasks.some((t) => t.id === other.taskId)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ action: "removed", resource: "a next step from a visit" });
  });

  it("an overdue step stays on the list marked as past its day; a done one leaves the next day", () => {
    const s = afterVisit();
    const a = followUp(s);
    const open = addNextStep(s, GUARDIAN, a.id, { text: "Book the eye exam", owner: FAMILY, date: todayOf(s) })!;
    const done = addNextStep(s, GUARDIAN, a.id, { text: "Order new strips", owner: FAMILY, date: todayOf(s) })!;
    finishNextStep(s, FAMILY, done.taskId);
    later(s, 1);
    const list = nextStepsFor(s, FAMILY);
    expect(list.map((x) => x.task.id)).toEqual([open.taskId]);
    expect(list[0].overdue).toBe(true);
  });
});

describe("The 2-day reminder (CC-218)", () => {
  it("whoever went gets one reminder two days after, with the generic title and no appointment details", () => {
    const s = noon();
    const a = followUp(s);
    later(s, 3);
    expect(keyed(s, `notes-remind-${a.id}`)).toEqual([]);
    later(s, 1);
    const r = keyed(s, `notes-remind-${a.id}`);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ to: ["caregiver"], title: "You have a reminder from Circle Care" });
    expect(r[0].detail).not.toMatch(/diabetes|brooks|glucose/i);
    later(s, 1);
    expect(keyed(s, `notes-remind-${a.id}`)).toHaveLength(1);
  });

  it("no reminder once notes are written; with no one recorded as going, Sarah gets it", () => {
    const s = noon();
    const a = followUp(s);
    const lab = s.appointments.find((x) => x.title === "A1c and kidney blood test")!;
    lab.escortId = undefined;
    later(s, 3);
    saveNotes(s, CAREGIVER, a.id, { answers: {}, summary: "All fine." });
    later(s, 1);
    expect(keyed(s, `notes-remind-${a.id}`)).toEqual([]);
    expect(keyed(s, `notes-remind-${lab.id}`)[0].to).toEqual(["guardian"]);
  });

  it("loading the demo sends no reminders for visits that were already in the past", () => {
    const s = noon();
    runVisitNotes(s);
    expect(keyed(s, "notes-remind-")).toEqual([]);
  });

  it("the audit chain still verifies after all of this", async () => {
    const s = afterVisit();
    const a = followUp(s);
    saveNotes(s, CAREGIVER, a.id, { answers: {}, summary: "All fine." });
    const step = addNextStep(s, CAREGIVER, a.id, { text: "Book the eye exam", owner: FAMILY, date: todayOf(s) })!;
    finishNextStep(s, FAMILY, step.taskId);
    expect(await verifyChain(s.audit)).toMatchObject({ ok: true });
  });
});
