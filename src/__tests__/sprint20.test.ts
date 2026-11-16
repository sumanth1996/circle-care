import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate, pushAlert } from "../data/store";
import { clock } from "../data/selectors";
import {
  setAway, answerAway, maggieAsksChange, imBack, seenSummary, activeAway, currentAway, lastEnded, backupCandidates,
  escalationOrder, untilText, coverView, routeForCover, AWAY_MAX_DAYS,
} from "../data/away";
import { saveCall } from "../data/callLog";
import { nextStepsFor, finishNextStep } from "../data/visitNotes";
import { can } from "../data/policy";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 20: away mode (CC-229 – CC-231). Sarah sets her away dates and asks James to cover; while he does, the
// alerts his own role can see go to him and he takes her place in the SOS order. Times are pinned to noon.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, days: number, time = "12:00") => { s.clockOffsetMin += days * 24 * 60; at(s, time); evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
/** Sarah away from tomorrow for a week, James asked. */
const asked = () => { const s = noon(); setAway(s, GUARDIAN, { start: inDays(s, 1), end: inDays(s, 7), backupId: FAMILY }); return s; };
/** As above, James has said yes, and it's now the first day. */
const covering = () => { const s = asked(); answerAway(s, FAMILY, true); later(s, 1); return s; };
const guardianAlert = (s: State, key: string, link = "/app/guardian") =>
  pushAlert(s, { key, to: ["guardian"], severity: "warning", title: "Circle Care needs your attention", detail: "Maggie's 8 AM medicine wasn't marked taken.", link });

describe("Set away dates and a backup (CC-229)", () => {
  it("Sarah sets her dates and asks James; James is told, Maggie is told in plain words, and it's audited", () => {
    const s = asked();
    const a = currentAway(s)!;
    expect(a).toMatchObject({ backupId: FAMILY, status: "asked", start: inDays(s, 1), end: inDays(s, 7) });
    expect(keyed(s, "away-ask-")[0]).toMatchObject({ to: ["family"], title: "You have a new request in Circle Care", link: "/app/family/away" });
    const told = keyed(s, "away-elder-")[0];
    expect(told.to).toEqual(["elder"]);
    expect(told.detail).toMatch(/^Sarah will be away from .+ to .+\. She asked James to look after things while she's gone\.$/);
    expect(s.audit.some((e) => e.actorId === GUARDIAN && e.action === "created" && e.resource === "away dates and backup")).toBe(true);
    expect(activeAway(s)).toBeUndefined();
  });

  it("only family is offered as a backup, never a paid caregiver", () => {
    const s = noon();
    expect(backupCandidates(s).map((m) => m.id)).toEqual([FAMILY]);
    expect(setAway(s, GUARDIAN, { start: inDays(s, 1), end: inDays(s, 3), backupId: CAREGIVER })).toBeNull();
    expect(currentAway(s)).toBeUndefined();
  });

  it("refuses dates in the past, an end before the start, and more than the maximum", () => {
    const s = noon();
    expect(setAway(s, GUARDIAN, { start: inDays(s, -1), end: inDays(s, 3), backupId: FAMILY })).toBeNull();
    expect(setAway(s, GUARDIAN, { start: inDays(s, 4), end: inDays(s, 3), backupId: FAMILY })).toBeNull();
    expect(setAway(s, GUARDIAN, { start: inDays(s, 1), end: inDays(s, 2 + AWAY_MAX_DAYS), backupId: FAMILY })).toBeNull();
  });

  it("only Sarah sets away mode; anyone else is refused and the refusal audited", () => {
    const s = noon();
    for (const who of [ELDER, FAMILY, CAREGIVER]) {
      expect(setAway(s, who, { start: inDays(s, 1), end: inDays(s, 3), backupId: FAMILY })).toBeNull();
      expect(lastAudit(s)).toMatchObject({ actorId: who, action: "denied" });
    }
    expect(can(s, GUARDIAN, "write", "away")).toBe(true);
    expect(can(s, FAMILY, "write", "away")).toBe(false);
  });

  it("only the person asked can answer; a yes tells Sarah and Maggie", () => {
    const s = asked();
    expect(answerAway(s, CAREGIVER, true)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "denied" });
    expect(answerAway(s, FAMILY, true)).toBe(true);
    expect(currentAway(s)!.status).toBe("accepted");
    expect(lastAudit(s).resource === "covering for Sarah" || s.audit.some((e) => e.actorId === FAMILY && e.action === "approved")).toBe(true);
    expect(keyed(s, "away-answer-")[0]).toMatchObject({ to: ["guardian"], detail: expect.stringMatching(/^James will cover for you/) });
    expect(keyed(s, "away-elder-ok-")[0].detail).toMatch(/^James will look after you while Sarah is away, until /);
  });

  it("if nobody has said yes the day before, Sarah is reminded once to pick someone else", () => {
    const s = noon();
    setAway(s, GUARDIAN, { start: inDays(s, 2), end: inDays(s, 5), backupId: FAMILY });
    evaluate(s);
    expect(keyed(s, "away-pick-")).toHaveLength(0);
    later(s, 1);
    expect(keyed(s, "away-pick-")).toHaveLength(1);
    expect(keyed(s, "away-pick-")[0]).toMatchObject({ to: ["guardian"], title: "You have a reminder from Circle Care" });
    later(s, 0, "15:00");
    expect(keyed(s, "away-pick-")).toHaveLength(1);
  });

  it("when James can't cover, Sarah is told and can ask someone else", () => {
    const s = asked();
    answerAway(s, FAMILY, false);
    expect(currentAway(s)!.status).toBe("declined");
    expect(keyed(s, "away-answer-")[0]).toMatchObject({ severity: "warning", detail: expect.stringMatching(/can't cover/) });
    later(s, 1);
    expect(activeAway(s)).toBeUndefined();
  });

  it("from the first day, Sarah's alerts that James can see go to him, marked as covering", () => {
    const s = covering();
    expect(activeAway(s)).toBeTruthy();
    expect(s.audit.some((e) => e.action === "updated" && e.resource === "away mode started")).toBe(true);
    guardianAlert(s, `dose-g-${inDays(s, 0)}-test`);
    const a = s.alerts.find((x) => x.key === `dose-g-${inDays(s, 0)}-test`)!;
    expect(a.to).toEqual(["family"]);
    expect(a.detail.startsWith("Covering for Sarah. ")).toBe(true);
    expect(a.link).toBe("/app/family/away");
    expect(a.awayId).toBe(currentAway(s)!.id);
  });

  it("alerts James's role can't see, like approvals and security notices, stay with Sarah", () => {
    const s = covering();
    guardianAlert(s, "approval-remind-x", "/app/guardian/approvals");
    guardianAlert(s, "security-x");
    for (const k of ["approval-remind-x", "security-x"]) expect(s.alerts.find((x) => x.key === k)!.to).toEqual(["guardian"]);
    // A shared alert keeps its other readers.
    const r = routeForCover(s, { key: "late-x-1", to: ["guardian", "caregiver"], severity: "warning", title: "t", detail: "d" });
    expect(r.to).toEqual(["caregiver", "family"]);
  });

  it("while James covers, he takes Sarah's place in the SOS order, and it reverts afterwards", () => {
    const s = covering();
    expect(s.settings.escalation).toEqual([GUARDIAN, CAREGIVER, FAMILY]);
    expect(escalationOrder(s)).toEqual([FAMILY, CAREGIVER]);
    imBack(s, GUARDIAN);
    expect(escalationOrder(s)).toEqual([GUARDIAN, CAREGIVER, FAMILY]);
  });

  it("before the first day nothing is routed, and the SOS order is unchanged", () => {
    const s = asked();
    answerAway(s, FAMILY, true);
    guardianAlert(s, `dose-g-${inDays(s, 0)}-early`);
    expect(s.alerts.find((x) => x.key === `dose-g-${inDays(s, 0)}-early`)!.to).toEqual(["guardian"]);
    expect(escalationOrder(s)[0]).toBe(GUARDIAN);
  });

  it("James sees Sarah's follow-ups due while he covers, within his role, and can finish them", () => {
    const s = noon();
    const c = saveCall(s, GUARDIAN, { org: "Bayside Health Plan", date: inDays(s, 0), step: { text: "Call back about the form", owner: GUARDIAN, date: inDays(s, 2) } })!;
    setAway(s, GUARDIAN, { start: inDays(s, 1), end: inDays(s, 4), backupId: FAMILY });
    expect(nextStepsFor(s, FAMILY).some((x) => x.task.id === c.nextStep!.taskId)).toBe(false);
    answerAway(s, FAMILY, true);
    later(s, 1);
    const step = nextStepsFor(s, FAMILY).find((x) => x.task.id === c.nextStep!.taskId)!;
    expect(step).toMatchObject({ covering: true });
    expect(finishNextStep(s, FAMILY, step.task.id)).toBe(true);
    expect(finishNextStep(s, CAREGIVER, step.task.id)).toBe(false);
  });

  it("James sees nothing new: away mode adds no read rights to his role", () => {
    const s = covering();
    const before = noon();
    for (const r of ["meds", "notes", "notes.private", "docs.legal", "approvals", "vitals", "audit", "settings", "data", "calls.admin"] as const) {
      expect(can(s, FAMILY, "read", r)).toBe(can(before, FAMILY, "read", r));
    }
    expect(can(s, FAMILY, "write", "settings")).toBe(false);
    expect(can(s, FAMILY, "write", "away")).toBe(false);
  });

  it("the change trail stays intact", () => {
    const s = covering();
    imBack(s, GUARDIAN);
    expect(verifyChain(s.audit).ok).toBe(true);
  });
});

describe("Hand back (CC-230)", () => {
  it("after the end date, alerts go to Sarah again and James gets a thank-you with a short summary", () => {
    const s = covering();
    guardianAlert(s, `dose-g-${inDays(s, 0)}-a`);
    const came = s.alerts.filter((x) => x.awayId).length;
    expect(came).toBeGreaterThan(0);
    later(s, 7);
    const a = lastEnded(s)!;
    expect(a).toMatchObject({ status: "ended", endedEarly: false });
    const thanks = keyed(s, "away-thanks-")[0];
    expect(thanks.to).toEqual(["family"]);
    expect(thanks.title).toBe("Update from Circle Care");
    expect(thanks.items![0]).toMatch(/^\d+ alerts? came to you$/);
    expect(a.summaryFor!.alerts).toBeGreaterThanOrEqual(came);
    guardianAlert(s, `dose-g-${inDays(s, 0)}-b`);
    expect(s.alerts.find((x) => x.key === `dose-g-${inDays(s, 0)}-b`)!.to).toEqual(["guardian"]);
  });

  it("\"I'm back\" hands everything back at once", () => {
    const s = covering();
    expect(imBack(s, FAMILY)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied" });
    expect(imBack(s, GUARDIAN)).toBe(true);
    expect(lastEnded(s)!.endedEarly).toBe(true);
    expect(activeAway(s)).toBeUndefined();
    expect(keyed(s, "away-elder-back-")[0].detail).toBe("Sarah is back. She's your first call again.");
  });

  it("an alert still open at hand-back moves to Sarah, and James is told it's hers now", () => {
    const s = covering();
    guardianAlert(s, `dose-g-${inDays(s, 0)}-open`);
    imBack(s, GUARDIAN);
    const a = s.alerts.find((x) => x.key === `dose-g-${inDays(s, 0)}-open`)!;
    expect(a.to).toContain("guardian");
    expect(a.movedToSarah).toBeTruthy();
    const open = lastEnded(s)!.summaryFor!.open;
    expect(open).toContain(a.id);
    expect(keyed(s, "away-thanks-")[0].detail).toMatch(open.length === 1 ? /One alert that was still open is hers now\./ : new RegExp(`${open.length} alerts that were still open are hers now\\.`));
    // An alert James has already read is not "still open".
    expect(s.alerts.filter((x) => x.awayId && !open.includes(x.id)).every((x) => !x.movedToSarah)).toBe(true);
  });

  it("Sarah gets one summary, open items first, and it goes once she's seen it", () => {
    const s = covering();
    guardianAlert(s, `dose-g-${inDays(s, 0)}-s`);
    imBack(s, GUARDIAN);
    expect(keyed(s, "away-back-")).toHaveLength(1);
    expect(lastEnded(s)!.summaryFor).toMatchObject({ alerts: s.alerts.filter((x) => x.awayId).length, tasksDone: 0, sos: 0 });
    seenSummary(s, FAMILY);
    expect(lastEnded(s)!.summarySeenAt).toBeUndefined();
    seenSummary(s, GUARDIAN);
    expect(lastEnded(s)!.summarySeenAt).toBeTruthy();
  });

  it("lock-screen titles never name a medicine or a condition", () => {
    const s = covering();
    guardianAlert(s, `dose-g-${inDays(s, 0)}-l`);
    imBack(s, GUARDIAN);
    for (const a of s.alerts.filter((x) => x.key?.startsWith("away-") || x.awayId)) {
      expect(["Update from Circle Care", "You have a new request in Circle Care", "You have a reminder from Circle Care", "Circle Care needs your attention"]).toContain(a.title);
    }
  });

  it("James's summary shows only what came to him", () => {
    const s = covering();
    guardianAlert(s, `dose-g-${inDays(s, 0)}-v`);
    guardianAlert(s, "approval-remind-v", "/app/guardian/approvals");
    imBack(s, GUARDIAN);
    const v = coverView(s, FAMILY)!;
    const keys = v.alerts.map((x) => x.key);
    expect(keys).toContain(`dose-g-${inDays(s, 0)}-v`);
    expect(keys).not.toContain("approval-remind-v");
    expect(v.alerts.every((x) => x.awayId === v.away.id)).toBe(true);
    expect(coverView(s, CAREGIVER)).toBeUndefined();
  });

  it("cancelling before the dates start just tells James he doesn't need to cover", () => {
    const s = asked();
    imBack(s, GUARDIAN);
    expect(s.aways[0].status).toBe("cancelled");
    expect(keyed(s, "away-cancel-")[0]).toMatchObject({ to: ["family"], detail: "Sarah cancelled her away dates. You don't need to cover." });
  });
});

describe("Who's covering, for Maggie (CC-231)", () => {
  it("says who covers and until when, in plain words", () => {
    const s = covering();
    const a = activeAway(s)!;
    expect(untilText(s, a.end)).toMatch(/^until (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/);
    expect(untilText(s, inDays(s, 0))).toBe("until tonight");
    expect(untilText(s, inDays(s, 20))).toMatch(/^until \w{3}, /);
  });

  it("Change tells Sarah and asks her to pick again; only Maggie can ask", () => {
    const s = covering();
    expect(maggieAsksChange(s, FAMILY)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied" });
    expect(maggieAsksChange(s, ELDER)).toBe(true);
    expect(currentAway(s)!.maggieAsked).toBeTruthy();
    const a = keyed(s, "away-maggie-")[0];
    expect(a).toMatchObject({ to: ["guardian"], urgent: true, link: "/app/guardian/away" });
  });

  it("once Sarah's back, the covering line goes and Sarah is first again", () => {
    const s = covering();
    imBack(s, GUARDIAN);
    expect(activeAway(s)).toBeUndefined();
    expect(escalationOrder(s)[0]).toBe(GUARDIAN);
  });

  it("Sarah can change the end date while James covers", () => {
    const s = covering();
    const a = activeAway(s)!;
    expect(setAway(s, GUARDIAN, { start: a.start, end: inDays(s, 2), backupId: FAMILY })).toBeTruthy();
    expect(activeAway(s)!.end).toBe(inDays(s, 2));
    expect(activeAway(s)!.status).toBe("accepted");
  });
});
