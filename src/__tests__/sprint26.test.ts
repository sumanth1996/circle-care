import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate, logDose } from "../data/store";
import { clock, todayOf, dosesFor, nextUp, feed } from "../data/selectors";
import {
  UNDO_MIN, canCorrect, canUndo, correctDose, undoDose, undoable, stopMed, restartMed, stoppedMatch, stoppedLine,
  mergeFromOtherTab, sameAsIncoming, loadSaferDosesDemo, DEMO_LABEL,
} from "../data/saferDoses";
import { verifyChain } from "../data/audit";
import { hm, minutesOfDay, toMin } from "../lib/time";
import type { State } from "../data/types";

// Sprint 26 "Safer Doses" (CC-243, CC-244, CC-246, CC-248). Times are pinned to noon so nothing crosses midnight.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };

/** One medicine due `minsLate` minutes ago with nothing logged today; the others paused. */
function dueAgo(s: State, medId: string, minsLate: number) {
  const time = hm(new Date(clock(s).getTime() - minsLate * 60000));
  for (const m of s.meds) m.paused = m.id !== medId;
  const med = s.meds.find((m) => m.id === medId)!;
  med.times = [time];
  s.doses = s.doses.filter((d) => !(d.medId === medId && d.date === todayOf(s)));
  return { med, time, key: `${medId}@${time}` };
}
const slot = (s: State, medId: string, time: string) => s.doses.filter((d) => d.medId === medId && d.date === todayOf(s) && d.time === time);
const byKey = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));

describe("one record per dose (CC-243)", () => {
  it("keeps the first mark, refuses the second and says who got there first", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 5);
    expect(logDose(s, ELDER, "med-metformin", time, "taken")).toBe(true);
    const first = slot(s, "med-metformin", time)[0];
    later(s, 1);
    expect(logDose(s, FAMILY, "med-metformin", time, "skipped")).toBe(false);
    const rows = slot(s, "med-metformin", time);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.id, by: ELDER, status: "taken" });
    const dup = s.doseHistory.find((e) => e.kind === "duplicate")!;
    expect(dup).toMatchObject({ by: FAMILY, firstBy: ELDER, doseId: first.id, status: "skipped" });
    expect(s.audit.at(-1)).toMatchObject({ actorId: FAMILY, action: "denied" });
    expect(s.audit.at(-1)!.resource).toContain("already recorded by Maggie");
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("offers 'Correct this' only to Sarah and the person who recorded it", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 5);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const d = slot(s, "med-metformin", time)[0];
    expect(canCorrect(GUARDIAN, d)).toBe(true);
    expect(canCorrect(ELDER, d)).toBe(true);
    expect(canCorrect(FAMILY, d)).toBe(false);
    expect(canCorrect(CAREGIVER, d)).toBe(false);
    expect(correctDose(s, FAMILY, d.id, "refused", "Not true")).toBe(false);
    expect(slot(s, "med-metformin", time)[0].status).toBe("taken");
  });

  it("a correction keeps the first entry in history, is audited and tells the first person", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 5);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const d = slot(s, "med-metformin", time)[0];
    later(s, 20);
    expect(correctDose(s, GUARDIAN, d.id, "refused", "She was asleep")).toBe(true);
    const now = slot(s, "med-metformin", time)[0];
    expect(now).toMatchObject({ id: d.id, by: ELDER, at: d.at, status: "refused", reason: "She was asleep", correctedBy: GUARDIAN });
    const ev = s.doseHistory.find((e) => e.kind === "corrected")!;
    expect(ev).toMatchObject({ from: "taken", status: "refused", firstBy: ELDER, by: GUARDIAN, markedAt: d.at });
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "updated" });
    const told = byKey(s, `dose-fix-${d.id}`);
    expect(told).toHaveLength(1);
    expect(told[0].to).toEqual(["elder"]);
    expect(told[0].title).toBe("Update from Circle Care");
    expect(told[0].detail).not.toContain("Metformin");
  });

  it("doesn't tell anyone when the person who recorded it corrects it", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 5);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const d = slot(s, "med-metformin", time)[0];
    later(s, 30); // past the undo window
    expect(correctDose(s, ELDER, d.id, "skipped")).toBe(true);
    expect(byKey(s, "dose-fix-")).toHaveLength(0);
  });

  it("two tabs marking at once: the earliest mark wins on both, the other becomes a duplicate", () => {
    const base = noon();
    const { time } = dueAgo(base, "med-metformin", 5);
    const a = structuredClone(base); a.persona = "elder";
    const b = structuredClone(base); b.persona = "family";
    logDose(a, ELDER, "med-metformin", time, "taken");
    b.clockOffsetMin += 0.2; // 12 seconds later
    logDose(b, FAMILY, "med-metformin", time, "taken");
    const aSeesB = mergeFromOtherTab(a, b);
    const bSeesA = mergeFromOtherTab(b, a);
    for (const [m, persona] of [[aSeesB, "elder"], [bSeesA, "family"]] as const) {
      expect(m.persona).toBe(persona);
      const rows = slot(m, "med-metformin", time);
      expect(rows).toHaveLength(1);
      expect(rows[0].by).toBe(ELDER);
      const dup = m.doseHistory.filter((e) => e.kind === "duplicate");
      expect(dup).toHaveLength(1);
      expect(dup[0]).toMatchObject({ by: FAMILY, firstBy: ELDER });
    }
    expect(aSeesB.doses).toEqual(bSeesA.doses);
    expect(aSeesB.doseHistory).toEqual(bSeesA.doseHistory);
    // Taking in what's already there changes nothing to save back.
    expect(sameAsIncoming(mergeFromOtherTab(bSeesA, aSeesB), aSeesB)).toBe(true);
  });

  it("a tab doesn't bring back records the other tab reset away", () => {
    const old = noon();
    const { time } = dueAgo(old, "med-metformin", 5);
    logDose(old, ELDER, "med-metformin", time, "taken");
    later(old, 30);
    const fresh = seed();
    fresh.clockOffsetMin = old.clockOffsetMin;
    evaluate(fresh);
    const merged = mergeFromOtherTab(old, fresh);
    expect(merged.doses.map((d) => d.id).sort()).toEqual(fresh.doses.map((d) => d.id).sort());
  });
});

describe("undo a dose marked by mistake (CC-244)", () => {
  it("removes the mark, shows 'undone' in history and restarts the escalation", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 40); // caregiver alerted at 30
    evaluate(s);
    const cg = byKey(s, `dose-cg-${todayOf(s)}-${key}`)[0];
    expect(cg).toBeDefined();
    logDose(s, ELDER, "med-metformin", time, "taken");
    expect(cg.resolved).toBeDefined();
    const d = slot(s, "med-metformin", time)[0];
    later(s, 3);
    expect(canUndo(s, ELDER, d)).toBe(true);
    expect(undoable(s, ELDER)?.id).toBe(d.id);
    expect(undoDose(s, ELDER, d.id)).toBe(true);
    expect(slot(s, "med-metformin", time)).toHaveLength(0);
    expect(s.doseHistory.at(-1)).toMatchObject({ kind: "undone", by: ELDER, status: "taken", doseId: d.id, markedAt: d.at });
    expect(byKey(s, `dose-cg-${todayOf(s)}-${key}`)[0].resolved).toBeUndefined();
    // The dose is open again and its escalation carries on: Sarah is alerted at 60 minutes.
    expect(dosesFor(s).find((x) => x.key === key)?.log).toBeUndefined();
    later(s, 20);
    expect(byKey(s, `dose-g-${todayOf(s)}-${key}`)).toHaveLength(1);
    // Marked again later: it records and settles normally.
    expect(logDose(s, ELDER, "med-metformin", time, "taken")).toBe(true);
    expect(byKey(s, `dose-g-${todayOf(s)}-${key}`)[0].resolved).toBeDefined();
  });

  it("only the person who marked it, and only for 10 minutes; after that only 'Correct this'", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 5);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const d = slot(s, "med-metformin", time)[0];
    expect(canUndo(s, FAMILY, d)).toBe(false);
    expect(undoDose(s, FAMILY, d.id)).toBe(false);
    later(s, UNDO_MIN);
    expect(canUndo(s, ELDER, d)).toBe(false);
    expect(undoable(s, ELDER)).toBeUndefined();
    expect(undoDose(s, ELDER, d.id)).toBe(false);
    expect(slot(s, "med-metformin", time)).toHaveLength(1);
    expect(canCorrect(ELDER, d)).toBe(true);
  });

  it("after an all-clear, the same people get one short note with no medicine name", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 70); // caregiver and Sarah alerted
    evaluate(s);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const clear = byKey(s, `dose-clear-${todayOf(s)}-${key}`)[0];
    expect(clear.to.sort()).toEqual(["caregiver", "guardian"]);
    const d = slot(s, "med-metformin", time)[0];
    later(s, 2);
    undoDose(s, ELDER, d.id);
    const note = byKey(s, `dose-undo-${todayOf(s)}-${key}`);
    expect(note).toHaveLength(1);
    expect(note[0].to.sort()).toEqual(["caregiver", "guardian"]);
    expect(note[0].title).toBe("Update from Circle Care");
    for (const n of [note[0].title, note[0].detail]) { expect(n).not.toContain("Metformin"); expect(n).not.toContain("Diabetes"); }
    // A new mark sends a fresh all-clear.
    logDose(s, ELDER, "med-metformin", time, "taken");
    expect(byKey(s, `dose-clear-${todayOf(s)}-${key}`).filter((a) => !a.key!.includes("-undone-"))).toHaveLength(1);
  });

  it("puts the slot back in Maggie's 'next up'", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 5);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const d = slot(s, "med-metformin", time)[0];
    undoDose(s, ELDER, d.id);
    const n = nextUp(s);
    expect(n.kind === "dose" && n.slot.key).toBe(key);
  });
});

describe("stopped medicines on their own list (CC-246)", () => {
  it("moves to Stopped with the date and who, with no reminders or escalation", () => {
    const s = noon();
    const { key } = dueAgo(s, "med-metformin", 40);
    for (const m of s.meds) m.paused = false;
    expect(stopMed(s, GUARDIAN, "med-metformin", "Doctor stopped it")).toBe(true);
    const m = s.meds.find((x) => x.id === "med-metformin")!;
    expect(m.stopped).toMatchObject({ by: GUARDIAN, reason: "Doctor stopped it" });
    expect(m.paused).toBe(true);
    expect(stoppedLine(s, m)).toMatch(/^Stopped on [A-Z][a-z]{2} \d{1,2} by Sarah$/);
    expect(s.reminders.some((r) => r.key.startsWith("med-metformin@"))).toBe(false);
    later(s, 60);
    expect(dosesFor(s).some((d) => d.key === key)).toBe(false);
    expect(byKey(s, `dose-g-${todayOf(s)}-${key}`)).toHaveLength(0);
    // Not on Maggie's home screen.
    const n = nextUp(s);
    expect(n.kind === "dose" && n.slot.med.id).not.toBe("med-metformin");
  });

  it("a new medicine with a stopped one's name is caught, ignoring case", () => {
    const s = noon();
    stopMed(s, GUARDIAN, "med-metformin");
    expect(stoppedMatch(s, "  metFORMIN ")?.id).toBe("med-metformin");
    expect(stoppedMatch(s, "Lisinopril")).toBeUndefined();
  });

  it("restarting goes through the normal approval and puts reminders back", () => {
    const s = noon();
    stopMed(s, GUARDIAN, "med-metformin");
    expect(restartMed(s, FAMILY, "med-metformin")).toBe(false); // James can't change medicines
    expect(restartMed(s, GUARDIAN, "med-metformin")).toBe(true);
    const m = s.meds.find((x) => x.id === "med-metformin")!;
    expect(m.stopped).toBeUndefined();
    expect(m.paused).toBe(false);
    expect(m.history.at(-1)!.change).toBe("Restarted");
    expect(s.approvals.at(-1)).toMatchObject({ title: "Restarted Metformin", status: "approved", requestedBy: GUARDIAN });
    expect(dosesFor(s).some((d) => d.med.id === "med-metformin")).toBe(true);
  });
});

describe("Safer Doses demo scenario (CC-248)", () => {
  it("loads a stopped medicine, a blocked duplicate and an undo, every record marked demo", () => {
    const s = noon();
    loadSaferDosesDemo(s);
    expect(s.demoScenario).toBe("safer-doses");
    const stopped = s.meds.filter((m) => m.stopped);
    expect(stopped).toHaveLength(1);
    expect(stopped[0].stopped?.demo).toBe(true);
    expect(s.doseHistory.map((e) => e.kind).sort()).toEqual(["duplicate", "undone"]);
    expect(s.doseHistory.every((e) => e.demo)).toBe(true);
    const history = feed(s).map((f) => f.text);
    expect(history.some((t) => t.includes("tried to mark it again") && t.includes(DEMO_LABEL))).toBe(true);
    expect(history.some((t) => t.includes("undid") && t.includes(DEMO_LABEL))).toBe(true);
    expect(history.some((t) => t.includes("stopped") && t.includes(DEMO_LABEL))).toBe(true);
  });

  it("loads the same story twice without doubling it", () => {
    const s = noon();
    loadSaferDosesDemo(s);
    loadSaferDosesDemo(s);
    expect(s.meds.filter((m) => m.stopped)).toHaveLength(1);
    expect(s.doseHistory).toHaveLength(2);
  });
});
