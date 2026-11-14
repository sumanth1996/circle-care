import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, CAREGIVER, FAMILY } from "../data/demo";
import { evaluate } from "../data/store";
import { can } from "../data/policy";
import { todayOf, clock } from "../data/selectors";
import { pillsLeft, daysLeft, refillPlan, supplyState, lowSupply, autoRefillId } from "../data/everyday";
import { recordRefill, requestRefill } from "../data/everydayActions";
import { verifyChain } from "../data/audit";
import { addDays, ymd, toMin, minutesOfDay } from "../lib/time";
import type { State } from "../data/types";

/** Moves the demo clock to a time of day today. */
const setTime = (s: State, t: string) => { s.clockOffsetMin = toMin(t) - minutesOfDay(new Date()); return s; };
const daysAgoIso = (s: State, d: number) => addDays(clock(s), -d).toISOString();

/** Lisinopril once a day: a 30-pill bottle opened 30 days ago, with `taken` doses since. */
function bottle(s: State, taken: number, skipped = 0) {
  const med = s.meds.find((m) => m.id === "med-lisinopril")!;
  med.supply = { count: 30, countedAt: daysAgoIso(s, 30), perDose: 1, pharmacy: "Fog City Pharmacy" };
  s.doses = s.doses.filter((d) => d.medId !== med.id);
  for (let i = 0; i < taken + skipped; i++) {
    const at = daysAgoIso(s, 29 - i);
    s.doses.push({ id: `d${i}`, medId: med.id, date: at.slice(0, 10), time: "08:00", status: i < taken ? "taken" : "skipped", by: ELDER, at, verified: false });
  }
  return med;
}

describe("pills on hand (CC-120)", () => {
  it("30 pills at 1 a day with 23 doses taken shows 7 days left", () => {
    const s = seed();
    const med = bottle(s, 23);
    expect(pillsLeft(s, med)).toBe(7);
    expect(daysLeft(s, med)).toBe(7);
  });

  it("a skipped dose does not reduce the count", () => {
    const s = seed();
    const med = bottle(s, 23, 2);
    expect(pillsLeft(s, med)).toBe(7);
  });

  it("counts every scheduled time: 14 pills of a twice-daily medicine last 7 days", () => {
    const s = seed();
    const met = s.meds.find((m) => m.id === "med-metformin")!;
    met.supply = { count: 14, countedAt: clock(s).toISOString(), perDose: 1 };
    expect(daysLeft(s, met)).toBe(7);
  });

  it("entering a new bottle resets the count and logs the refill", () => {
    const s = seed();
    s.persona = "guardian";
    const med = bottle(s, 23);
    recordRefill(s, GUARDIAN, med.id, 90);
    expect(pillsLeft(s, med)).toBe(90);
    expect(med.history.at(-1)!.change).toBe("New bottle: 90 on hand");
    expect(s.audit.at(-1)!.resource).toBe("pill count for Lisinopril");
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("rejects counts that aren't real", () => {
    const s = seed();
    const med = bottle(s, 23);
    recordRefill(s, GUARDIAN, med.id, 0);
    recordRefill(s, GUARDIAN, med.id, -5);
    recordRefill(s, GUARDIAN, med.id, Number.NaN);
    expect(pillsLeft(s, med)).toBe(7);
  });

  it("a caregiver can update the count only while on shift; family can always", () => {
    const s = seed();
    s.visits = s.visits.filter((v) => !(v.caregiverId === CAREGIVER && v.date === todayOf(s)));
    expect(can(s, CAREGIVER, "write", "supply")).toBe(false);
    const med = bottle(s, 23);
    recordRefill(s, CAREGIVER, med.id, 30);
    expect(pillsLeft(s, med)).toBe(7);
    expect(s.audit.at(-1)!.action).toBe("denied");
    expect(can(s, FAMILY, "write", "supply")).toBe(true);
  });

  it("a paused medicine has no days-left estimate", () => {
    const s = seed();
    const med = bottle(s, 23);
    med.paused = true;
    expect(daysLeft(s, med)).toBeUndefined();
    expect(supplyState(s, med)).toBe("paused");
  });
});

describe("low-supply alert and Calendar refill (CC-121)", () => {
  it("at 7 days left sends one alert and adds an orange refill entry 3 days before it runs out", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    const alerts = s.alerts.filter((a) => a.key?.startsWith(`supply-${med.id}`));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toContain("Lisinopril: 7 days left");
    expect(alerts[0].title).toBe("You have a reminder from Circle Care"); // nothing medical on the lock screen
    expect(alerts[0].to).toEqual(["guardian", "caregiver"]);
    const appt = s.appointments.find((a) => a.id === autoRefillId(med))!;
    expect(appt.kind).toBe("refill");
    expect(appt.date).toBe(ymd(addDays(clock(s), 4)));
    expect(refillPlan(s, med)!.runsOut).toBe(ymd(addDays(clock(s), 7)));
  });

  it("does not repeat the alert or the Calendar entry", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s); evaluate(s); evaluate(s);
    expect(s.alerts.filter((a) => a.key?.startsWith(`supply-${med.id}`))).toHaveLength(1);
    expect(s.appointments.filter((a) => a.id === autoRefillId(med))).toHaveLength(1);
  });

  it("the threshold is configurable between 3 and 14 days", () => {
    const s = seed();
    const med = bottle(s, 23);
    s.settings.refillAlertDays = 5;
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`supply-${med.id}`))).toBe(false);
    s.settings.refillAlertDays = 14;
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`supply-${med.id}`))).toBe(true);
  });

  it("once a refill is requested there is no repeat alert", () => {
    const s = seed();
    s.persona = "guardian";
    const med = bottle(s, 23);
    requestRefill(s, GUARDIAN, med.id);
    evaluate(s);
    expect(supplyState(s, med)).toBe("requested");
    expect(s.alerts.some((a) => a.key?.startsWith(`supply-${med.id}`))).toBe(false);
    expect(lowSupply(s).some((l) => l.med.id === med.id)).toBe(false);
  });

  it("picking up the refill closes the automatic Calendar entry and starts a fresh bottle", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    const id = autoRefillId(med);
    recordRefill(s, GUARDIAN, med.id, 30);
    evaluate(s);
    expect(s.appointments.find((a) => a.id === id)!.status).toBe("done");
    expect(supplyState(s, med)).toBe("ok");
  });

  it("an existing refill already on the Calendar is reused, not duplicated", () => {
    const s = seed();
    const med = bottle(s, 23);
    s.appointments.push({ id: "appt-mine", date: ymd(addDays(clock(s), 2)), time: "11:00", durationMin: 15, kind: "refill", title: "Pick up Lisinopril", provider: "Fog City Pharmacy", location: "1840 Irving St, San Francisco, CA", medIds: [med.id], status: "scheduled", createdBy: GUARDIAN });
    evaluate(s);
    expect(s.appointments.some((a) => a.id === autoRefillId(med))).toBe(false);
  });

  it("the demo starts with Atorvastatin low", () => {
    const s = seed();
    evaluate(s);
    expect(lowSupply(s).map((l) => l.med.name)).toContain("Atorvastatin");
  });
});
