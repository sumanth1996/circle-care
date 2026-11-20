import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY } from "../data/demo";
import { evaluate, applySettings, logDose, pushAlert } from "../data/store";
import { clock, todayOf, alertsFor } from "../data/selectors";
import { snoozeReminder, reminderState, resolutionText, isUrgent, REMINDER_DEFAULT } from "../data/calmAlerts";
import { verifyChain } from "../data/audit";
import { hm, minutesOfDay, toMin, fmtTime } from "../lib/time";
import type { State } from "../data/types";

// Sprint 16 "Calm alerts & all-clear" (CC-206 – CC-208). Times are pinned so a test never crosses midnight by accident.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
/** The demo at noon, after one rules run, so the seed's own alerts are already there. */
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };

/** Makes one medicine due `minsLate` minutes ago with nothing logged today, and pauses the others. */
function dueAgo(s: State, medId: string, minsLate: number) {
  const time = hm(new Date(clock(s).getTime() - minsLate * 60000));
  for (const m of s.meds) m.paused = m.id !== medId;
  const med = s.meds.find((m) => m.id === medId)!;
  med.times = [time];
  s.doses = s.doses.filter((d) => !(d.medId === medId && d.date === todayOf(s)));
  return { med, time, key: `${medId}@${time}` };
}
const byKey = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const reminders = (s: State, key: string) => byKey(s, `dose-rem-${todayOf(s)}-${key}-`);
const NAMES = (s: State) => s.meds.flatMap((m) => [m.name, m.purpose]);

describe("all-clear when a missed dose is taken late (CC-206)", () => {
  it("tells each person who got the missed-dose alert, and marks that alert resolved", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 70);
    evaluate(s);
    const missed = [...byKey(s, `dose-cg-${todayOf(s)}-${key}`), ...byKey(s, `dose-g-${todayOf(s)}-${key}`)];
    expect(missed.map((a) => a.to[0]).sort()).toEqual(["caregiver", "guardian"]);

    logDose(s, ELDER, "med-metformin", time, "taken");
    const clear = byKey(s, `dose-clear-${todayOf(s)}-${key}`);
    expect(clear).toHaveLength(1);
    expect(clear[0].to.sort()).toEqual(["caregiver", "guardian"]);
    expect(clear[0].detail).toBe(`All clear: the ${fmtTime(time)} dose was taken at ${fmtTime(hm(clock(s)))}.`);
    expect(clock(s).getTime() - new Date(clear[0].at).getTime()).toBeLessThan(60000); // sent at once, well within a minute
    for (const a of missed) {
      expect(a.resolved).toMatchObject({ by: ELDER, outcome: "taken" });
      expect(resolutionText(s, a)).toMatch(/^Resolved: marked taken at .* by Maggie\.$/);
    }
  });

  it("sends only to the people who were alerted", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 40); // caregiver alerted at 30 minutes, Sarah not yet at 60
    evaluate(s);
    logDose(s, ELDER, "med-metformin", time, "taken");
    expect(byKey(s, `dose-clear-${todayOf(s)}-${key}`)[0].to).toEqual(["caregiver"]);
  });

  it("sends nothing when the dose is marked before any missed-dose alert", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 10);
    evaluate(s);
    expect(byKey(s, `dose-cg-${todayOf(s)}-${key}`)).toHaveLength(0);
    logDose(s, ELDER, "med-metformin", time, "taken");
    expect(byKey(s, "dose-clear-")).toHaveLength(0);
    expect(s.audit.some((e) => e.resource.startsWith("a missed-dose alert"))).toBe(false);
  });

  it("shows only a generic line on the lock screen and names no medicine", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-lisinopril", 70);
    evaluate(s);
    logDose(s, ELDER, "med-lisinopril", time, "taken");
    const clear = byKey(s, "dose-clear-")[0];
    expect(clear.title).toBe("Update from Circle Care");
    for (const word of NAMES(s)) expect(`${clear.title} ${clear.detail}`).not.toContain(word);
  });

  it("shows Skipped or Refused, who marked it and why, and sends no all-clear", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 70);
    evaluate(s);
    logDose(s, ELDER, "med-metformin", time, "refused", "It upsets my stomach");
    const g = byKey(s, `dose-g-${todayOf(s)}-${key}`)[0];
    expect(g.resolved).toMatchObject({ outcome: "refused", by: ELDER, reason: "It upsets my stomach" });
    expect(resolutionText(s, g)).toMatch(/^Refused: marked by Maggie at .*\. Reason: It upsets my stomach\.$/);
    expect(byKey(s, "dose-clear-")).toHaveLength(0);

    const t = noon();
    const skip = dueAgo(t, "med-metformin", 70);
    evaluate(t);
    logDose(t, GUARDIAN, "med-metformin", skip.time, "skipped");
    expect(resolutionText(t, byKey(t, `dose-cg-${todayOf(t)}-${skip.key}`)[0])).toMatch(/^Skipped: marked by Sarah at /);
    expect(byKey(t, "dose-clear-")).toHaveLength(0);
  });

  it("clears Maggie's reminder from her screen and stops further reminders", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 0);
    evaluate(s);
    expect(reminders(s, key)).toHaveLength(1);
    logDose(s, ELDER, "med-metformin", time, "taken");
    const r = reminders(s, key)[0];
    expect(r.read).toContain("elder");
    expect(r.resolved?.outcome).toBe("taken");
    later(s, 30);
    expect(reminders(s, key)).toHaveLength(1);
  });

  it("while sharing is paused, goes only to people who may still see doses", () => {
    const s = noon();
    const { time, key } = dueAgo(s, "med-metformin", 70);
    evaluate(s);
    applySettings(s, ELDER, { sharingPaused: true });
    logDose(s, ELDER, "med-metformin", time, "taken");
    const clear = byKey(s, `dose-clear-${todayOf(s)}-${key}`)[0];
    expect(clear.to).toEqual(["guardian"]);
    for (const word of NAMES(s)) expect(clear.detail).not.toContain(word);
  });

  it("records the resolution and who marked the dose in the audit history", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 70);
    evaluate(s);
    logDose(s, GUARDIAN, "med-metformin", time, "taken");
    expect(s.audit.some((e) => e.actorId === GUARDIAN && e.action === "updated" && e.resource === "a missed-dose alert (resolved: taken)")).toBe(true);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("changes nothing when someone without dose access marks it", () => {
    const s = noon();
    const { time } = dueAgo(s, "med-metformin", 70);
    evaluate(s);
    applySettings(s, ELDER, { sharingPaused: true });
    logDose(s, FAMILY, "med-metformin", time, "taken");
    expect(byKey(s, "dose-clear-")).toHaveLength(0);
    expect(byKey(s, "dose-g-").every((a) => !a.resolved)).toBe(true);
  });
});

describe("reminders repeat a few times, can be snoozed, then stop (CC-207)", () => {
  it("repeats every 10 minutes up to 3 reminders, each saying which one it is", () => {
    const s = noon();
    const { key } = dueAgo(s, "med-metformin", 0);
    evaluate(s);
    later(s, 10);
    later(s, 10);
    later(s, 60);
    const list = reminders(s, key).sort((a, b) => a.at.localeCompare(b.at));
    expect(list.map((a) => a.detail.split(".")[0])).toEqual(["Reminder 1 of 3", "Reminder 2 of 3", "Reminder 3 of 3"]);
    expect(list.every((a) => a.to.join() === "elder" && a.title === "You have a reminder from Circle Care")).toBe(true);
    expect(REMINDER_DEFAULT).toBe(3);
  });

  it("stops after the last reminder while missed-dose alerts keep their own timers", () => {
    const s = noon();
    const { key } = dueAgo(s, "med-metformin", 0);
    evaluate(s);
    later(s, 25);
    expect(reminders(s, key)).toHaveLength(3);
    expect(byKey(s, `dose-cg-${todayOf(s)}-${key}`)).toHaveLength(0);
    later(s, 5); // 30 minutes: Ana, as today
    expect(byKey(s, `dose-cg-${todayOf(s)}-${key}`)).toHaveLength(1);
    later(s, 30); // 60 minutes: Sarah, as today
    expect(byKey(s, `dose-g-${todayOf(s)}-${key}`)).toHaveLength(1);
    expect(reminders(s, key)).toHaveLength(3);
  });

  it("snooze brings the next reminder in 15 minutes and counts toward the limit", () => {
    const s = noon();
    const { med, time, key } = dueAgo(s, "med-metformin", 0);
    evaluate(s);
    expect(snoozeReminder(s, ELDER, med.id, time)).toBe(true);
    expect(reminderState(s, med.id, time)).toMatchObject({ sent: 1, limit: 3, snoozed: true });
    later(s, 10);
    expect(reminders(s, key)).toHaveLength(1);
    later(s, 5);
    expect(reminders(s, key)).toHaveLength(2);
    expect(snoozeReminder(s, ELDER, med.id, time)).toBe(true);
    later(s, 15);
    expect(reminders(s, key)).toHaveLength(3);
    expect(reminderState(s, med.id, time)?.canSnooze).toBe(false);
    expect(snoozeReminder(s, ELDER, med.id, time)).toBe(false);
    later(s, 60);
    expect(reminders(s, key)).toHaveLength(3);
    expect(s.audit.some((e) => e.actorId === ELDER && e.resource === "a dose reminder (snoozed 15 minutes)")).toBe(true);
  });

  it("uses Sarah's setting of 1 to 5 from the next dose", () => {
    const s = noon();
    for (const m of s.meds) m.paused = !["med-metformin", "med-vitd"].includes(m.id);
    const now = clock(s).getTime();
    const first = hm(new Date(now)), second = hm(new Date(now + 60 * 60000));
    s.meds.find((m) => m.id === "med-metformin")!.times = [first];
    s.meds.find((m) => m.id === "med-vitd")!.times = [second];
    s.doses = s.doses.filter((d) => d.date !== todayOf(s));
    evaluate(s);
    applySettings(s, GUARDIAN, { reminderRepeats: 5 });
    later(s, 60);
    expect(reminders(s, `med-metformin@${first}`)).toHaveLength(3);
    later(s, 40);
    expect(reminders(s, `med-vitd@${second}`)).toHaveLength(5);
    expect(reminders(s, `med-vitd@${second}`).some((a) => a.detail.startsWith("Reminder 5 of 5"))).toBe(true);
  });

  it("keeps the setting between 1 and 5, and only Sarah can change it", () => {
    const s = noon();
    applySettings(s, FAMILY, { reminderRepeats: 1 });
    expect(s.settings.reminderRepeats).toBe(3);
    applySettings(s, GUARDIAN, { reminderRepeats: 9 });
    const { key } = dueAgo(s, "med-metformin", 0);
    evaluate(s);
    later(s, 120);
    expect(reminders(s, key)).toHaveLength(5);

    const t = noon();
    applySettings(t, GUARDIAN, { reminderRepeats: 1 });
    const one = dueAgo(t, "med-metformin", 0);
    evaluate(t);
    later(t, 60);
    expect(reminders(t, one.key).map((a) => a.detail.split(".")[0])).toEqual(["Reminder 1 of 1"]);
  });

  it("escalates a high-priority medicine as fast as before", () => {
    const s = noon();
    const { key } = dueAgo(s, "med-lisinopril", 0);
    evaluate(s);
    later(s, 15);
    expect(byKey(s, `dose-cg-${todayOf(s)}-${key}`)[0]?.severity).toBe("critical");
    later(s, 15);
    expect(byKey(s, `dose-g-${todayOf(s)}-${key}`)).toHaveLength(1);
  });
});

describe("quiet hours hold non-urgent alerts for one morning summary (CC-208)", () => {
  /** 11 PM with quiet hours on from 10 PM to 7 AM, no medicines due and no waiting requests, so only the test's own alerts happen. */
  const night = () => {
    const s = noon();
    for (const m of s.meds) m.paused = true;
    s.approvals = s.approvals.filter((a) => a.status !== "pending");
    // Open Help board asks warn a day ahead if no one has picked them up, so on the night before a seeded
    // ask (a Friday for the Saturday one) that warning would be held too. Keep the night quiet on any day.
    s.help = (s.help ?? []).filter((r) => r.status !== "open");
    s.settings.quietHours = { on: true, start: "22:00", end: "07:00" };
    at(s, "23:00");
    evaluate(s);
    return s;
  };
  const note = { to: ["guardian", "caregiver"] as ("guardian" | "caregiver")[], severity: "warning" as const, title: "You have a reminder from Circle Care", detail: "Metformin: 5 days left. Request a refill from Fog City Pharmacy." };

  it("holds a non-urgent alert at 11 PM and sends one summary at 7 AM", () => {
    const s = night();
    pushAlert(s, { ...note, key: "test-supply" });
    const a = s.alerts.find((x) => x.key === "test-supply")!;
    expect(a.held).toEqual(["guardian"]);
    expect(alertsFor(s, "guardian").some((x) => x.id === a.id)).toBe(false);
    expect(alertsFor(s, "caregiver").some((x) => x.id === a.id)).toBe(true); // quiet hours are Sarah's

    later(s, 7 * 60 + 59); // 6:59 AM
    expect(byKey(s, "quiet-summary-")).toHaveLength(0);
    later(s, 1); // 7:00 AM
    const summary = byKey(s, "quiet-summary-");
    expect(summary).toHaveLength(1);
    expect(summary[0].to).toEqual(["guardian"]);
    expect(summary[0].items?.some((i) => i.endsWith(note.detail))).toBe(true);
    expect(a.held).toBeUndefined();
    expect(alertsFor(s, "guardian").some((x) => x.id === a.id)).toBe(true);
    later(s, 60);
    expect(byKey(s, "quiet-summary-")).toHaveLength(1);
  });

  it("delivers urgent alerts at once: SOS, high-priority medicines, readings and security notices", () => {
    const s = night();
    pushAlert(s, { key: "test-sos", to: ["guardian"], severity: "critical", title: "Emergency alert from Circle Care", detail: "Maggie pressed SOS." });
    pushAlert(s, { key: "test-sec", to: ["guardian"], severity: "warning", urgent: true, title: "Circle Care security notice", detail: "Unusual activity." });
    for (const k of ["test-sos", "test-sec"]) expect(s.alerts.find((x) => x.key === k)!.held).toBeUndefined();

    s.meds.find((m) => m.id === "med-lisinopril")!.paused = false;
    dueAgo(s, "med-lisinopril", 40);
    evaluate(s);
    const g = byKey(s, `dose-g-${todayOf(s)}-`)[0];
    expect(g.severity).toBe("critical");
    expect(g.held).toBeUndefined();
    expect(isUrgent({ severity: "warning", urgent: true })).toBe(true);
    expect(isUrgent({ severity: "warning" })).toBe(false);
  });

  it("sends no summary when nothing was held", () => {
    const s = night();
    later(s, 8 * 60);
    expect(byKey(s, "quiet-summary-")).toHaveLength(0);
  });

  it("delivers everything at once when quiet hours are off", () => {
    const s = night();
    s.settings.quietHours.on = false;
    pushAlert(s, { ...note, key: "test-off" });
    expect(s.alerts.find((x) => x.key === "test-off")!.held).toBeUndefined();
    expect(alertsFor(s, "guardian").some((x) => x.key === "test-off")).toBe(true);
  });

  it("shows only a generic line on the lock screen for the summary", () => {
    const s = night();
    pushAlert(s, { ...note, key: "test-lock" });
    later(s, 8 * 60);
    const summary = byKey(s, "quiet-summary-")[0];
    expect(summary.title).toBe("Update from Circle Care");
    for (const word of NAMES(s)) expect(summary.title + summary.detail).not.toContain(word);
  });

  it("releases what was held when Sarah turns quiet hours off", () => {
    const s = night();
    pushAlert(s, { ...note, key: "test-turn-off" });
    applySettings(s, GUARDIAN, { quietHours: { ...s.settings.quietHours, on: false } });
    evaluate(s);
    expect(byKey(s, "quiet-summary-")).toHaveLength(1);
    expect(s.alerts.find((x) => x.key === "test-turn-off")!.held).toBeUndefined();
  });
});
