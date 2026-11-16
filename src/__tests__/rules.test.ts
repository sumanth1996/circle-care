import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, FAMILY, ELDER } from "../data/demo";
import { evaluate, audit, logDose } from "../data/store";
import { todayOf, clock, yesterdayOf } from "../data/selectors";
import { snoozeReminder } from "../data/calmAlerts";
import { hm, minutesOfDay, toMin, fmtTime } from "../lib/time";
import { verifyChain } from "../data/audit";
import type { State } from "../data/types";

const minsAgo = (s: ReturnType<typeof seed>, m: number) => hm(new Date(clock(s).getTime() - m * 60000));
/** The demo at noon today, so "70 minutes ago" never crosses midnight whenever the tests run. */
const seedAtNoon = () => { const s = seed(); s.clockOffsetMin += 12 * 60 - minutesOfDay(clock(s)); return s; };

/** Moves the demo clock to `time` on the demo's current day. */
const setTime = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
const byKey = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const has = (s: State, key: string) => s.alerts.some((a) => a.key === key);
/** Dose and check-in alerts only, so other time-based rules (health readings, recap) never blur a count. */
const ours = (s: State) => s.alerts.filter((a) => /^(dose|checkin)-/.test(a.key ?? ""));

/**
 * CC-199: the demo late in the evening with one medicine due at `time` (nothing logged for it), the others paused
 * and quiet hours off, after one rules run at the dose time. `day` is the day the dose is due.
 */
function lateDose(medId = "med-metformin", time = "23:30", prepare: (s: State) => void = () => {}) {
  const s = seed();
  s.settings.quietHours.on = false;
  for (const m of s.meds) m.paused = m.id !== medId;
  const med = s.meds.find((m) => m.id === medId)!;
  med.times = [time];
  s.doses = s.doses.filter((d) => d.medId !== medId);
  prepare(s);
  setTime(s, time);
  evaluate(s);
  return { s, med, time, day: todayOf(s), key: `${medId}@${time}` };
}

/** CC-199: no check-ins on record, and a check-in window from `start` to `end`, with the clock at `now`. */
function lateWindow(start: string, end: string, now: string) {
  const s = seed();
  s.settings.quietHours.on = false;
  s.checkins = [];
  s.settings.checkinWindow = { start, end };
  setTime(s, now);
  evaluate(s);
  return { s, day: todayOf(s) };
}

describe("rules engine", () => {
  it("escalates a missed dose to the caregiver, then the guardian", () => {
    const s = seedAtNoon();
    const med = s.meds.find((m) => m.id === "med-lisinopril")!;
    med.times = [minsAgo(s, 70)];
    s.doses = s.doses.filter((d) => !(d.medId === med.id && d.date === todayOf(s)));
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-rem") && a.to.includes("elder"))).toBe(true);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-cg") && a.to.includes("caregiver"))).toBe(true);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-g") && a.to.includes("guardian"))).toBe(true);
  });

  it("does not repeat the same alert", () => {
    const s = seedAtNoon();
    const med = s.meds.find((m) => m.id === "med-lisinopril")!;
    med.times = [minsAgo(s, 70)];
    s.doses = s.doses.filter((d) => !(d.medId === med.id && d.date === todayOf(s)));
    evaluate(s); const n = s.alerts.length; evaluate(s);
    expect(s.alerts.length).toBe(n);
  });

  it("missed check-in prompts the elder first, then the guardian 15 minutes later (CC-52)", () => {
    const s = seedAtNoon();
    s.checkins = s.checkins.filter((c) => c.date !== todayOf(s));
    s.settings.checkinWindow = { start: minsAgo(s, 120), end: minsAgo(s, 5) };
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `checkin-elder-${todayOf(s)}`)).toBe(true);
    expect(s.alerts.some((a) => a.key === `checkin-${todayOf(s)}`)).toBe(false);
    s.settings.checkinWindow = { start: minsAgo(s, 120), end: minsAgo(s, 20) };
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `checkin-${todayOf(s)}`)).toBe(true);
  });

  it("flags bulk record viewing as suspicious (CC-35)", () => {
    const s = seed();
    for (let i = 0; i < 9; i++) audit(s, FAMILY, "viewed", `record ${i}`);
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`sec-bulk-${FAMILY}`) && a.to.includes("guardian"))).toBe(true);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("flags repeated denials (CC-35)", () => {
    const s = seed();
    for (let i = 0; i < 3; i++) audit(s, FAMILY, "denied", "read audit");
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`sec-deny-${FAMILY}`))).toBe(true);
  });

  it("reminds the guardian about requests older than a day (CC-64)", () => {
    const s = seed();
    const p = s.approvals.find((a) => a.status === "pending")!;
    p.at = new Date(clock(s).getTime() - 26 * 3600000).toISOString();
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `approval-remind-${p.id}` && a.to.includes("guardian"))).toBe(true);
  });

  it("ends time-limited access automatically (CC-25)", () => {
    const s = seed();
    const m = s.members.find((x) => x.id !== GUARDIAN && x.role !== "elder")!;
    m.expiresOn = "2000-01-01";
    m.status = "active";
    evaluate(s);
    expect(m.status).toBe("revoked");
  });
});

describe("doses and check-ins that cross midnight (CC-199)", () => {
  it("escalates a dose due just before midnight that is still missed after midnight", () => {
    const { s, day, key } = lateDose("med-metformin", "23:30");
    later(s, 70); // 00:40 the next day
    expect(todayOf(s)).not.toBe(day);
    const cg = byKey(s, `dose-cg-${day}-${key}`);
    const g = byKey(s, `dose-g-${day}-${key}`);
    expect(cg).toHaveLength(1);
    expect(cg[0].to).toEqual(["caregiver"]);
    expect(cg[0].severity).toBe("warning");
    expect(g).toHaveLength(1);
    expect(g[0].to).toEqual(["guardian"]);
    expect(g[0].detail).toBe("Metformin (23:30) is 70 minutes overdue and still unconfirmed.");
    // The slot stays under the day it was due; tonight's 23:30 dose is still to come.
    expect(byKey(s, `dose-cg-${todayOf(s)}-`)).toHaveLength(0);
  });

  it("keeps the daytime timings: the caregiver at 30 minutes, the guardian at 60, twice as fast when high-priority", () => {
    const { s, day, key } = lateDose("med-metformin", "23:30");
    later(s, 29); // 23:59
    expect(has(s, `dose-cg-${day}-${key}`)).toBe(false);
    later(s, 1); // 00:00
    expect(has(s, `dose-cg-${day}-${key}`)).toBe(true);
    later(s, 29); // 00:29
    expect(has(s, `dose-g-${day}-${key}`)).toBe(false);
    later(s, 1); // 00:30
    expect(has(s, `dose-g-${day}-${key}`)).toBe(true);

    const hp = lateDose("med-lisinopril", "23:50");
    later(hp.s, 15); // 00:05
    expect(byKey(hp.s, `dose-cg-${hp.day}-${hp.key}`)[0]?.severity).toBe("critical");
    expect(has(hp.s, `dose-g-${hp.day}-${hp.key}`)).toBe(false);
    later(hp.s, 15); // 00:20
    expect(byKey(hp.s, `dose-g-${hp.day}-${hp.key}`)[0]?.severity).toBe("critical");
  });

  it("escalates a check-in window that ends after midnight", () => {
    const { s, day } = lateWindow("22:00", "00:30", "23:00");
    // While the window is open nothing is sent, as in the daytime.
    expect(has(s, `checkin-elder-${day}`)).toBe(false);
    later(s, 90); // 00:30, the window's last minute
    expect(has(s, `checkin-elder-${day}`)).toBe(false);
    later(s, 1); // 00:31: one more prompt to Maggie
    expect(s.alerts.find((a) => a.key === `checkin-elder-${day}`)?.to).toEqual(["elder"]);
    expect(has(s, `checkin-${day}`)).toBe(false);
    later(s, 15); // 00:46: Sarah
    const g = s.alerts.find((a) => a.key === `checkin-${day}`);
    expect(g?.to).toEqual(["guardian"]);
    expect(g?.detail).toBe("Maggie hasn't checked in last night (window 22:00–00:30). Consider calling her.");
    // Nothing is raised under the new day: tonight's window has not opened yet.
    expect(has(s, `checkin-elder-${todayOf(s)}`) || has(s, `checkin-${todayOf(s)}`)).toBe(false);
  });

  it("prompts Sarah after midnight when the window ends just before it", () => {
    const { s, day } = lateWindow("22:00", "23:50", "23:50");
    later(s, 1); // 23:51
    expect(has(s, `checkin-elder-${day}`)).toBe(true);
    later(s, 14); // 00:05
    expect(has(s, `checkin-${day}`)).toBe(false);
    later(s, 1); // 00:06
    expect(has(s, `checkin-${day}`)).toBe(true);
  });

  it("sends nothing when Maggie checked in before midnight", () => {
    const { s, day } = lateWindow("22:00", "00:30", "22:30");
    s.checkins.push({ date: day, at: clock(s).toISOString() });
    for (let i = 0; i < 12; i++) later(s, 15); // until 01:30
    expect(byKey(s, `checkin-elder-${day}`)).toHaveLength(0);
    expect(byKey(s, `checkin-${day}`)).toHaveLength(0);
  });

  it("raises no alert twice when the rules run again and again across midnight", () => {
    const { s, day, key } = lateDose("med-metformin", "23:30");
    s.checkins = [];
    s.settings.checkinWindow = { start: "22:00", end: "00:30" };
    // The window that opened the night before (and ended at 00:30 today) was missed and is followed up at once.
    evaluate(s);
    const keys = () => s.alerts.map((a) => a.key).filter(Boolean);
    for (let i = 0; i < 180; i++) { later(s, 1); evaluate(s); } // every minute until 02:30, twice a minute
    expect(new Set(keys()).size).toBe(keys().length);
    expect(byKey(s, `dose-rem-${day}-${key}-`)).toHaveLength(3);
    expect(byKey(s, `dose-cg-${day}-${key}`)).toHaveLength(1);
    expect(byKey(s, `dose-g-${day}-${key}`)).toHaveLength(1);
    expect(byKey(s, `checkin-elder-${day}`)).toHaveLength(1);
    expect(byKey(s, `checkin-${day}`)).toHaveLength(1);
    const n = ours(s).length;
    later(s, 60);
    evaluate(s);
    expect(ours(s).length).toBe(n);
  });

  it("raises nothing for a dose or check-in missed two nights ago", () => {
    const { s, day, key } = lateDose("med-metformin", "23:30");
    s.checkins = [];
    s.settings.checkinWindow = { start: "22:00", end: "00:30" };
    const fromDay = () => ours(s).filter((a) => a.key!.includes(day)).map((a) => a.key);
    const before = fromDay();
    expect(before).toContain(`dose-rem-${day}-${key}-1`); // the reminder at 23:30
    later(s, 24 * 60 + 70); // the first run since then: 00:40 two days later
    expect(fromDay()).toEqual(before);
    expect(byKey(s, `dose-cg-${day}-`)).toHaveLength(0);
    expect((s.reminders ?? []).some((r) => r.date === day)).toBe(false);
    // Only last night's dose and window, which are yesterday's, are followed up.
    const last = yesterdayOf(s);
    expect(last).not.toBe(day);
    expect(has(s, `dose-g-${last}-${key}`)).toBe(true);
    expect(has(s, `checkin-elder-${last}`)).toBe(true);
  });

  it("leaves alone what finished escalating before midnight, and what was already resolved", () => {
    const s = seed();
    s.settings.quietHours.on = false;
    for (const m of s.meds) m.paused = !["med-metformin", "med-vitd"].includes(m.id);
    s.meds.find((m) => m.id === "med-metformin")!.times = ["21:00"];
    s.meds.find((m) => m.id === "med-vitd")!.times = ["23:00"];
    s.doses = s.doses.filter((d) => !["med-metformin", "med-vitd"].includes(d.medId));
    setTime(s, "21:00");
    evaluate(s);
    for (let i = 0; i < 9; i++) later(s, 5); // 21:45
    later(s, 120); // 23:45: the 21:00 dose is fully escalated, the 23:00 dose has reached the caregiver
    const day = todayOf(s);
    logDose(s, ELDER, "med-vitd", "23:00", "taken");
    expect(has(s, `dose-g-${day}-med-metformin@21:00`)).toBe(true);
    expect(has(s, `dose-clear-${day}-med-vitd@23:00`)).toBe(true);
    const snapshot = JSON.stringify(byKey(s, "dose-"));
    for (let i = 0; i < 12; i++) later(s, 15); // until 02:45
    expect(JSON.stringify(byKey(s, "dose-"))).toBe(snapshot);
  });

  it("resolves as usual when a dose due before midnight is taken after it", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:30");
    later(s, 70); // 00:40: Ana and Sarah have been alerted
    logDose(s, ELDER, med.id, time, "taken", undefined, day);
    expect(s.doses.filter((d) => d.medId === med.id).map((d) => d.date)).toEqual([day]);
    const missed = [...byKey(s, `dose-cg-${day}-${key}`), ...byKey(s, `dose-g-${day}-${key}`)];
    expect(missed).toHaveLength(2);
    for (const a of missed) expect(a.resolved).toMatchObject({ by: ELDER, outcome: "taken" });
    const clear = byKey(s, `dose-clear-${day}-${key}`);
    expect(clear).toHaveLength(1);
    expect([...clear[0].to].sort()).toEqual(["caregiver", "guardian"]);
    expect(clear[0].detail).toBe(`All clear: the ${fmtTime(time)} dose was taken at ${fmtTime(hm(clock(s)))}.`);
    for (const r of byKey(s, `dose-rem-${day}-${key}-`)) expect(r.read).toContain("elder");
    const n = ours(s).length;
    later(s, 60);
    expect(ours(s).length).toBe(n);
  });

  it("carries reminders and snooze past midnight", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:45");
    later(s, 10); // 23:55: reminder 2
    expect(snoozeReminder(s, ELDER, med.id, time)).toBe(true); // next at 00:10
    later(s, 10); // 00:05
    expect(byKey(s, `dose-rem-${day}-${key}-`)).toHaveLength(2);
    later(s, 5); // 00:10
    const third = s.alerts.find((a) => a.key === `dose-rem-${day}-${key}-3`);
    expect(third?.detail.startsWith("Reminder 3 of 3")).toBe(true);
    later(s, 60);
    expect(byKey(s, `dose-rem-${day}-${key}-`)).toHaveLength(3);

    // A high-priority dose finishes escalating before midnight, but Sarah's fifth reminder still comes at 00:00.
    const hp = lateDose("med-lisinopril", "23:20", (x) => { x.settings.reminderRepeats = 5; });
    for (let i = 0; i < 4; i++) later(hp.s, 10); // 00:00
    expect(byKey(hp.s, `dose-rem-${hp.day}-${hp.key}-`).map((a) => a.detail.split(".")[0])).toEqual(
      ["Reminder 1 of 5", "Reminder 2 of 5", "Reminder 3 of 5", "Reminder 4 of 5", "Reminder 5 of 5"]);
  });

  it("keeps quiet hours across midnight: Sarah's alert waits for the morning summary unless it is high-priority", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:30");
    s.settings.quietHours = { on: true, start: "22:00", end: "07:00" };
    later(s, 70); // 00:40
    expect(byKey(s, `dose-g-${day}-${key}`)[0].held).toEqual(["guardian"]);
    expect(byKey(s, `dose-cg-${day}-${key}`)[0].held).toBeUndefined(); // quiet hours are Sarah's
    logDose(s, ELDER, med.id, time, "taken", undefined, day);
    const clear = byKey(s, `dose-clear-${day}-${key}`)[0];
    expect(clear.held).toEqual(["guardian"]);
    later(s, 6 * 60 + 19); // 06:59
    expect(byKey(s, "quiet-summary-")).toHaveLength(0);
    later(s, 1); // 07:00
    const summary = byKey(s, "quiet-summary-");
    expect(summary).toHaveLength(1);
    for (const a of [byKey(s, `dose-g-${day}-${key}`)[0], clear]) expect(summary[0].items?.some((i) => i.endsWith(a.detail))).toBe(true);

    const hp = lateDose("med-lisinopril", "23:50");
    hp.s.settings.quietHours = { on: true, start: "22:00", end: "07:00" };
    later(hp.s, 30); // 00:20
    expect(byKey(hp.s, `dose-g-${hp.day}-${hp.key}`)[0].held).toBeUndefined();
  });
});
