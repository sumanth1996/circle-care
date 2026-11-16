import { describe, it, expect } from "vitest";
import { seed, ELDER, GUARDIAN } from "../data/demo";
import { evaluate, logDose } from "../data/store";
import { todayOf, clock, yesterdayOf, dosesFor, lastNightDoses, nextUp, checkinMissed, checkinMissedLastNight, checkinButtonShows } from "../data/selectors";
import { snoozeReminder, reminderState } from "../data/calmAlerts";
import { recap } from "../data/everyday";
import { addDays, at, greeting, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Screens after midnight: last night's late doses and check-in windows that end after midnight (follow-up to CC-199).

const setTime = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
const byKey = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const has = (s: State, key: string) => s.alerts.some((a) => a.key === key);

/** The demo with one medicine due at `time` (nothing logged for it), the others paused and quiet hours off, after one rules run at the dose time. */
function lateDose(medId = "med-metformin", time = "23:30") {
  const s = seed();
  s.settings.quietHours.on = false;
  for (const m of s.meds) m.paused = m.id !== medId;
  const med = s.meds.find((m) => m.id === medId)!;
  med.times = [time];
  s.doses = s.doses.filter((d) => d.medId !== medId);
  setTime(s, time);
  evaluate(s);
  return { s, med, time, day: todayOf(s), key: `${medId}@${time}` };
}

/** A check-in window from `start` to `end`, with the clock at `now`. Maggie checked in for last night's window only. */
function lateWindow(start: string, end: string, now: string) {
  const s = seed();
  s.settings.quietHours.on = false;
  s.settings.checkinWindow = { start, end };
  setTime(s, now);
  const last = yesterdayOf(s);
  s.checkins = [{ date: last, at: at(last, start).toISOString() }];
  evaluate(s);
  return { s, day: todayOf(s) };
}

describe("last night's doses after midnight", () => {
  it("lists a 23:30 dose at 00:20 as last night's, and marking it settles its alerts", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:30");
    later(s, 50); // 00:20: Ana has been alerted, Sarah not yet
    expect(todayOf(s)).not.toBe(day);
    expect(has(s, `dose-cg-${day}-${key}`)).toBe(true);
    const open = lastNightDoses(s);
    expect(open.map((d) => [d.date, d.key, d.state])).toEqual([[day, key, "late"]]);
    // Today's list alone would not show it.
    expect(dosesFor(s).some((d) => d.med.id === med.id && d.state !== "upcoming")).toBe(false);
    // Maggie's "What's next" shows it first, with the day it was due.
    const n = nextUp(s);
    expect(n.kind === "dose" ? [n.slot.date, n.slot.time] : n.kind).toEqual([day, time]);

    // Marked with the day it was due, as the screens do: the alert settles and Ana gets the all-clear.
    expect(logDose(s, ELDER, med.id, time, "taken", undefined, open[0].date)).toBe(true);
    expect(s.doses.find((d) => d.medId === med.id)?.date).toBe(day);
    expect(byKey(s, `dose-cg-${day}-${key}`)[0].resolved).toMatchObject({ by: ELDER, outcome: "taken" });
    expect(byKey(s, `dose-clear-${day}-${key}`)[0]?.to).toEqual(["caregiver"]);
    expect(lastNightDoses(s)).toHaveLength(0);
    const after = nextUp(s);
    expect(after.kind === "dose" && after.slot.date === day).toBe(false);
    later(s, 60); // 01:20: nothing goes to Sarah
    expect(has(s, `dose-g-${day}-${key}`)).toBe(false);
  });

  it("settles last night's dose marked not given, with no all-clear", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:30");
    later(s, 70); // 00:40
    expect(lastNightDoses(s)[0]?.state).toBe("escalated");
    expect(logDose(s, GUARDIAN, med.id, time, "refused", "Asleep", day)).toBe(true);
    expect(byKey(s, `dose-g-${day}-${key}`)[0].resolved).toMatchObject({ outcome: "refused", reason: "Asleep" });
    expect(has(s, `dose-clear-${day}-${key}`)).toBe(false);
    expect(lastNightDoses(s)).toHaveLength(0);
  });

  it("does not list a dose that finished escalating before midnight", () => {
    const { s } = lateDose("med-metformin", "21:00");
    later(s, 65); // 22:05, both alerts out
    later(s, 135); // 00:20
    expect(lastNightDoses(s)).toHaveLength(0);
    const n = nextUp(s);
    expect(n.kind === "dose" && n.slot.date !== todayOf(s)).toBe(false);
  });

  it("carries on a dose's alerts the app slept through before midnight, and lists it until it's marked", () => {
    const { s, med, day, key } = lateDose("med-metformin", "21:00");
    later(s, 10); // 21:10: due, nothing sent yet. Then the laptop closes until 00:20.
    later(s, 190);
    expect(has(s, `dose-cg-${day}-${key}`)).toBe(true);
    expect(has(s, `dose-g-${day}-${key}`)).toBe(true);
    expect(lastNightDoses(s).map((d) => d.key)).toEqual([key]);
    later(s, 5); // still listed after the next run, though the last run was today
    expect(lastNightDoses(s).map((d) => d.key)).toEqual([key]);
    expect(logDose(s, ELDER, med.id, "21:00", "taken", undefined, day)).toBe(true);
    evaluate(s);
    expect(lastNightDoses(s)).toHaveLength(0);
  });

  it("carries on when the caregiver was told before midnight and Sarah's step was slept through", () => {
    const { s, day, key } = lateDose("med-metformin", "21:00");
    later(s, 35); // 21:35, caregiver told
    expect(has(s, `dose-cg-${day}-${key}`)).toBe(true);
    later(s, 165); // 00:20
    expect(byKey(s, `dose-g-${day}-${key}`)).toHaveLength(1);
  });

  it("looks back at nothing on a first run with no record of a last run, or after a day away", () => {
    const first = lateDose("med-metformin", "21:00").s;
    first.alerts = []; delete first.lastRunAt;
    later(first, 200);
    expect(lastNightDoses(first)).toHaveLength(0);
    const away = lateDose("med-metformin", "21:00").s;
    away.alerts = []; away.lastRunAt = addDays(clock(away), -2).toISOString();
    later(away, 200);
    expect(lastNightDoses(away)).toHaveLength(0);
  });

  it("records a dose only for today or yesterday", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:30");
    later(s, 70); // 00:40
    const count = s.doses.length;
    const audits = s.audit.length;
    for (const date of [ymd(addDays(clock(s), -2)), ymd(addDays(clock(s), 1)), "not a date"]) {
      expect(logDose(s, ELDER, med.id, time, "taken", undefined, date)).toBe(false);
    }
    expect(s.doses.length).toBe(count);
    expect(s.audit.length).toBe(audits);
    expect(byKey(s, `dose-g-${day}-${key}`)[0].resolved).toBeUndefined();
    expect(byKey(s, "dose-clear-")).toHaveLength(0);
    expect(logDose(s, ELDER, med.id, time, "taken", undefined, yesterdayOf(s))).toBe(true);
    expect(byKey(s, `dose-g-${day}-${key}`)[0].resolved).toMatchObject({ outcome: "taken" });
    expect(logDose(s, ELDER, med.id, time, "taken")).toBe(true); // today, by default
  });

  it("snoozes last night's reminder after midnight when given its date", () => {
    const { s, med, time, day, key } = lateDose("med-metformin", "23:45");
    later(s, 10); // 23:55: reminder 2
    later(s, 5); // 00:00
    expect(reminderState(s, med.id, time)).toBeUndefined(); // nothing due today
    expect(reminderState(s, med.id, time, day)).toMatchObject({ sent: 2, limit: 3, canSnooze: true, snoozed: false });
    expect(snoozeReminder(s, ELDER, med.id, time)).toBe(false);
    expect(snoozeReminder(s, ELDER, med.id, time, day)).toBe(true); // next at 00:15
    expect(reminderState(s, med.id, time, day)?.snoozed).toBe(true);
    later(s, 5); // 00:05, when it would have come
    expect(byKey(s, `dose-rem-${day}-${key}-`)).toHaveLength(2);
    later(s, 10); // 00:15
    expect(byKey(s, `dose-rem-${day}-${key}-`)).toHaveLength(3);
  });
});

describe("check-ins after midnight", () => {
  it("greets Maggie with a neutral hello after midnight, not good morning", () => {
    expect(greeting(new Date(2026, 0, 5, 0, 31))).toBe("Hello");
    expect(greeting(new Date(2026, 0, 5, 4, 59))).toBe("Hello");
    expect(greeting(new Date(2026, 0, 5, 5, 0))).toBe("Good morning");
    const { s, day } = lateWindow("22:00", "00:30", "23:00");
    later(s, 91); // 00:31
    expect(s.alerts.find((a) => a.key === `checkin-elder-${day}`)?.detail).toBe("Hello, Maggie. Tap “I'm OK” so Sarah knows you're fine.");
  });

  it("keeps Maggie's I'm OK button until a window that ends after midnight has ended", () => {
    const { s, day } = lateWindow("22:00", "00:30", "20:59");
    expect(checkinButtonShows(s)).toBe(false);
    // A check-in earlier in the day doesn't cover tonight's window, as for the follow-ups.
    s.checkins.push({ date: day, at: at(day, "09:00").toISOString() });
    later(s, 1); // 21:00, an hour before the start
    expect(checkinButtonShows(s)).toBe(true);
    later(s, 120); // 23:00
    expect(checkinButtonShows(s)).toBe(true);
    expect(checkinMissed(s)).toBe(false); // the window is still open
    later(s, 70); // 00:10
    expect(checkinButtonShows(s)).toBe(true);
    expect(checkinMissed(s) || checkinMissedLastNight(s)).toBe(false);
    later(s, 21); // 00:31: missed, and the button stays so her answer to the prompt is one tap
    expect(checkinMissedLastNight(s)).toBe(true);
    expect(checkinMissed(s)).toBe(false); // tonight's window hasn't opened
    expect(checkinButtonShows(s)).toBe(true);
    s.checkins.push({ date: todayOf(s), at: clock(s).toISOString() });
    expect(checkinMissedLastNight(s)).toBe(false);
    expect(checkinButtonShows(s)).toBe(false);
  });

  it("carries on a missed check-in the app slept through before Sarah's prompt", () => {
    const { s, day } = lateWindow("20:00", "22:00", "22:05"); // Maggie's prompt goes out, then the tab sleeps
    expect(has(s, `checkin-elder-${day}`)).toBe(true);
    expect(has(s, `checkin-${day}`)).toBe(false);
    later(s, 135); // 00:20
    expect(has(s, `checkin-${day}`)).toBe(true);
    expect(s.alerts.find((a) => a.key === `checkin-${day}`)!.detail).toContain("last night");
    expect(checkinMissedLastNight(s)).toBe(true);
    later(s, 5); // still shown after the next run
    expect(checkinMissedLastNight(s)).toBe(true);
  });

  it("hides the button after a check-in inside a window that ends after midnight", () => {
    const { s, day } = lateWindow("22:00", "00:30", "23:30");
    s.checkins.push({ date: day, at: clock(s).toISOString() });
    expect(checkinButtonShows(s)).toBe(false);
    later(s, 40); // 00:10
    expect(checkinButtonShows(s)).toBe(false);
  });

  it("keeps the daytime button as before", () => {
    const { s } = lateWindow("08:00", "10:00", "06:59");
    expect(checkinButtonShows(s)).toBe(false);
    later(s, 1); // 07:00
    expect(checkinButtonShows(s)).toBe(true);
    later(s, 240); // 11:00: still there after the window, for a late check-in
    expect(checkinButtonShows(s)).toBe(true);
    s.checkins.push({ date: todayOf(s), at: clock(s).toISOString() });
    expect(checkinButtonShows(s)).toBe(false);
  });

  it("uses the same rule for Sarah's tile and evening recap: a window ending after midnight isn't missed in the evening", () => {
    const { s } = lateWindow("22:00", "00:30", "19:00");
    expect(checkinMissed(s)).toBe(false);
    expect(recap(s).checkinMissed).toBe(false);
    expect(recap(s).headline).not.toBe("Maggie didn't check in today.");
    // A daytime window still counts as missed once it ends.
    s.settings.checkinWindow = { start: "08:00", end: "10:00" };
    expect(checkinMissed(s)).toBe(true);
    expect(recap(s).checkinMissed).toBe(true);
  });
});
