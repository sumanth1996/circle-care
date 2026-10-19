import { describe, it, expect } from "vitest";
import { readingsFor, detectEvents, DEFAULT_THRESHOLDS, activityFor, sleepFor, moodFrom, bmi, restingHr, nextReadingAt, type VitalReading } from "../lib/health";
import { seed, GUARDIAN, FAMILY, ELDER, CAREGIVER } from "../data/demo";
import { can } from "../data/policy";

const r = (min: number, hr: number, spo2 = 97, asleep = false): VitalReading => ({ at: `2026-10-19T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00.000Z`, slot: min, hr, spo2, asleep });

describe("health readings (CC-85)", () => {
  it("produces one reading per 30 minutes up to now", () => {
    const now = new Date("2026-10-19T10:47:00");
    const rs = readingsFor("2026-10-19", now, 30);
    expect(rs).toHaveLength(22); // 00:00 … 10:30
    expect(rs.at(-1)!.slot).toBe(630);
  });
  it("honors a different interval", () => {
    const now = new Date("2026-10-19T10:47:00");
    expect(readingsFor("2026-10-19", now, 60)).toHaveLength(11);
    expect(readingsFor("2026-10-19", now, 15)).toHaveLength(44);
  });
  it("covers the whole day for past days", () => {
    expect(readingsFor("2026-10-18", new Date("2026-10-19T10:00:00"), 30, [], "2026-10-19")).toHaveLength(48);
  });
  it("is deterministic", () => {
    const now = new Date("2026-10-19T12:00:00");
    expect(readingsFor("2026-10-19", now)).toEqual(readingsFor("2026-10-19", now));
  });
  it("applies presenter overrides", () => {
    const now = new Date("2026-10-19T12:00:00");
    const at = readingsFor("2026-10-19", now).at(-1)!.at;
    expect(readingsFor("2026-10-19", now, 30, [{ at, hr: 140 }]).at(-1)!.hr).toBe(140);
  });
  it("tells you when the next reading arrives", () => {
    expect(nextReadingAt(new Date("2026-10-19T10:47:00"), 30)).toBe("11:00");
    expect(nextReadingAt(new Date("2026-10-19T23:50:00"), 30)).toBe("00:00");
  });
});

describe("unusual readings (CC-86, CC-88)", () => {
  it("flags high and low heart rate", () => {
    const e = detectEvents([r(600, 75), r(630, 115), r(660, 112), r(690, 48)]);
    expect(e.map((x) => x.kind)).toEqual(["high", "high", "low"]);
  });
  it("does not flag a low heart rate while asleep", () => {
    expect(detectEvents([r(120, 52, 96, true), r(150, 48, 96, true)])).toHaveLength(0);
  });
  it("flags a sudden change even inside the normal range", () => {
    const e = detectEvents([r(600, 70), r(630, 98)]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: "jump", previous: 70, value: 98 });
  });
  it("ignores small changes", () => {
    expect(detectEvents([r(600, 70), r(630, 90)])).toHaveLength(0);
  });
  it("flags low oxygen and a sudden oxygen drop", () => {
    const e = detectEvents([r(0, 60, 98), r(30, 60, 94), r(60, 60, 91)]);
    expect(e.map((x) => `${x.metric}:${x.kind}`)).toEqual(["spo2:drop", "spo2:low"]);
  });
  it("uses the guardian's thresholds", () => {
    expect(detectEvents([r(600, 70), r(630, 105)], { ...DEFAULT_THRESHOLDS, hrHigh: 100 })[0].kind).toBe("high");
  });
  it("finds the built-in demo episodes today", () => {
    const e = detectEvents(readingsFor("2026-10-19", new Date("2026-10-19T23:00:00")));
    expect(e.some((x) => x.metric === "hr" && x.kind === "high" && x.value === 128)).toBe(true);
    expect(e.some((x) => x.metric === "spo2" && x.value === 89)).toBe(true);
  });
});

describe("activity, sleep, well-being (CC-89 – CC-92)", () => {
  it("accounts for every hour so far", () => {
    const a = activityFor("2026-10-19", new Date("2026-10-19T15:10:00"));
    expect(a.hours).toHaveLength(16);
    expect(a.stepsByHour.slice(16).every((x) => x === 0)).toBe(true);
    expect(a.steps).toBe(a.stepsByHour.reduce((x, y) => x + y, 0));
  });
  it("builds a continuous night of sleep", () => {
    const s = sleepFor("2026-10-19");
    for (let i = 1; i < s.segments.length; i++) expect(s.segments[i].start).toBe(s.segments[i - 1].end);
    expect(s.asleepMin).toBeGreaterThan(6 * 60);
  });
  it("maps check-in faces to moods and respects skipped moods", () => {
    expect(moodFrom("d", "😊").valence).toBe(2);
    expect(moodFrom("d", undefined).source).toBe("none");
  });
  it("computes BMI and resting heart rate", () => {
    expect(bmi(64, 163)).toBe(24.1);
    expect(restingHr([r(0, 58, 96, true), r(30, 60, 96, true), r(600, 90)])).toBe(59);
  });
});

describe("who can see health readings (CC-87)", () => {
  it("guardian and elder only", () => {
    const s = seed();
    expect(can(s, GUARDIAN, "read", "vitals")).toBe(true);
    expect(can(s, ELDER, "read", "vitals")).toBe(true);
    expect(can(s, FAMILY, "read", "vitals")).toBe(false);
    expect(can(s, CAREGIVER, "read", "vitals")).toBe(false);
  });
  it("the guardian loses access when Maggie stops sharing", () => {
    const s = seed();
    s.settings.vitals.shareWithGuardian = false;
    expect(can(s, GUARDIAN, "read", "vitals")).toBe(false);
    expect(can(s, ELDER, "read", "vitals")).toBe(true);
  });
  it("everyone in the circle can see appointments; only the guardian edits them", () => {
    const s = seed();
    expect(can(s, CAREGIVER, "read", "appointments")).toBe(true);
    expect(can(s, GUARDIAN, "write", "appointments")).toBe(true);
    expect(can(s, FAMILY, "write", "appointments")).toBe(false);
  });
  it("seeds medication appointments including two on one day", () => {
    const s = seed();
    const days = s.appointments.map((a) => a.date);
    expect(days.some((d, i) => days.indexOf(d) !== i)).toBe(true);
    expect(s.appointments.every((a) => a.medIds.length > 0)).toBe(true);
  });
});
