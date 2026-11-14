import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seed, GUARDIAN, ELDER, CAREGIVER, FAMILY } from "../data/demo";
import { evaluate, allowed, applySettings, leaveChat } from "../data/store";
import { can } from "../data/policy";
import { todayOf, clock } from "../data/selectors";
import { pillsLeft, daysLeft, refillPlan, supplyState, lowSupply, autoRefillId, unitsPerDose, scheduledRefill, withCurrentSupply, rebaseSupply, dailyLogFor, hasLoggedToday, mealsGap, dailyShared, dailyWeek, FEELINGS, sharedLogFor, sharedWeek, sharedFeeling, chatMembers, inChat, unreadChat, phiHint, chatAudience, lastChatMessage, chatMessages, CHAT_MAX } from "../data/everyday";
import { recordRefill, requestRefill, logDaily, setDailySharing, noteSharedSince, sendChat, readChat, setChatPro } from "../data/everydayActions";
import { verifyChain } from "../data/audit";
import { addDays, ymd, toMin, minutesOfDay } from "../lib/time";
import type { State } from "../data/types";

// Date stands still inside each test, so a saved timestamp can be compared with clock() exactly.
// (Unfrozen, a comparison could straddle a millisecond and fail now and then. Review F3-8.)
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); });

/** Moves the demo clock to a time of day today. */
const setTime = (s: State, t: string) => { s.clockOffsetMin = toMin(t) - minutesOfDay(new Date()); return s; };
const daysAgoIso = (s: State, d: number) => addDays(clock(s), -d).toISOString();

/** Lisinopril once a day: a 30-pill bottle opened 30 days ago, with `taken` doses since and today's dose still to give. */
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
  it("30 pills at 1 a day with 23 doses taken: 7 on hand, 6 days left after today's dose", () => {
    const s = seed();
    const med = bottle(s, 23);
    expect(pillsLeft(s, med)).toBe(7);
    expect(daysLeft(s, med)).toBe(6);
  });

  it("a skipped dose does not reduce the count", () => {
    const s = seed();
    const med = bottle(s, 23, 2);
    expect(pillsLeft(s, med)).toBe(7);
  });

  it("counts every scheduled time: 14 pills of a twice-daily medicine, both doses still due today, last 6 more days", () => {
    const s = seed();
    const met = s.meds.find((m) => m.id === "med-metformin")!;
    s.doses = s.doses.filter((d) => !(d.medId === met.id && d.date === todayOf(s)));
    met.supply = { count: 14, countedAt: clock(s).toISOString(), perDose: 1 };
    expect(daysLeft(s, met)).toBe(6);
  });

  it("gives the same run-out day in the morning and after the evening dose", () => {
    const s = seed();
    const met = s.meds.find((m) => m.id === "med-metformin")!;
    const today = todayOf(s);
    s.doses = s.doses.filter((d) => !(d.medId === met.id && d.date === today));
    met.supply = { count: 14, countedAt: clock(s).toISOString(), perDose: 1 };
    const morning = refillPlan(s, met)!;
    // Both doses given: 12 pills left, nothing due today.
    for (const time of met.times) s.doses.push({ id: `m-${time}`, medId: met.id, date: today, time, status: "taken", by: ELDER, at: clock(s).toISOString(), verified: false });
    expect(pillsLeft(s, met)).toBe(12);
    expect(refillPlan(s, met)).toEqual(morning);
  });

  it("reads half tablets", () => {
    const s = seed();
    const med = bottle(s, 0);
    med.dose = "1/2 tablet";
    expect(unitsPerDose(med)).toBe(0.5);
    med.dose = "½ tablet";
    expect(unitsPerDose(med)).toBe(0.5);
  });

  it("changing the dose mid-bottle keeps what past doses used", () => {
    const s = seed();
    const med = bottle(s, 19); // 11 on hand
    const after = rebaseSupply(s, med, { ...med, dose: "2 tablets" });
    expect(pillsLeft(s, after)).toBe(11);
    expect(after.supply!.perDose).toBe(2);
  });

  it("a 2-tablet dose uses 2 pills", () => {
    const s = seed();
    const med = bottle(s, 0);
    med.dose = "2 tablets";
    expect(unitsPerDose(med)).toBe(2);
    expect(daysLeft(s, med)).toBe(14); // 30 pills, 2 for today, then 2 a day
    recordRefill(s, GUARDIAN, med.id, 60);
    expect(med.supply!.perDose).toBe(2);
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
    // Off shift, a paid caregiver can't see pill counts either (minimum necessary).
    expect(can(s, CAREGIVER, "read", "supply")).toBe(false);
  });

  it("approving an older change request keeps today's pill count", () => {
    const s = seed();
    const med = bottle(s, 23);
    const proposed = { ...structuredClone(med), times: ["09:00"] }; // made before the new bottle
    recordRefill(s, GUARDIAN, med.id, 90);
    const merged = withCurrentSupply(proposed, med);
    expect(merged.times).toEqual(["09:00"]);
    expect(merged.supply!.count).toBe(90);
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
    expect(alerts[0].detail).toContain("Lisinopril: 6 days left");
    expect(alerts[0].title).toBe("You have a reminder from Circle Care"); // nothing medical on the lock screen
    expect(alerts[0].to).toEqual(["guardian", "caregiver"]);
    const appt = s.appointments.find((a) => a.id === autoRefillId(med))!;
    expect(appt.kind).toBe("refill");
    expect(appt.date).toBe(ymd(addDays(clock(s), 3)));
    expect(refillPlan(s, med)!.runsOut).toBe(ymd(addDays(clock(s), 6)));
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
    // The screens show the entry that is really there.
    expect(lowSupply(s).find((l) => l.med.id === med.id)!.calendarOn).toBe(scheduledRefill(s, med)!.date);
  });

  it("two counts saved in the same minute still leave a refill on the Calendar", () => {
    const s = seed();
    const med = bottle(s, 0);
    recordRefill(s, GUARDIAN, med.id, 5);
    evaluate(s);
    recordRefill(s, GUARDIAN, med.id, 4);
    evaluate(s);
    expect(scheduledRefill(s, med)).toBeDefined();
  });

  it("resuming a paused medicine puts its refill back on the Calendar", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    med.paused = true;
    evaluate(s);
    med.paused = false;
    evaluate(s);
    expect(scheduledRefill(s, med)?.id).toBe(autoRefillId(med));
    expect(lowSupply(s).find((l) => l.med.id === med.id)!.calendarOn).toBe(scheduledRefill(s, med)!.date);
  });

  it("a refill entry the guardian cancelled stays cancelled", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    s.appointments.find((a) => a.id === autoRefillId(med))!.status = "cancelled";
    evaluate(s);
    expect(s.appointments.find((a) => a.id === autoRefillId(med))!.status).toBe("cancelled");
  });

  it("editing the dose mid-bottle doesn't send a second alert or add a second entry", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    const i = s.meds.findIndex((m) => m.id === med.id);
    s.meds[i] = rebaseSupply(s, med, { ...med, dose: "2 tablets" });
    evaluate(s);
    expect(s.alerts.filter((a) => a.key?.startsWith(`supply-${med.id}`))).toHaveLength(1);
    expect(s.appointments.filter((a) => a.kind === "refill" && a.status === "scheduled" && a.medIds.includes(med.id) && a.id.startsWith("appt-auto-"))).toHaveLength(1);
  });

  it("pausing a medicine cancels its automatic refill entry", () => {
    const s = seed();
    const med = bottle(s, 23);
    evaluate(s);
    med.paused = true;
    evaluate(s);
    expect(s.appointments.find((a) => a.id === autoRefillId(med))!.status).toBe("cancelled");
  });

  it("the demo starts with Atorvastatin low", () => {
    const s = seed();
    evaluate(s);
    expect(lowSupply(s).map((l) => l.med.name)).toContain("Atorvastatin");
  });
});

describe("one-tap daily check-ins (CC-142)", () => {
  it("each tap saves immediately: feeling, water and meals", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { feeling: "calm" });
    logDaily(s, ELDER, { water: 1 });
    logDaily(s, ELDER, { water: 2 });
    logDaily(s, ELDER, { meal: "breakfast" });
    const l = dailyLogFor(s);
    expect(l.feeling).toBe("calm");
    expect(l.water).toBe(2);
    expect(l.meals).toEqual(["breakfast"]);
    expect(s.dailyLogs.filter((x) => x.date === todayOf(s))).toHaveLength(1);
  });

  it("tapping a meal again un-ticks it; clearing the face removes it; water never goes below zero", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { meal: "lunch" });
    logDaily(s, ELDER, { meal: "lunch" });
    logDaily(s, ELDER, { feeling: "good" });
    logDaily(s, ELDER, { feeling: null });
    logDaily(s, ELDER, { water: -3 });
    const l = dailyLogFor(s);
    expect(l.meals).toEqual([]);
    expect(l.feeling).toBeUndefined();
    expect(l.water).toBe(0);
  });

  it("only Maggie can log her check-ins", () => {
    const s = seed();
    for (const who of [GUARDIAN, FAMILY, CAREGIVER]) expect(can(s, who, "write", "wellbeing")).toBe(false);
    const before = JSON.stringify(s.dailyLogs);
    logDaily(s, GUARDIAN, { feeling: "great" });
    expect(JSON.stringify(s.dailyLogs)).toBe(before);
    expect(s.audit.at(-1)!.action).toBe("denied");
  });

  it("skipping sends nothing, and there is at most one reminder a day, in the evening", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    setTime(s, "18:30");
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("daily-elder"))).toBe(false);
    setTime(s, "19:30");
    evaluate(s); evaluate(s);
    expect(s.alerts.filter((a) => a.key === `daily-elder-${todayOf(s)}`)).toHaveLength(1);
    expect(s.alerts.find((a) => a.key === `daily-elder-${todayOf(s)}`)!.to).toEqual(["elder"]);
  });

  it("no evening reminder once she has added anything", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { water: 1 });
    expect(hasLoggedToday(s)).toBe(true);
    setTime(s, "19:30");
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("daily-elder"))).toBe(false);
  });
});

describe("guardian sees check-ins in Well-being (CC-143)", () => {
  it("Sarah can read check-ins only while Maggie shares them", () => {
    const s = seed();
    expect(can(s, GUARDIAN, "read", "wellbeing")).toBe(true);
    setDailySharing(s, ELDER, false);
    expect(can(s, GUARDIAN, "read", "wellbeing")).toBe(false);
    expect(s.alerts.at(-1)!.detail).toContain("stopped sharing");
    expect(can(s, FAMILY, "read", "wellbeing")).toBe(false);
  });

  it("a caregiver or family member asking to read check-ins is refused and audited", () => {
    const s = seed();
    for (const who of [FAMILY, CAREGIVER]) {
      expect(allowed(s, who, "read", "wellbeing")).toBe(false);
      expect(s.audit.at(-1)).toMatchObject({ actorId: who, action: "denied", resource: "read wellbeing" });
    }
  });

  it("only Maggie can change that choice", () => {
    const s = seed();
    setDailySharing(s, GUARDIAN, false);
    expect(s.settings.dailyLog.shareWithGuardian).toBe(true);
    expect(s.audit.at(-1)!.action).toBe("denied");
  });

  it("2 days with no meals logged sends Sarah one gentle note", () => {
    const s = setTime(seed(), "12:00");
    expect(mealsGap(s)).toBe(false);
    for (const d of [1, 2]) {
      const date = ymd(addDays(clock(s), -d));
      s.dailyLogs = s.dailyLogs.map((l) => (l.date === date ? { ...l, meals: [] } : l));
    }
    expect(mealsGap(s)).toBe(true);
    evaluate(s); evaluate(s);
    const notes = s.alerts.filter((a) => a.key === `meals-${todayOf(s)}`);
    expect(notes).toHaveLength(1);
    expect(notes[0].detail).toBe("Maggie hasn't logged meals for 2 days. A quick call might help.");
    expect(notes[0].severity).toBe("info");
  });

  it("no meals note while Maggie isn't sharing", () => {
    const s = seed();
    s.settings.dailyLog.shareWithGuardian = false;
    for (const d of [1, 2]) s.dailyLogs = s.dailyLogs.filter((l) => l.date !== ymd(addDays(clock(s), -d)));
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("meals-"))).toBe(false);
  });
});

describe("check-in edge cases (CC-142 – CC-143)", () => {
  it("water stays between 0 and 20 glasses and ignores a value that isn't a number", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { water: 35 });
    expect(dailyLogFor(s).water).toBe(20);
    logDaily(s, ELDER, { water: Number.NaN });
    expect(dailyLogFor(s).water).toBe(20);
  });

  it("feeling is stamped with the time she tapped it, and cleared with it", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { feeling: "great" });
    expect(dailyLogFor(s).feelingAt).toBe(clock(s).toISOString());
    logDaily(s, ELDER, { feeling: null });
    expect(dailyLogFor(s).feelingAt).toBeUndefined();
  });

  it("an empty day reads as nothing logged, so the reminder can still go out", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { meal: "dinner" });
    logDaily(s, ELDER, { meal: "dinner" });
    expect(hasLoggedToday(s)).toBe(false);
  });

  it("the week view is seven days ending today, oldest first, with blanks for days she skipped", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== ymd(addDays(clock(s), -2)));
    const week = dailyWeek(s);
    expect(week).toHaveLength(7);
    expect(week[6].date).toBe(todayOf(s));
    expect(week[0].date).toBe(ymd(addDays(clock(s), -6)));
    expect(week[4]).toMatchObject({ water: 0, meals: [] });
  });

  it("pausing all sharing hides check-ins from Sarah too, and the meals note waits", () => {
    const s = seed();
    s.settings.sharingPaused = true;
    expect(dailyShared(s)).toBe(false);
    for (const d of [1, 2]) s.dailyLogs = s.dailyLogs.filter((l) => l.date !== ymd(addDays(clock(s), -d)));
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("meals-"))).toBe(false);
    s.settings.sharingPaused = false;
    expect(dailyShared(s)).toBe(true);
  });

  it("turning sharing on when it's already on changes nothing and sends nothing", () => {
    const s = seed();
    const alerts = s.alerts.length;
    const audit = s.audit.length;
    setDailySharing(s, ELDER, true);
    expect(s.alerts.length).toBe(alerts);
    expect(s.audit.length).toBe(audit);
  });

  it("turning sharing back on tells Sarah, and the change is on the audit chain", () => {
    const s = seed();
    setDailySharing(s, ELDER, false);
    setDailySharing(s, ELDER, true);
    expect(s.alerts.at(-1)!.detail).toContain("sharing her daily check-ins with you again");
    expect(s.audit.at(-1)!.resource).toBe("check-in sharing (on)");
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("lock-screen text for both check-in notices names no feeling, water or meal detail", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    for (const d of [1, 2]) s.dailyLogs = s.dailyLogs.filter((l) => l.date !== ymd(addDays(clock(s), -d)));
    setTime(s, "19:30");
    evaluate(s);
    for (const key of [`daily-elder-${todayOf(s)}`, `meals-${todayOf(s)}`]) {
      const a = s.alerts.find((x) => x.key === key)!;
      expect(a.title).toMatch(/Circle Care/);
      expect(a.title.toLowerCase()).not.toMatch(/meal|water|feel/);
    }
  });

  it("the faces have plain-word labels and no emoji", () => {
    for (const f of FEELINGS) expect(f.label).toMatch(/^[A-Za-z ]+$/);
  });

  it("the demo seeds a week of check-ins with one day without a feeling", () => {
    const s = seed();
    const past = dailyWeek(s).slice(0, 6);
    expect(past.filter((d) => !d.feeling)).toHaveLength(1);
    expect(mealsGap(s)).toBe(false);
  });
});

describe("Lead Architect review fixes (CC-142 – CC-143)", () => {
  const clearDays = (s: State, days: number[]) => { for (const d of days) s.dailyLogs = s.dailyLogs.filter((l) => l.date !== ymd(addDays(clock(s), -d))); };
  const meals = (s: State, d: number, m: State["dailyLogs"][number]["meals"]) => {
    const date = ymd(addDays(clock(s), -d));
    s.dailyLogs = [...s.dailyLogs.filter((l) => l.date !== date), { date, water: 2, meals: m, updatedAt: `${date}T12:00:00.000Z` }];
  };

  it("F2-1: turning check-in sharing on while all sharing is paused says it starts once she resumes", () => {
    const s = seed();
    setDailySharing(s, ELDER, false);
    s.settings.sharingPaused = true;
    setDailySharing(s, ELDER, true);
    expect(dailyShared(s)).toBe(false);
    expect(s.alerts.at(-1)!.detail).toBe("Maggie will share her daily check-ins with you once she resumes sharing.");
  });

  it("F2-2: a day logged while not sharing stays private after sharing is turned on", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    setDailySharing(s, ELDER, false);
    logDaily(s, ELDER, { feeling: "low" });
    setDailySharing(s, ELDER, true);
    logDaily(s, ELDER, { waterBy: 1 });
    expect(dailyLogFor(s).private).toBe(true);
    expect(sharedLogFor(s)).toMatchObject({ water: 0, meals: [] });
    expect(sharedLogFor(s)!.feeling).toBeUndefined();
    expect(sharedFeeling(s, todayOf(s))).toEqual({ state: "private" });
    expect(sharedWeek(s)[6].feeling).toBeUndefined();
  });

  it("F2-2: a day logged while all sharing is paused stays private too", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    s.settings.sharingPaused = true;
    logDaily(s, ELDER, { meal: "lunch" });
    s.settings.sharingPaused = false;
    expect(sharedLogFor(s)!.meals).toEqual([]);
    expect(dailyLogFor(s).meals).toEqual(["lunch"]);
  });

  it("F2-2: a day logged while shared stays visible", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { feeling: "great" });
    expect(dailyLogFor(s).private).toBeUndefined();
    expect(sharedFeeling(s, todayOf(s))).toMatchObject({ state: "shared", feeling: { key: "great" } });
  });

  it("F2-3: someone who never uses meal check-ins never gets Sarah a no-meals note", () => {
    const s = setTime(seed(), "12:00");
    s.dailyLogs = [];
    expect(mealsGap(s)).toBe(false);
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("meals-"))).toBe(false);
  });

  it("F2-3: the no-meals note waits until 9 AM", () => {
    const s = setTime(seed(), "00:05");
    clearDays(s, [1, 2]);
    meals(s, 3, ["lunch"]);
    expect(mealsGap(s)).toBe(false);
    setTime(s, "09:00");
    expect(mealsGap(s)).toBe(true);
  });

  it("F2-3: a private day counts as unknown, so it never triggers the note", () => {
    const s = setTime(seed(), "12:00");
    clearDays(s, [1, 2]);
    const date = ymd(addDays(clock(s), -1));
    s.dailyLogs.push({ date, water: 0, meals: [], updatedAt: `${date}T12:00:00.000Z`, private: true });
    expect(mealsGap(s)).toBe(false);
  });

  it("F2-11: days Sarah couldn't see never trigger the no-meals note, even with nothing logged", () => {
    const s = setTime(seed(), "10:00");
    clearDays(s, [1, 2]);
    meals(s, 3, ["lunch"]);
    expect(mealsGap(s)).toBe(true);
    setDailySharing(s, ELDER, false);
    setDailySharing(s, ELDER, true);
    expect(s.settings.dailyLog.sharedSince).toBe(clock(s).toISOString());
    expect(mealsGap(s)).toBe(false);
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("meals-"))).toBe(false);
    // Once two whole days have been shared since, the note can come again.
    s.clockOffsetMin += 3 * 24 * 60;
    clearDays(s, [1, 2]);
    meals(s, 3, ["lunch"]);
    expect(mealsGap(s)).toBe(true);
  });

  it("F2-11: resuming after a pause also counts as a fresh start", () => {
    const s = setTime(seed(), "10:00");
    clearDays(s, [1, 2]);
    meals(s, 3, ["lunch"]);
    applySettings(s, ELDER, { sharingPaused: true });
    applySettings(s, ELDER, { sharingPaused: false });
    expect(s.settings.dailyLog.sharedSince).toBe(clock(s).toISOString());
    expect(mealsGap(s)).toBe(false);
    const before = s.settings.dailyLog.sharedSince;
    noteSharedSince(s, true);
    expect(s.settings.dailyLog.sharedSince).toBe(before);
  });

  it("F2-13: only Maggie changes her sharing choices; a general settings write is refused and audited", () => {
    const s = seed();
    setDailySharing(s, ELDER, false);
    const vitalsBefore = s.settings.vitals.shareWithGuardian;
    applySettings(s, GUARDIAN, { dailyLog: { ...s.settings.dailyLog, shareWithGuardian: true } });
    expect(s.settings.dailyLog.shareWithGuardian).toBe(false);
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "denied", resource: "change check-in sharing" });
    applySettings(s, ELDER, { dailyLog: { ...s.settings.dailyLog, shareWithGuardian: true } });
    expect(s.settings.dailyLog.shareWithGuardian).toBe(false);
    applySettings(s, GUARDIAN, { vitals: { ...s.settings.vitals, shareWithGuardian: !vitalsBefore } });
    expect(s.settings.vitals.shareWithGuardian).toBe(vitalsBefore);
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "denied", resource: "change health sharing" });
    // Nor can Sarah undo Maggie's pause, or pause for her. (Review F2-14.)
    applySettings(s, ELDER, { sharingPaused: true });
    applySettings(s, GUARDIAN, { sharingPaused: false });
    expect(s.settings.sharingPaused).toBe(true);
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "denied", resource: "change paused sharing" });
    applySettings(s, ELDER, { sharingPaused: false });
    applySettings(s, GUARDIAN, { sharingPaused: true });
    expect(s.settings.sharingPaused).toBe(false);
    // Sarah's own vitals thresholds still save.
    applySettings(s, GUARDIAN, { vitals: { ...s.settings.vitals, intervalMin: 15 } });
    expect(s.settings.vitals.intervalMin).toBe(15);
  });

  it("F2-12: Sarah sees a private day as not shared, never as zero glasses and zero meals", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    setDailySharing(s, ELDER, false);
    logDaily(s, ELDER, { waterBy: 3, meal: "breakfast" });
    setDailySharing(s, ELDER, true);
    expect(sharedLogFor(s)!.private).toBe(true);
    expect(sharedWeek(s)[6].private).toBe(true);
    expect(sharedWeek(s)[5].private).toBeUndefined();
  });

  it("F2-9: water taps add to what's saved, so two quick taps are two glasses", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    logDaily(s, ELDER, { waterBy: 1 });
    logDaily(s, ELDER, { waterBy: 1 });
    logDaily(s, ELDER, { waterBy: -5 });
    expect(dailyLogFor(s).water).toBe(0);
    for (let i = 0; i < 25; i++) logDaily(s, ELDER, { waterBy: 1 });
    expect(dailyLogFor(s).water).toBe(20);
  });

  it("F2-10: an older check-in face maps onto the same six feelings, only while shared", () => {
    const s = seed();
    const date = ymd(addDays(clock(s), -2));
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== date);
    s.checkins = [...s.checkins.filter((c) => c.date !== date), { date, at: `${date}T08:30:00.000Z`, mood: "\u{1F60C}" }];
    expect(sharedFeeling(s, date)).toMatchObject({ state: "shared", feeling: { label: "Calm" } });
    setDailySharing(s, ELDER, false);
    expect(sharedFeeling(s, date)).toEqual({ state: "private" });
  });

  it("the 7 PM reminder goes out at exactly 7:00 and not at 6:59", () => {
    const s = seed();
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    setTime(s, "18:59");
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `daily-elder-${todayOf(s)}`)).toBe(false);
    setTime(s, "19:00");
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `daily-elder-${todayOf(s)}`)).toBe(true);
  });

  it("nobody but Maggie and Sarah reads check-ins, paused or not", () => {
    const s = seed();
    for (const paused of [false, true]) {
      s.settings.sharingPaused = paused;
      for (const who of [FAMILY, CAREGIVER]) expect(can(s, who, "read", "wellbeing")).toBe(false);
      expect(can(s, ELDER, "read", "wellbeing")).toBe(true);
    }
  });
});


describe("family chat (CC-164, CC-165)", () => {
  it("includes the whole circle except paid caregivers until Maggie or Sarah adds one", () => {
    const s = seed();
    const ids = chatMembers(s).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([ELDER, GUARDIAN, FAMILY]));
    expect(ids).not.toContain(CAREGIVER);
    expect(can(s, CAREGIVER, "read", "chat")).toBe(false);
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    expect(can(s, CAREGIVER, "read", "chat")).toBe(true);
    expect(can(s, CAREGIVER, "write", "chat")).toBe(true);
    setChatPro(s, ELDER, CAREGIVER, false);
    expect(can(s, CAREGIVER, "read", "chat")).toBe(false);
    expect(s.chat.readAt[CAREGIVER]).toBeUndefined();
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("only Maggie or Sarah can add a caregiver, and other tries are refused and audited", () => {
    const s = seed();
    setChatPro(s, FAMILY, CAREGIVER, true);
    expect(s.chat.pros).not.toContain(CAREGIVER);
    expect(s.audit.at(-1)!.action).toBe("denied");
    setChatPro(s, CAREGIVER, CAREGIVER, true);
    expect(s.chat.pros).not.toContain(CAREGIVER);
    expect(s.audit.at(-1)!.action).toBe("denied");
  });

  it("a caregiver who wasn't added can't send or read, and each try is audited", () => {
    const s = seed();
    const n = s.chat.messages.length;
    const audits = s.audit.length;
    expect(sendChat(s, CAREGIVER, "Hello everyone")).toBe(false);
    readChat(s, CAREGIVER);
    expect(s.chat.messages).toHaveLength(n);
    expect(s.chat.readAt[CAREGIVER]).toBeUndefined();
    const denied = s.audit.slice(audits);
    expect(denied.map((a) => a.action)).toEqual(["denied", "denied"]);
    expect(denied.map((a) => a.resource)).toEqual(["write chat", "read chat"]);
  });

  it("a member who leaves the circle loses access at once", () => {
    const s = seed();
    expect(inChat(s, FAMILY)).toBe(true);
    s.members.find((m) => m.id === FAMILY)!.status = "revoked";
    expect(inChat(s, FAMILY)).toBe(false);
    expect(chatMembers(s).some((m) => m.id === FAMILY)).toBe(false);
    expect(sendChat(s, FAMILY, "Still here?")).toBe(false);
  });

  it("a caregiver whose time-limited access ends is taken out of the chat too", () => {
    const s = seed();
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    const ana = s.members.find((m) => m.id === CAREGIVER)!;
    ana.expiresOn = ymd(addDays(clock(s), -1));
    evaluate(s);
    expect(ana.status).toBe("revoked");
    expect(s.chat.pros).not.toContain(CAREGIVER);
    // Coming back to the circle does not bring the chat back without someone adding her again.
    ana.status = "active";
    delete ana.expiresOn;
    expect(inChat(s, CAREGIVER)).toBe(false);
  });

  it("sending notifies everyone else with a generic lock-screen title", () => {
    const s = seed();
    s.persona = "elder";
    expect(sendChat(s, ELDER, "  See you Saturday!  ", "voice")).toBe(true);
    const m = s.chat.messages.at(-1)!;
    expect(m.text).toBe("See you Saturday!");
    expect(m.via).toBe("voice");
    expect(s.chat.readAt[ELDER]).toBe(m.at);
    const a = s.alerts.at(-1)!;
    expect(a.title).toBe("New message in Circle Care");
    expect(a.detail).not.toContain("Saturday");
    expect(a.to).toEqual(["guardian"]);
    expect(a.link).toBe("/app/chat");
  });

  it("tells Ana about new messages only once she's in the chat", () => {
    const s = seed();
    expect(chatAudience(s, GUARDIAN)).toEqual(["elder"]);
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    expect(chatAudience(s, GUARDIAN).sort()).toEqual(["caregiver", "elder"]);
  });

  it("refuses empty messages and messages over 1000 characters instead of cutting them", () => {
    const s = seed();
    const n = s.chat.messages.length;
    expect(sendChat(s, GUARDIAN, "   ")).toBe(false);
    expect(sendChat(s, GUARDIAN, "a".repeat(CHAT_MAX + 1))).toBe(false);
    expect(s.chat.messages).toHaveLength(n);
    expect(sendChat(s, GUARDIAN, "a".repeat(CHAT_MAX))).toBe(true);
    expect(s.chat.messages.at(-1)!.text).toHaveLength(CHAT_MAX);
  });

  it("counts unread messages per person, and opening the chat clears them", () => {
    const s = seed();
    setTime(s, "12:00");
    expect(unreadChat(s, GUARDIAN)).toBe(1);
    expect(unreadChat(s, FAMILY)).toBe(0);
    expect(unreadChat(s, CAREGIVER)).toBe(0);
    readChat(s, GUARDIAN);
    expect(unreadChat(s, GUARDIAN)).toBe(0);
    expect(lastChatMessage(s)!.by).toBe(FAMILY);
  });

  it("pausing sharing limits James and caregivers to emergencies, the chat included", () => {
    const s = seed();
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    applySettings(s, ELDER, { sharingPaused: true });
    expect(inChat(s, FAMILY)).toBe(false);
    expect(inChat(s, CAREGIVER)).toBe(false);
    expect(inChat(s, GUARDIAN)).toBe(true);
    applySettings(s, ELDER, { sharingPaused: false });
    expect(inChat(s, FAMILY)).toBe(true);
  });

  it("only Maggie decides whether the chat shows on her home", () => {
    const s = seed();
    applySettings(s, GUARDIAN, { elderChatOnHome: false });
    expect(s.settings.elderChatOnHome).toBe(true);
    expect(s.audit.at(-1)!.action).toBe("denied");
    applySettings(s, ELDER, { elderChatOnHome: false });
    expect(s.settings.elderChatOnHome).toBe(false);
  });

  it("suggests Notes when a message names a medicine, a diagnosis or a dose", () => {
    const s = seed();
    const med = s.meds[0].name;
    expect(phiHint(s, `Did Mom take her ${med.toLowerCase()} today?`)).toContain(med);
    expect(phiHint(s, "Her blood pressure was high")).toContain("blood pressure");
    expect(phiHint(s, "The doctor changed it to 20 mg")).toContain("a dose");
    expect(phiHint(s, "New diagnosis from the clinic")).toContain("diagnos…");
    expect(phiHint(s, "Giants game on Sunday, who's in?")).toEqual([]);
    expect(phiHint(s, "Heartfelt thanks for dinner")).toEqual([]);
    expect(phiHint(s, "I'll be there at 10 maybe")).toEqual([]);
  });

  it("Review F3-6: catches medicines without their strength and common health words, not everyday ones", () => {
    const s = seed();
    const vitD = s.meds.find((m) => /\d$/.test(m.name));
    if (vitD) expect(phiHint(s, `Did she have her ${vitD.name.replace(/\s*\d+$/, "").toLowerCase()} today?`)).toContain(vitD.name);
    const any = s.meds[0].name;
    expect(phiHint(s, `${any.toLowerCase()}20mg from now on`)).toContain(any);
    for (const w of ["Picked up her meds", "The dosage changed", "1000 IU a day", "Her BP is fine", "Arthritis is worse", "Diabetic menu please"]) {
      expect(phiHint(s, w).length, w).toBeGreaterThan(0);
    }
    for (const w of ["New tablet for video calls", "Kidney beans for the chili", "2 units of rental storage", "Our 5g is slow"]) {
      expect(phiHint(s, w), w).toEqual([]);
    }
  });

  it("Review F3-5: an added caregiver sees messages from when they joined, not the history", () => {
    const s = setTime(seed(), "12:00");
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    expect(s.chat.joinedAt[CAREGIVER]).toBe(clock(s).toISOString());
    expect(chatMessages(s, CAREGIVER)).toEqual([]);
    expect(unreadChat(s, CAREGIVER)).toBe(0);
    s.clockOffsetMin += 1;
    sendChat(s, GUARDIAN, "Ana, thanks for today");
    expect(chatMessages(s, CAREGIVER).map((m) => m.text)).toEqual(["Ana, thanks for today"]);
    expect(unreadChat(s, CAREGIVER)).toBe(1);
    expect(chatMessages(s, GUARDIAN).length).toBeGreaterThan(1);
    setChatPro(s, GUARDIAN, CAREGIVER, false);
    expect(s.chat.joinedAt[CAREGIVER]).toBeUndefined();
  });

  it("Review F3-12: removing a member clears their chat place, read mark and join time", () => {
    const s = seed();
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    readChat(s, CAREGIVER);
    leaveChat(s, CAREGIVER);
    expect(s.chat.pros).not.toContain(CAREGIVER);
    expect(s.chat.readAt[CAREGIVER]).toBeUndefined();
    expect(s.chat.joinedAt[CAREGIVER]).toBeUndefined();
    expect(inChat(s, CAREGIVER)).toBe(false);
  });
});
