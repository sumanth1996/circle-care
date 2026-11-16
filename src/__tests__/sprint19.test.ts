import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate, applySettings } from "../data/store";
import { clock, tasksFor } from "../data/selectors";
import { callsFor, callOrgs, saveCall, deleteCall, revealRef, setAdminTo, maskRef, runCalls, canSeeCalls } from "../data/callLog";
import { aboutView, canSeeSection, canEditSection, saveSection, setSectionSharing, setSarahEditing, shiftSections, changesForMaggie, markSeen } from "../data/aboutMe";
import { finishNextStep, nextStepsFor } from "../data/visitNotes";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 19: the call log (CC-226 – CC-228) and Maggie's What matters to me page (CC-219).
// Times are pinned so a test never crosses midnight by accident.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, days: number, time = "12:00") => { s.clockOffsetMin += days * 24 * 60; at(s, time); evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
/** Ana checks in at noon so she's on shift. */
const onShift = (s: State) => {
  const v = s.visits.find((x) => x.caregiverId === CAREGIVER && x.date === ymd(clock(s)));
  if (v) { v.checkIn = "09:00"; v.checkOut = undefined; }
  else s.visits.push({ id: "v-test", shiftId: s.shifts.find((x) => x.caregiverId === CAREGIVER)!.id, caregiverId: CAREGIVER, date: ymd(clock(s)), checkIn: "09:00" });
  return s;
};
const offShift = (s: State) => { s.visits = s.visits.filter((x) => !(x.caregiverId === CAREGIVER && x.date === ymd(clock(s)))); return s; };
const call = (over: Partial<Parameters<typeof saveCall>[2]> = {}) => ({ org: "Bayside Health Plan", date: "", contact: "Dana, appeals", outcome: "They will send the form by mail.", ref: "APL55501234", step: null, ...over });

describe("Log a call (CC-226)", () => {
  it("Sarah saves the organization, date, person, outcome and reference, and it shows in the circle's log", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, call({ date: inDays(s, 0) }))!;
    expect(c).toBeTruthy();
    const mine = callsFor(s, GUARDIAN)[0];
    expect(mine).toMatchObject({ id: c.id, org: "Bayside Health Plan", date: inDays(s, 0) });
    expect(mine.admin).toEqual({ contact: "Dana, appeals", outcome: "They will send the form by mail.", refMasked: "•••• 1234" });
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "created", resource: "a call log entry" });
  });

  it("without Maggie's insurance choice, family and a caregiver on shift see only the organization, the date and the next step", () => {
    const s = onShift(noon());
    expect(s.settings.adminTo).toEqual([]);
    for (const who of [FAMILY, CAREGIVER]) {
      const list = callsFor(s, who);
      expect(list.length).toBe(3);
      for (const v of list) { expect(v.admin).toBeUndefined(); expect(v.canReveal).toBe(false); }
      expect(list.find((v) => v.nextStep)!.nextStep!.text).toBe("Call back about the lab bill");
    }
    expect(setAdminTo(s, ELDER, [FAMILY])).toBe(true);
    expect(callsFor(s, FAMILY)[0].admin?.outcome).toBeTruthy();
    expect(callsFor(s, CAREGIVER)[0].admin).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "updated", resource: "who sees her insurance and admin details" });
  });

  it("only Maggie chooses who sees insurance details, and a general settings write can't change it", () => {
    const s = noon();
    expect(setAdminTo(s, GUARDIAN, [FAMILY])).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
    applySettings(s, GUARDIAN, { adminTo: [FAMILY] });
    expect(s.settings.adminTo).toEqual([]);
    expect(setAdminTo(s, ELDER, [FAMILY, "m-nobody", GUARDIAN])).toBe(true);
    expect(s.settings.adminTo).toEqual([FAMILY]);
  });

  it("shows reference numbers masked to the last 4, and only Maggie and Sarah can reveal them, each reveal audited", () => {
    const s = noon();
    setAdminTo(s, ELDER, [FAMILY]);
    expect(maskRef("CLM88120773")).toBe("•••• 0773");
    const id = s.calls.find((c) => c.ref === "CLM88120773")!.id;
    expect(JSON.stringify(callsFor(s, FAMILY))).not.toContain("CLM88120773");
    expect(revealRef(s, FAMILY, id)).toBeNull();
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied", resource: "read calls.ref" });
    expect(revealRef(s, GUARDIAN, id)).toBe("CLM88120773");
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "viewed", resource: "a call reference number" });
    expect(revealRef(s, ELDER, id)).toBe("CLM88120773");
    expect(callsFor(s, ELDER).find((c) => c.id === id)!.canReveal).toBe(true);
  });

  it("only Maggie and Sarah add, change or delete calls; every change is audited and the log stays intact", () => {
    const s = onShift(noon());
    expect(saveCall(s, FAMILY, call({ date: inDays(s, 0) }))).toBeNull();
    expect(saveCall(s, CAREGIVER, call({ date: inDays(s, 0) }))).toBeNull();
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "denied", resource: "write calls" });
    const c = saveCall(s, ELDER, call({ date: inDays(s, -1), org: "Fog City Pharmacy" }))!;
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, -1), org: "Fog City Pharmacy", outcome: "Refill is ready Friday." }), c.id)!.outcome).toBe("Refill is ready Friday.");
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "updated", resource: "a call log entry" });
    expect(c.updatedBy).toBe(GUARDIAN);
    expect(deleteCall(s, FAMILY, c.id)).toBe(false);
    expect(deleteCall(s, GUARDIAN, c.id)).toBe(true);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "removed", resource: "a call log entry" });
    expect(s.calls.some((x) => x.id === c.id)).toBe(false);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("refuses a missing organization, a future date and text over the limits", () => {
    const s = noon();
    const n = s.calls.length;
    expect(saveCall(s, GUARDIAN, call({ org: "  ", date: inDays(s, 0) }))).toBeNull();
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, 1) }))).toBeNull();
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, 0), ref: "9".repeat(41) }))).toBeNull();
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, 0), outcome: "x".repeat(1001) }))).toBeNull();
    expect(s.calls.length).toBe(n);
  });

  it("while Maggie has paused sharing, family and caregivers can't see the call log at all", () => {
    const s = onShift(noon());
    setAdminTo(s, ELDER, [FAMILY, CAREGIVER]);
    applySettings(s, ELDER, { sharingPaused: true });
    expect(canSeeCalls(s, FAMILY)).toBe(false);
    expect(callsFor(s, FAMILY)).toEqual([]);
    expect(callsFor(s, CAREGIVER)).toEqual([]);
    expect(callsFor(s, GUARDIAN).length).toBe(3);
  });

  it("a caregiver off shift sees nothing", () => {
    const s = offShift(noon());
    expect(callsFor(s, CAREGIVER)).toEqual([]);
    expect(callOrgs(s, CAREGIVER)).toEqual([]);
  });
});

describe("A call's next step becomes a task (CC-227)", () => {
  it("becomes its owner's care task, titled with the organization and the step, never the reference", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Mail the signed form", owner: FAMILY, date: inDays(s, 3) } }))!;
    const t = s.tasks.find((x) => x.id === c.nextStep!.taskId)!;
    expect(t).toMatchObject({ title: "Bayside Health Plan: Mail the signed form", recurrence: "once", date: inDays(s, 3), assignee: FAMILY, callId: c.id });
    expect(t.title).not.toContain("1234");
    expect(nextStepsFor(s, FAMILY).map((x) => x.task.title)).toContain("Bayside Health Plan: Mail the signed form");
    expect(tasksFor(s).some((x) => x.task.id === t.id)).toBe(false);
    const told = keyed(s, `call-step-${t.id}`)[0];
    expect(told).toMatchObject({ to: ["family"], title: "You have a new task in Circle Care" });
  });

  it("reminds the owner the day before with the generic title", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Mail the signed form", owner: FAMILY, date: inDays(s, 3) } }))!;
    const key = `call-remind-${c.nextStep!.taskId}`;
    later(s, 1);
    expect(keyed(s, key)).toEqual([]);
    later(s, 1, "07:00");
    const r = keyed(s, key);
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ to: ["family"], title: "You have a reminder from Circle Care", detail: "Tomorrow: Bayside Health Plan, Mail the signed form." });
    later(s, 0, "09:00");
    expect(keyed(s, key).length).toBe(1);
  });

  it("flags it overdue for Sarah the morning after its day, once", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Mail the signed form", owner: FAMILY, date: inDays(s, 1) } }))!;
    const key = `call-overdue-${c.nextStep!.taskId}`;
    later(s, 1);
    expect(keyed(s, key)).toEqual([]);
    later(s, 1, "07:00");
    expect(keyed(s, key)).toEqual([]);
    at(s, "08:30"); evaluate(s);
    const o = keyed(s, key);
    expect(o.length).toBe(1);
    expect(o[0]).toMatchObject({ to: ["guardian"], title: "Circle Care needs your attention" });
    expect(callsFor(s, GUARDIAN).find((x) => x.id === c.id)!.nextStep!.overdue).toBe(true);
    expect(nextStepsFor(s, FAMILY).find((x) => x.task.callId === c.id)!.overdue).toBe(true);
  });

  it("when the task is done, the call shows the step done with who and when", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Mail the signed form", owner: FAMILY, date: inDays(s, 1) } }))!;
    expect(finishNextStep(s, FAMILY, c.nextStep!.taskId)).toBe(true);
    const st = callsFor(s, GUARDIAN).find((x) => x.id === c.id)!.nextStep!;
    expect(st.done).toMatchObject({ by: FAMILY });
    expect(Math.abs(new Date(st.done!.at).getTime() - clock(s).getTime())).toBeLessThan(1000);
    later(s, 2);
    expect(keyed(s, `call-overdue-${c.nextStep!.taskId}`)).toEqual([]);
  });

  it("changing the step moves the task; removing it deletes the task; a done step stays", () => {
    const s = noon();
    const input = call({ date: inDays(s, 0), step: { text: "Mail the signed form", owner: FAMILY, date: inDays(s, 2) } });
    const c = saveCall(s, GUARDIAN, input)!;
    const first = c.nextStep!.taskId;
    saveCall(s, GUARDIAN, { ...input, step: { text: "Mail the signed form", owner: GUARDIAN, date: inDays(s, 2) } }, c.id);
    expect(s.tasks.some((t) => t.id === first)).toBe(false);
    expect(s.tasks.find((t) => t.id === c.nextStep!.taskId)!.assignee).toBe(GUARDIAN);
    saveCall(s, GUARDIAN, { ...input, step: null }, c.id);
    expect(c.nextStep).toBeUndefined();
    expect(s.tasks.some((t) => t.callId === c.id)).toBe(false);
    const again = saveCall(s, GUARDIAN, input, c.id)!;
    finishNextStep(s, FAMILY, again.nextStep!.taskId);
    saveCall(s, GUARDIAN, { ...input, step: null }, c.id);
    expect(c.nextStep?.text).toBe("Mail the signed form");
  });

  it("refuses a step in the past or for someone outside the circle", () => {
    const s = noon();
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Too late", owner: FAMILY, date: inDays(s, -1) } }))).toBeNull();
    expect(saveCall(s, GUARDIAN, call({ date: inDays(s, 0), step: { text: "Who?", owner: "m-ruth", date: inDays(s, 1) } }))).toBeNull();
    runCalls(s);
  });
});

describe("Find past calls by organization (CC-228)", () => {
  it("filters by organization, ignoring case and spaces, newest first", () => {
    const s = noon();
    const list = callsFor(s, GUARDIAN, "  bayside   health plan ");
    expect(list.map((c) => c.id)).toEqual(["call-3", "call-1"]);
    expect(list[0].nextStep?.text).toBe("Call back about the lab bill");
    expect(callOrgs(s, GUARDIAN)).toEqual(["Bayside Health Plan", "Fog City Pharmacy"]);
  });

  it("a caregiver without insurance access sees only organization, date and next step in the filtered list", () => {
    const s = onShift(noon());
    const list = callsFor(s, CAREGIVER, "Bayside Health Plan");
    expect(list.length).toBe(2);
    for (const c of list) expect(Object.keys(c).filter((k) => (c as Record<string, unknown>)[k] !== undefined).sort()).toEqual(["canReveal", "date", "id", ...(c.nextStep ? ["nextStep"] : []), "org"].sort());
  });

  it("no match is an empty list", () => {
    expect(callsFor(noon(), GUARDIAN, "Golden Gate Home Care")).toEqual([]);
  });
});

describe("What matters to me (CC-219)", () => {
  const sec = (s: State, key: string) => s.aboutMe.sections.find((x) => x.key === key)!;

  it("Maggie writes a section in her words; nobody else sees it until she picks", () => {
    const s = onShift(noon());
    expect(saveSection(s, ELDER, "avoid", "  Please don't move my photos.  ")).toBe(true);
    expect(sec(s, "avoid")).toMatchObject({ text: "Please don't move my photos.", by: ELDER, sharedWith: [] });
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "created", resource: "What matters to me (Things I don't want)" });
    for (const who of [GUARDIAN, FAMILY, CAREGIVER]) expect(canSeeSection(s, who, sec(s, "avoid"))).toBe(false);
    expect(canSeeSection(s, ELDER, sec(s, "avoid"))).toBe(true);
  });

  it("Ana sees a section Maggie shares with her on her shift screen, and nothing off shift", () => {
    const s = onShift(noon());
    expect(shiftSections(s, CAREGIVER).map((x) => x.key)).toEqual(["help", "day"]);
    offShift(s);
    expect(shiftSections(s, CAREGIVER)).toEqual([]);
    expect(aboutView(s, CAREGIVER)).toEqual([]);
  });

  it("Maggie changes who sees a section; it takes effect at once and is logged; nobody else can", () => {
    const s = onShift(noon());
    expect(setSectionSharing(s, ELDER, "help", [GUARDIAN])).toBe(true);
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "updated", resource: "who sees What matters to me (How to help me)" });
    expect(shiftSections(s, CAREGIVER).map((x) => x.key)).toEqual(["day"]);
    expect(setSectionSharing(s, GUARDIAN, "help", [GUARDIAN, FAMILY])).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
    expect(sec(s, "help").sharedWith).toEqual([GUARDIAN]);
  });

  it("when Sarah edits, Maggie sees what changed and who changed it the next time she opens the page", () => {
    const s = noon();
    const old = sec(s, "day").text;
    expect(saveSection(s, GUARDIAN, "day", "I wake up around 7:30 and like my tea first.")).toBe(true);
    expect(saveSection(s, GUARDIAN, "day", "I wake up around 7:30 and like my tea first. Radio after lunch.")).toBe(true);
    const ch = changesForMaggie(s);
    expect(ch.length).toBe(1);
    expect(ch[0]).toMatchObject({ key: "day", changedBy: GUARDIAN, before: old, text: "I wake up around 7:30 and like my tea first. Radio after lunch." });
    markSeen(s, GUARDIAN);
    expect(changesForMaggie(s).length).toBe(1);
    markSeen(s, ELDER);
    expect(changesForMaggie(s)).toEqual([]);
    expect(sec(s, "day").before).toBeUndefined();
  });

  it("with editing turned off, Sarah reads the sections shared with her but can't change them", () => {
    const s = noon();
    expect(setSarahEditing(s, GUARDIAN, false)).toBe(false);
    expect(setSarahEditing(s, ELDER, false)).toBe(true);
    expect(canEditSection(s, GUARDIAN, "day")).toBe(false);
    expect(saveSection(s, GUARDIAN, "day", "Changed")).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied", resource: "change Maggie's What matters to me" });
    expect(aboutView(s, GUARDIAN).map((x) => x.key)).toEqual(["day", "food", "help"]);
    expect(aboutView(s, GUARDIAN).every((x) => !x.canEdit)).toBe(true);
  });

  it("Sarah can write a new section, shared with her only until Maggie picks, and Maggie is told", () => {
    const s = noon();
    expect(saveSection(s, GUARDIAN, "avoid", "Loud TV in the morning.")).toBe(true);
    expect(sec(s, "avoid").sharedWith).toEqual([GUARDIAN]);
    expect(canSeeSection(s, FAMILY, sec(s, "avoid"))).toBe(false);
    expect(s.alerts.find((a) => a.key?.startsWith("about-avoid"))).toMatchObject({ to: ["elder"], title: "Update from Circle Care" });
  });

  it("family and caregivers can't write, and see no sections while Maggie has paused sharing", () => {
    const s = onShift(noon());
    expect(saveSection(s, FAMILY, "food", "Pizza")).toBe(false);
    expect(saveSection(s, CAREGIVER, "help", "x")).toBe(false);
    expect(aboutView(s, FAMILY).map((x) => x.key)).toEqual(["food"]);
    applySettings(s, ELDER, { sharingPaused: true });
    expect(aboutView(s, FAMILY)).toEqual([]);
    expect(shiftSections(s, CAREGIVER)).toEqual([]);
    expect(aboutView(s, GUARDIAN).length).toBeGreaterThan(0);
  });

  it("only Maggie can clear a section to remove it", () => {
    const s = noon();
    expect(saveSection(s, GUARDIAN, "food", "  ")).toBe(false);
    expect(saveSection(s, ELDER, "food", "")).toBe(true);
    expect(s.aboutMe.sections.some((x) => x.key === "food")).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "removed", resource: "What matters to me (Food I like)" });
    expect(verifyChain(s.audit).ok).toBe(true);
  });
});
