import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate, applySettings } from "../data/store";
import { clock, todayOf } from "../data/selectors";
import { can } from "../data/policy";
import { askHelp, setHelpFrom, helpFromPeople, elderHelpLines, claimHelp, finishHelp, helpBoard, helpView, whoDidWhat, whoDidLine, thankFor, postHelp, canSeeHelp } from "../data/help";
import { startPlan, activePlan, assignItem, renameItem, addItem, removeItem, itemState, followUpBooked, setFollowUpDays, runPlans, FOLLOW_UP_DAYS } from "../data/comingHome";
import { addQuestion, questionsFor, hideQuestion, moveQuestion, removeQuestion, printList, canSeeQuestions, upcomingVisits } from "../data/visitQuestions";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, uid, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 17 (CC-211 – CC-214, CC-217). Times are pinned so a test never crosses midnight by accident.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const nextDay = (s: State, time = "12:00") => { s.clockOffsetMin += 24 * 60; at(s, time); evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); s.help = []; s.plans = []; return s; };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const shift = (s: State, on: boolean) => {
  const now = clock(s).toISOString();
  s.visits = s.visits.filter((v) => !(v.caregiverId === CAREGIVER && v.date === todayOf(s)));
  s.visits.push({ id: uid("v"), shiftId: "s-ana", caregiverId: CAREGIVER, date: todayOf(s), checkIn: now, ...(on ? {} : { checkOut: now }) });
};

describe("Maggie asks for a hand herself (CC-211)", () => {
  it("goes to the people she allowed, shows as a day without a time, and Sarah is told", () => {
    const s = noon();
    expect(helpFromPeople(s)).toEqual([FAMILY]);
    const r = askHelp(s, ELDER, { kind: "groceries", date: inDays(s, 1) })!;
    expect(r).toBeTruthy();
    expect(r.audience).toEqual([FAMILY]);
    expect(r.anyTime).toBe(true);
    const [a] = keyed(s, `help-new-${r.id}`);
    expect(a.to).toEqual(["family"]);
    expect(a.title).toBe("New help request in Circle Care");
    expect(a.detail).toMatch(/^Maggie asked for help: Groceries, \w+, \w+ \d+\.$/);
    expect(keyed(s, `help-asked-${r.id}`)[0]).toMatchObject({ to: ["guardian"], title: "Update from Circle Care" });
    expect(canSeeHelp(s, CAREGIVER, r)).toBe(false);
    expect(helpView(s, FAMILY, r).when).not.toMatch(/AM|PM/);
  });

  it("when someone takes it, her home says who is doing what and when", () => {
    const s = noon();
    const r = askHelp(s, ELDER, { kind: "groceries", date: inDays(s, 1) })!;
    expect(elderHelpLines(s)[0].text).toMatch(/^You asked for groceries \w+\. No one has it yet\.$/);
    expect(claimHelp(s, FAMILY, r.id, r.rev)).toEqual({ ok: true });
    const [line] = elderHelpLines(s);
    expect(line.claimed).toBe(true);
    expect(line.text).toMatch(/^James is bringing groceries \w+$/);
  });

  it("\"Something else\" needs words, and only Maggie can ask this way", () => {
    const s = noon();
    expect(askHelp(s, ELDER, { kind: "other", date: inDays(s, 1), note: "  " })).toBeNull();
    expect(askHelp(s, ELDER, { kind: "other", date: inDays(s, 1), note: "Change the smoke alarm battery" })).toBeTruthy();
    expect(askHelp(s, GUARDIAN, { kind: "groceries", date: inDays(s, 1) })).toBeNull();
    expect(askHelp(s, ELDER, { kind: "groceries", date: inDays(s, -1) })).toBeNull();
    expect(askHelp(s, ELDER, { kind: "phone", date: inDays(s, 2) })!.kind).toBe("phone");
  });

  it("with nobody allowed, nothing is sent", () => {
    const s = noon();
    setHelpFrom(s, ELDER, []);
    expect(helpFromPeople(s)).toEqual([]);
    expect(askHelp(s, ELDER, { kind: "company", date: inDays(s, 1) })).toBeNull();
    expect(s.help).toEqual([]);
  });

  it("only Maggie chooses who sees her requests; a general settings change can't, and both are audited", () => {
    const s = noon();
    expect(setHelpFrom(s, ELDER, [FAMILY, CAREGIVER, "m-stranger"])).toBe(true);
    expect(s.settings.helpFrom).toEqual([FAMILY, CAREGIVER]);
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "updated", resource: "who sees the help she asks for" });
    expect(setHelpFrom(s, GUARDIAN, [])).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
    applySettings(s, GUARDIAN, { helpFrom: [] });
    expect(s.settings.helpFrom).toEqual([FAMILY, CAREGIVER]);
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
  });

  it("someone who leaves the circle stops getting them", () => {
    const s = noon();
    s.members.find((m) => m.id === FAMILY)!.status = "revoked";
    expect(helpFromPeople(s)).toEqual([]);
    expect(askHelp(s, ELDER, { kind: "ride", date: inDays(s, 1) })).toBeNull();
  });
});

describe("Who did what this week (CC-212)", () => {
  it("lists everyone A to Z with help requests, care tasks and visits, without ranking", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, { kind: "visit", note: "", date: inDays(s, 0), time: "12:30", audience: [FAMILY] })!;
    claimHelp(s, FAMILY, r.id, r.rev);
    finishHelp(s, FAMILY, r.id);
    const rows = whoDidWhat(s, GUARDIAN);
    expect(rows.map((x) => x.name)).toEqual([...rows.map((x) => x.name)].sort((a, b) => a.localeCompare(b)));
    const james = rows.find((x) => x.id === FAMILY)!;
    expect(james.help).toBe(1);
    expect(whoDidLine(james)).toMatch(/^1 help request/);
    expect(rows.some((x) => x.id === ELDER)).toBe(false);
    const ana = rows.find((x) => x.id === CAREGIVER);
    if (ana) expect(ana.tasks + ana.visits).toBeGreaterThan(0);
    for (const row of rows) expect(whoDidLine(row)).not.toMatch(/missed|late|most|least|rank/i);
  });

  it("only Sarah and Maggie see it", () => {
    const s = noon();
    expect(whoDidWhat(s, FAMILY)).toEqual([]);
    expect(whoDidWhat(s, CAREGIVER)).toEqual([]);
  });

  it("Maggie's Thank sends a short note in the family chat; not for someone who has left", () => {
    const s = noon();
    const before = s.chat.messages.length;
    expect(thankFor(s, ELDER, FAMILY)).toBe(true);
    expect(s.chat.messages.length).toBe(before + 1);
    expect(s.chat.messages.at(-1)).toMatchObject({ by: ELDER, text: "Thank you, James, for all your help this week." });
    expect(thankFor(s, GUARDIAN, FAMILY)).toBe(false);
    s.taskLogs.push({ taskId: "t-walk", date: todayOf(s), by: "m-ruth", at: clock(s).toISOString() });
    const ruth = whoDidWhat(s, ELDER).find((x) => x.id === "m-ruth")!;
    expect(ruth.left).toBe(true);
    expect(ruth.tasks).toBe(1);
    expect(thankFor(s, ELDER, "m-ruth")).toBe(false);
  });
});

describe("Coming Home plan (CC-213)", () => {
  it("starts with four items and never asks why Maggie was in hospital", () => {
    const s = noon();
    const p = startPlan(s, GUARDIAN, inDays(s, 3))!;
    expect(p.items.map((i) => i.title)).toEqual(["Pick up medicines", "Book a follow-up visit", "Get the home ready", "Stay the first night"]);
    expect(Object.keys(p)).not.toContain("reason");
    expect(p.followUpDays).toBe(FOLLOW_UP_DAYS);
    expect(startPlan(s, FAMILY, inDays(s, 3))).toBeNull();
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied", resource: "write plan" });
  });

  it("giving an item to someone puts it on their board and tells them; others see only theirs", () => {
    const s = noon();
    const p = startPlan(s, GUARDIAN, inDays(s, 3))!;
    const meds = p.items[0];
    expect(assignItem(s, GUARDIAN, p.id, meds.id, FAMILY)).toBe(true);
    const r = s.help.find((x) => x.planItemId === meds.id)!;
    expect(r.audience).toEqual([FAMILY]);
    expect(helpBoard(s, FAMILY).map((x) => x.id)).toEqual([r.id]);
    expect(helpBoard(s, CAREGIVER)).toEqual([]);
    expect(helpView(s, FAMILY, r).title).toBe("Pick up medicines");
    const [a] = keyed(s, `help-new-${r.id}`);
    expect(a).toMatchObject({ to: ["family"], title: "New help request in Circle Care" });
    expect(a.detail).not.toMatch(/hospital/i);
    expect(can(s, FAMILY, "read", "plan")).toBe(false);
    expect(itemState(s, p, meds).label).toBe("Given to James, waiting for a yes");
    claimHelp(s, FAMILY, r.id, r.rev);
    expect(itemState(s, p, meds).label).toBe("James has this");
  });

  it("giving it to someone else cancels the earlier request; renaming carries over", () => {
    const s = noon();
    const p = startPlan(s, GUARDIAN, inDays(s, 3))!;
    const home = p.items[2];
    assignItem(s, GUARDIAN, p.id, home.id, FAMILY);
    const first = s.help.find((x) => x.planItemId === home.id)!;
    assignItem(s, GUARDIAN, p.id, home.id, CAREGIVER);
    expect(first.status).toBe("cancelled");
    const second = s.help.find((x) => x.planItemId === home.id && x.status === "open")!;
    expect(second.audience).toEqual([CAREGIVER]);
    renameItem(s, GUARDIAN, p.id, home.id, "Clear the hallway");
    expect(second.title).toBe("Clear the hallway");
    assignItem(s, GUARDIAN, p.id, home.id, GUARDIAN);
    expect(second.status).toBe("cancelled");
    expect(itemState(s, p, home).label).toBe("You have this");
    const extra = addItem(s, GUARDIAN, p.id, "Bring dinner the first evening")!;
    expect(p.items.at(-1)).toBe(extra);
    expect(removeItem(s, GUARDIAN, p.id, extra.id)).toBe(true);
  });

  it("a day before, Sarah is told once if anything has nobody yet", () => {
    const s = noon();
    const p = startPlan(s, GUARDIAN, inDays(s, 2))!;
    for (const it of p.items.slice(0, 3)) assignItem(s, GUARDIAN, p.id, it.id, FAMILY);
    evaluate(s);
    expect(keyed(s, `plan-open-${p.id}`)).toHaveLength(0);
    nextDay(s);
    const open = keyed(s, `plan-open-${p.id}`);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ to: ["guardian"], title: "Update from Circle Care", detail: "1 item in Maggie's coming-home plan has no one yet." });
    nextDay(s);
    expect(keyed(s, `plan-open-${p.id}`)).toHaveLength(1);
  });

  it("30 days after coming home it becomes read-only", () => {
    const s = noon();
    const p = startPlan(s, GUARDIAN, inDays(s, 0))!;
    s.clockOffsetMin += 31 * 24 * 60;
    evaluate(s);
    expect(p.archived).toBe(true);
    expect(activePlan(s)).toBeUndefined();
    expect(renameItem(s, GUARDIAN, p.id, p.items[0].id, "Changed")).toBe(false);
    expect(assignItem(s, GUARDIAN, p.id, p.items[0].id, FAMILY)).toBe(false);
  });
});

describe("first follow-up visit is booked (CC-214)", () => {
  const plan = (s: State, days = 1) => { s.appointments = s.appointments.filter((a) => a.kind !== "doctor"); return startPlan(s, GUARDIAN, inDays(s, days))!; };

  it("reminds Sarah each day at 9 AM, only Sarah, with a plain title, until one is booked", () => {
    const s = noon();
    const p = plan(s);
    at(s, "08:30"); s.clockOffsetMin += 24 * 60; evaluate(s);
    const today = todayOf(s);
    expect(keyed(s, `plan-follow-${p.id}-${today}`)).toHaveLength(0);
    at(s, "09:00"); evaluate(s);
    const [a] = keyed(s, `plan-follow-${p.id}-${today}`);
    expect(a).toMatchObject({ to: ["guardian"], title: "You have a reminder from Circle Care" });
    expect(itemState(s, p, p.items[1]).label).toBe("Not booked yet");
    evaluate(s);
    expect(keyed(s, `plan-follow-${p.id}-${today}`)).toHaveLength(1);
    s.appointments.push({ id: uid("appt"), date: inDays(s, 3), time: "10:00", durationMin: 45, kind: "doctor", title: "Follow-up", provider: "Dr. Brooks", location: "Clinic", medIds: [], status: "scheduled", createdBy: GUARDIAN });
    expect(followUpBooked(s, p)).toBeTruthy();
    expect(itemState(s, p, p.items[1]).label).toMatch(/^Booked: /);
    nextDay(s, "09:30");
    expect(keyed(s, `plan-follow-${p.id}-${todayOf(s)}`)).toHaveLength(0);
  });

  it("never in Sarah's quiet hours", () => {
    const s = noon();
    s.settings.quietHours = { on: true, start: "21:00", end: "10:00" };
    const p = plan(s);
    s.clockOffsetMin += 24 * 60; at(s, "09:15"); evaluate(s);
    expect(keyed(s, `plan-follow-${p.id}`)).toHaveLength(0);
    at(s, "10:05"); evaluate(s);
    expect(keyed(s, `plan-follow-${p.id}`)).toHaveLength(1);
  });

  it("Sarah can widen the window; once it passes, reminders stop and it stays Not booked yet", () => {
    const s = noon();
    const p = plan(s, 0);
    expect(setFollowUpDays(s, GUARDIAN, p.id, 14)).toBe(true);
    expect(setFollowUpDays(s, GUARDIAN, p.id, 5)).toBe(false);
    expect(p.followUpDays).toBe(14);
    s.clockOffsetMin += 15 * 24 * 60; at(s, "09:30"); runPlans(s);
    expect(keyed(s, `plan-follow-${p.id}-${todayOf(s)}`)).toHaveLength(0);
    expect(itemState(s, p, p.items[1]).label).toBe("Not booked yet");
  });
});

describe("shared question list for the next doctor visit (CC-217)", () => {
  const visit = (s: State) => upcomingVisits(s, GUARDIAN).find((a) => a.title === "Diabetes follow-up")!;

  it("the prep note is the first item; anyone allowed adds, and everyone sees who added what", () => {
    const s = noon();
    shift(s, true);
    const a = visit(s);
    expect(questionsFor(s, FAMILY, a.id).map((q) => q.text)).toEqual(["Bring the glucose log."]);
    expect(addQuestion(s, FAMILY, a.id, "Ask about the morning dizziness")).toBeTruthy();
    expect(addQuestion(s, CAREGIVER, a.id, "She's been more tired after lunch")).toBeTruthy();
    expect(addQuestion(s, ELDER, a.id, "Can I stop the evening pill?")).toBeTruthy();
    const list = questionsFor(s, GUARDIAN, a.id);
    expect(list.map((q) => q.by)).toEqual([GUARDIAN, FAMILY, CAREGIVER, ELDER]);
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "created", resource: "a question for a visit" });
  });

  it("Maggie hides an item: only she and Sarah see it, and it's left off the printout unless added back", () => {
    const s = noon();
    const a = visit(s);
    const q = addQuestion(s, ELDER, a.id, "Something private")!;
    expect(hideQuestion(s, GUARDIAN, a.id, q.id, true)).toBe(false);
    expect(hideQuestion(s, ELDER, a.id, q.id, true)).toBe(true);
    expect(questionsFor(s, FAMILY, a.id).some((x) => x.id === q.id)).toBe(false);
    expect(questionsFor(s, GUARDIAN, a.id).some((x) => x.id === q.id)).toBe(true);
    expect(printList(s, GUARDIAN, a.id).some((x) => x.id === q.id)).toBe(false);
    expect(printList(s, GUARDIAN, a.id, true).some((x) => x.id === q.id)).toBe(true);
    expect(printList(s, FAMILY, a.id)).toEqual([]);
    expect(removeQuestion(s, FAMILY, a.id, q.id)).toBe(false);
  });

  it("Sarah sets the order; only the author or Sarah removes an item", () => {
    const s = noon();
    const a = visit(s);
    const q = addQuestion(s, FAMILY, a.id, "Second")!;
    expect(moveQuestion(s, FAMILY, a.id, q.id, -1)).toBe(false);
    expect(moveQuestion(s, GUARDIAN, a.id, q.id, -1)).toBe(true);
    expect(questionsFor(s, GUARDIAN, a.id)[0].id).toBe(q.id);
    expect(removeQuestion(s, ELDER, a.id, q.id)).toBe(false);
    expect(removeQuestion(s, FAMILY, a.id, q.id)).toBe(true);
  });

  it("Ana off shift, or anyone without appointment access, can't see or add", () => {
    const s = noon();
    shift(s, false);
    const a = visit(s);
    expect(canSeeQuestions(s, CAREGIVER)).toBe(false);
    expect(questionsFor(s, CAREGIVER, a.id)).toEqual([]);
    expect(addQuestion(s, CAREGIVER, a.id, "Hi")).toBeNull();
    applySettings(s, ELDER, { sharingPaused: true });
    expect(canSeeQuestions(s, FAMILY)).toBe(false);
    expect(addQuestion(s, FAMILY, a.id, "Hi")).toBeNull();
  });

  it("the audit chain still verifies after all of this", () => {
    const s = noon();
    askHelp(s, ELDER, { kind: "groceries", date: inDays(s, 1) });
    const p = startPlan(s, GUARDIAN, inDays(s, 2))!;
    assignItem(s, GUARDIAN, p.id, p.items[0].id, FAMILY);
    addQuestion(s, GUARDIAN, visit(s).id, "One more");
    expect(verifyChain(s.audit).ok).toBe(true);
  });
});
