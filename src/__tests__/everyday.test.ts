import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seed, GUARDIAN, ELDER, CAREGIVER, FAMILY } from "../data/demo";
import { evaluate, allowed, applySettings, leaveChat } from "../data/store";
import { can } from "../data/policy";
import { todayOf, clock } from "../data/selectors";
import { pillsLeft, daysLeft, refillPlan, supplyState, lowSupply, autoRefillId, unitsPerDose, scheduledRefill, withCurrentSupply, rebaseSupply, dailyLogFor, hasLoggedToday, mealsGap, dailyShared, dailyWeek, FEELINGS, sharedLogFor, sharedWeek, sharedFeeling, chatMembers, inChat, unreadChat, phiHint, chatAudience, lastChatMessage, chatMessages, CHAT_MAX, recap, recapOpen, inQuietHours } from "../data/everyday";
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
    const vitD = s.meds.find((m) => /\d$/.test(m.name))!;
    expect(vitD.name).toBe("Vitamin D3");
    expect(phiHint(s, `Did she have her ${vitD.name.replace(/\s*\d+$/, "").toLowerCase()} today?`)).toContain(vitD.name);
    const any = s.meds[0].name;
    expect(phiHint(s, `${any.toLowerCase()}20mg from now on`)).toContain(any);
    for (const w of ["Picked up her meds", "The dosage changed", "1000 IU a day", "Her BP is fine", "Arthritis is worse", "Diabetic menu please"]) {
      expect(phiHint(s, w).length, w).toBeGreaterThan(0);
    }
    for (const w of ["Gave her 10 units before dinner", "Her BP was 140/90", "Grandpa had a stroke years ago"]) {
      expect(phiHint(s, w).length, w).toBeGreaterThan(0);
    }
    s.meds.push({ ...s.meds[0], id: "med-test", name: "D3" });
    for (const w of ["New tablet for video calls", "Kidney beans for the chili", "2 units of rental storage", "Our 5g is slow", "Meet at the BP station", "What a stroke of luck", "I'd love to come"]) {
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

describe("fewer false alarms from the chat health-detail check (CC-192)", () => {
  /** Everyday messages that must send without the health-detail sheet. The first 13 warned on main before CC-192. */
  const EVERYDAY = [
    "Stroke the cat for me",
    "Paint it with 2 strokes",
    "Mom loves her swimming strokes",
    "Laughter is the best medicine",
    "A dose of sunshine would help",
    "The mechanic will diagnose the car",
    "Test results from Lily's school are in",
    "He prescribed reading for the summer",
    "Add 250 ml of milk to the recipe",
    "Pill bug in the garden",
    "Mom is a Cancer, birthday in July",
    "Dog's surgery went well",
    "Take 2 units of the storage",
    "What a stroke of luck",
    "Giants game on Sunday, who's in?",
    "Heartfelt thanks for dinner",
    "I'll be there at 10 maybe",
    "New tablet for video calls",
    "Kidney beans for the chili",
    "Meet at the BP station",
    "Our 5g is slow",
    "Dinner at 6 on Sunday?",
    "Can someone pick up groceries?",
    "She beat me at cards again",
    "Lily's spelling test results are great",
    "Bring the medicine ball to the gym",
    "He got a taste of his own medicine",
    "The car needs a diagnostic check",
    "Grandma's brush strokes are lovely",
    "Chill pill, everyone",
    "A dose of fresh air will do us good",
    "Can you diagnose why the wifi drops?",
    "Add 30 ml of olive oil",
    "Cancer season starts in June",
    "The vet said the cat's surgery went fine",
    "Movie at 7, popcorn on me",
    "Who has the spare key?",
    "The doctor's office called about parking",
    "Chemistry homework due Friday",
    "Prescribed route for the race is posted",
  ];

  /** Messages with health details that must still bring up the sheet. Includes every Sprint 12 case. */
  const HEALTH = [
    "Did Mom take her lisinopril this morning?",
    "The metformin is making her stomach upset",
    "She's out of vitamin d",
    "Atorvastatin moved to bedtime",
    "Doctor changed her dose to 20 mg",
    "She takes 1000 IU every day",
    "Gave her 10 units before dinner",
    "Her blood pressure was 150 over 95",
    "Her BP is 140/90",
    "Blood sugar was high after lunch",
    "Her A1C came back at 7.2",
    "Glucose reading was 180",
    "Grandpa had a stroke years ago",
    "Mom's stroke rehab starts Monday",
    "New diagnosis from the clinic today",
    "They diagnosed her heart problem over the phone",
    "The doctor prescribed an antibiotic",
    "Her new prescription is ready",
    "Early signs of dementia, the neurologist said",
    "Alzheimer's runs in the family",
    "Parkinson's tremor is worse",
    "Chemo starts next week",
    "Her arthritis is acting up",
    "Kidney function test is Friday",
    "The surgery is booked for Tuesday",
    "She's recovering well after surgery",
    "Her cancer screening is next month",
    "Lab results came back normal",
    "Her test results came back from the clinic",
    "Did she take her pills?",
    "She skipped a pill yesterday",
    "Picked up her meds at the pharmacy",
    "The dosage changed again",
    "What's the best medicine for her cough?",
    "Time for her medicine",
    "New heart medication starts tomorrow",
    "Insulin pen is in the fridge",
    "Her heart rate was 110 at the clinic",
    "Any symptoms since Tuesday?",
    "Mom is a cancer survivor, born in July",
  ];

  /** Health messages that sit next to, or look like, one of the everyday phrases. Each must still warn (Lead Architect review). */
  const MIXED = [
    "In the car her cancer diagnosis came up",
    "Told Dad in the car about her diagnosis",
    "She was diagnosed in the car on the way home",
    "The printer has her diagnosis on it",
    "Give her 5 ml with juice at bedtime",
    "Give her 2 ml cbd oil at night",
    "Take 10 ml in water twice a day",
    "5 ml of cough syrup at night",
    "Doctor prescribed course of prednisone",
    "He prescribed reading glasses",
    "The lump is a cancer, we found out in June",
    "Is weight loss a cancer sign?",
    "My stroke was three years ago",
    "Possible stroke, calling 911",
    "She has had two strokes",
    "Her mini-stroke scared us",
    "Recovering from stroke at Grandma's",
    "She had 2 strokes last year",
    "Family history test results came back positive",
    "Walk the dog surgery is at 9",
    "Tylenol is the best medicine she has",
    "Laughter is the best medicine for her cough",
    "A dose of sunshine and her dose of lisinopril",
    "Test results from her doctor are in",
    "Lily's covid test results from school came back",
    "Her TB test result for school is positive",
    "His drug test results for college are back",
    "Lily's allergy test results from school",
    "What are the key stroke signs to watch for?",
    "She's back stroke rehab went well",
    "Her speech got worse in 2 strokes",
    "She has lived with a few strokes",
    "Crush the tablet and stir in 5 ml of water",
    "Add 5 ml of oil to her tea at night",
    "Mom is a Cancer, born in July, now in remission",
    "The eye doctor prescribed reading lenses",
    "Test results from Lily's school are in: positive for covid",
    "Test results from Lily's school are in, strep throat",
    "Add 5 ml of water to the antibiotic powder",
    "Mix in 10 ml of water with the syrup, give it at 8",
    "Stir in 5 ml of juice with the drops",
    "Add 60 ml of water, then the amoxicillin",
    "Pharmacy said add 60 ml of water, shake, keep in fridge",
  ];

  it("still warns when a health detail sits next to an everyday phrase", () => {
    const s = seed();
    const missed = MIXED.filter((w) => phiHint(s, w).length === 0);
    expect(missed).toEqual([]);
  });

  it("has 40 everyday and 40 health sentences", () => {
    expect(EVERYDAY).toHaveLength(40);
    expect(HEALTH).toHaveLength(40);
  });

  it("catches every health sentence", () => {
    const s = seed();
    const missed = HEALTH.filter((w) => phiHint(s, w).length === 0);
    expect(missed).toEqual([]);
  });

  it("lets everyday sentences through: no more than 2 of 40 warn", () => {
    const s = seed();
    const warned = EVERYDAY.filter((w) => phiHint(s, w).length > 0);
    expect(warned.length, warned.join(" | ")).toBeLessThanOrEqual(2);
  });

  it("only lets the everyday sense through, not the health sense of the same word", () => {
    const s = seed();
    for (const [everyday, health] of [
      ["Stroke the cat for me", "Her stroke was in May"],
      ["A dose of sunshine would help", "A dose of her lisinopril"],
      ["Add 250 ml of milk", "5 ml of cough syrup at night"],
      ["Dog's surgery went well", "Her surgery went well"],
      ["Test results from Lily's school are in", "Test results from her doctor are in"],
      ["Pill bug in the garden", "Her pill box is empty"],
    ]) {
      expect(phiHint(s, everyday), everyday).toEqual([]);
      expect(phiHint(s, health).length, health).toBeGreaterThan(0);
    }
  });

  it("reads curly apostrophes like straight ones", () => {
    const s = seed();
    expect(phiHint(s, "Mom’s stroke rehab starts Monday")).toContain("stroke");
    expect(phiHint(s, "Dog’s surgery went well")).toEqual([]);
  });
});

describe("evening recap (CC-191)", () => {
  const tomorrowOf = (s: State) => ymd(addDays(clock(s), 1));
  /** Nothing booked tomorrow, so each test adds exactly what it needs. */
  const clearTomorrow = (s: State) => { s.appointments = s.appointments.filter((a) => a.date !== tomorrowOf(s)); return s; };
  const recapAlerts = (s: State) => s.alerts.filter((a) => a.key === `recap-${todayOf(s)}`);
  /** Every dose up to `upTo` is logged with `status`; the check-in is done and no medicine is low. */
  const quietDay = (s: State, upTo: string) => {
    s.doses = s.doses.filter((d) => d.date !== todayOf(s));
    for (const m of s.meds) for (const time of m.times) if (toMin(time) <= toMin(upTo)) s.doses.push({ id: `q-${m.id}-${time}`, medId: m.id, date: todayOf(s), time, status: "taken", by: ELDER, at: clock(s).toISOString(), verified: false });
    for (const m of s.meds) m.supply = undefined;
    if (!s.checkins.some((c) => c.date === todayOf(s))) s.checkins.push({ date: todayOf(s), at: clock(s).toISOString() });
    return s;
  };

  it("shows the card from 6 PM", () => {
    const s = seed();
    setTime(s, "17:59");
    expect(recapOpen(s)).toBe(false);
    setTime(s, "18:00");
    expect(recapOpen(s)).toBe(true);
  });

  it("summarizes doses, check-in, visits and a refill to sort out", () => {
    const s = seed();
    setTime(s, "19:15");
    const r = recap(s);
    expect(r.doses.total).toBeGreaterThan(0);
    expect(r.doses.taken).toBeLessThanOrEqual(r.doses.total);
    expect(r.low.map((l) => l.name)).toContain("Atorvastatin");
    evaluate(s);
    expect(recap(s).low.find((l) => l.name === "Atorvastatin")!.on! >= todayOf(s)).toBe(true);
    expect(r.calm).toBe(false);
    expect(r.headline.length).toBeGreaterThan(0);
  });

  it("names each dose that isn't confirmed, with its time", () => {
    const s = seed();
    setTime(s, "19:30");
    s.doses = s.doses.filter((d) => !(d.date === todayOf(s) && d.medId === "med-metformin" && d.time === "18:00"));
    const r = recap(s);
    expect(r.doses.unconfirmed).toContainEqual({ name: "Metformin", time: "18:00" });
    expect(r.headline).toMatch(/needs? a look\.$/);
  });

  it("gives the next dose when everything so far is confirmed", () => {
    const s = seed();
    setTime(s, "19:30");
    // The demo data logs today's doses up to the real time, so after 9 PM it holds a 21:00 log. Drop logs after 19:30.
    s.doses = s.doses.filter((d) => d.date !== todayOf(s) || toMin(d.time) <= toMin("19:30"));
    for (const d of s.doses) if (d.date === todayOf(s)) d.status = "taken";
    for (const slot of ["08:00", "12:30", "18:00"]) {
      for (const m of s.meds.filter((x) => x.times.includes(slot) && !x.paused)) {
        if (!s.doses.some((d) => d.medId === m.id && d.date === todayOf(s) && d.time === slot)) {
          s.doses.push({ id: `t-${m.id}-${slot}`, medId: m.id, date: todayOf(s), time: slot, status: "taken", by: ELDER, at: clock(s).toISOString(), verified: false });
        }
      }
    }
    const r = recap(s);
    expect(r.doses.unconfirmed).toEqual([]);
    expect(r.doses.due).toEqual([]);
    expect(r.doses.next).toBe("21:00");
  });

  it("leaves out feeling, water and meals when Maggie doesn't share them, or keeps today private", () => {
    const s = seed();
    s.settings.dailyLog.shareWithGuardian = false;
    expect(recap(s).log).toBeUndefined();
    const t = seed();
    setTime(t, "19:00");
    setDailySharing(t, ELDER, false);
    logDaily(t, ELDER, { feeling: "good", water: 3 });
    setDailySharing(t, ELDER, true);
    const log = recap(t).log!;
    expect(log.private).toBe(true);
    expect(log.feeling).toBeUndefined();
    expect(log.water).toBe(0);
  });

  it("shows tomorrow's first appointment with its prep note", () => {
    const s = clearTomorrow(seed());
    setTime(s, "19:00");
    const base = { durationMin: 20, provider: "Bay Area Lab", location: "Lab", medIds: [], status: "scheduled" as const, createdBy: GUARDIAN };
    s.appointments.push({ ...base, id: "x2", date: tomorrowOf(s), time: "11:00", kind: "doctor", title: "Follow-up" });
    s.appointments.push({ ...base, id: "x1", date: tomorrowOf(s), time: "08:15", kind: "lab", title: "Blood test", prep: "No food after midnight" });
    expect(recap(s).tomorrow).toEqual({ kind: "appointment", time: "08:15", title: "Blood test", note: "No food after midnight" });
  });

  it("falls back to the first visit tomorrow, then to nothing booked", () => {
    const s = clearTomorrow(seed());
    setTime(s, "19:00");
    const day = addDays(clock(s), 1).getDay();
    s.shifts = [
      { id: "a", caregiverId: CAREGIVER, days: [day], start: "13:00", end: "17:00", accepted: true },
      { id: "b", caregiverId: FAMILY, days: [day], start: "10:00", end: "16:00", accepted: true },
      { id: "c", caregiverId: null, days: [day], start: "07:00", end: "09:00", accepted: false },
    ];
    expect(recap(s).tomorrow).toEqual({ kind: "visit", time: "10:00", who: "James", until: "16:00" });
    s.shifts = [];
    expect(recap(s).tomorrow).toBeUndefined();
  });

  it("sends one update at 7 PM, with nothing about Maggie's health in it", () => {
    const s = seed();
    setTime(s, "18:50");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    setTime(s, "19:05");
    evaluate(s); evaluate(s);
    const r = recapAlerts(s);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("Update from Circle Care");
    expect(r[0].detail).toBe("Your evening recap is ready.");
    expect(r[0].to).toEqual(["guardian"]);
    expect(phiHint(s, `${r[0].title} ${r[0].detail}`)).toEqual([]);
  });

  it("skips the update when Sarah turns it off, and only Sarah can", () => {
    const s = seed();
    applySettings(s, ELDER, { recapNotify: false });
    expect(s.settings.recapNotify).toBe(true);
    applySettings(s, CAREGIVER, { recapNotify: false });
    expect(s.settings.recapNotify).toBe(true);
    applySettings(s, GUARDIAN, { recapNotify: false });
    expect(s.settings.recapNotify).toBe(false);
    setTime(s, "19:05");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    expect(recapOpen(s)).toBe(true);
  });

  it("skips the update during quiet hours", () => {
    const s = seed();
    s.settings.quietHours = { on: true, start: "18:30", end: "07:00" };
    setTime(s, "19:05");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    s.settings.quietHours.on = false;
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(1);
  });

  it("reads quiet hours that run past midnight", () => {
    const q = { on: true, start: "22:00", end: "07:00" };
    expect(inQuietHours(q, toMin("23:30"))).toBe(true);
    expect(inQuietHours(q, toMin("06:59"))).toBe(true);
    expect(inQuietHours(q, toMin("19:00"))).toBe(false);
    expect(inQuietHours({ ...q, start: "12:00", end: "14:00" }, toMin("13:00"))).toBe(true);
    expect(inQuietHours({ ...q, on: false }, toMin("23:30"))).toBe(false);
  });

  it("F4-1: a dose due now is neither calm nor 'all confirmed', and shows on its own", () => {
    const s = seed();
    setTime(s, "18:10");
    quietDay(s, "12:30");
    let r = recap(s);
    expect(r.doses.due).toEqual([{ name: "Metformin", time: "18:00" }]);
    expect(r.doses.unconfirmed).toEqual([]);
    expect(r.calm).toBe(false);
    expect(r.headline).toBe("1 dose is due now.");
    setTime(s, "20:50");
    quietDay(s, "18:00");
    r = recap(s);
    expect(r.doses.due).toEqual([{ name: "Atorvastatin", time: "21:00" }]);
    expect(r.doses.next).toBeUndefined();
    expect(r.headline).toBe("1 dose is due now.");
  });

  it("calls a day calm only when nothing needs a look", () => {
    const s = seed();
    setTime(s, "19:30");
    quietDay(s, "18:00");
    const r = recap(s);
    expect(r.calm).toBe(true);
    expect(r.headline).toBe("A calm day for Maggie.");
  });

  it("F4-2: skipped and refused doses are named as such, not as unconfirmed", () => {
    const s = seed();
    setTime(s, "19:30");
    quietDay(s, "18:00");
    s.doses.find((d) => d.date === todayOf(s) && d.medId === "med-vitd")!.status = "skipped";
    s.doses.find((d) => d.date === todayOf(s) && d.medId === "med-lisinopril")!.status = "refused";
    const r = recap(s);
    expect(r.doses.skipped).toEqual([{ name: "Vitamin D3", time: "12:30" }]);
    expect(r.doses.refused).toEqual([{ name: "Lisinopril", time: "08:00" }]);
    expect(r.doses.unconfirmed).toEqual([]);
    expect(r.headline).toBe("2 doses need a look.");
  });

  it("leaves a paused medicine out", () => {
    const s = seed();
    setTime(s, "19:30");
    quietDay(s, "18:00");
    s.meds.find((m) => m.id === "med-vitd")!.paused = true;
    s.doses = s.doses.filter((d) => d.medId !== "med-vitd");
    const r = recap(s);
    expect(r.doses.unconfirmed).toEqual([]);
    expect(r.calm).toBe(true);
  });

  it("F4-5: says Maggie didn't check in only once her window has closed", () => {
    const s = seed();
    setTime(s, "19:30");
    quietDay(s, "18:00");
    s.checkins = s.checkins.filter((c) => c.date !== todayOf(s));
    s.settings.checkinWindow = { start: "08:00", end: "20:00" };
    expect(recap(s).checkinMissed).toBe(false);
    expect(recap(s).calm).toBe(false);
    expect(recap(s).headline).toBe("Maggie's check-in is still to come.");
    s.settings.checkinWindow = { start: "08:00", end: "10:00" };
    expect(recap(s).checkinMissed).toBe(true);
    expect(recap(s).headline).toBe("Maggie didn't check in today.");
  });

  it("counts more than one refill", () => {
    const s = seed();
    setTime(s, "19:30");
    quietDay(s, "18:00");
    for (const id of ["med-metformin", "med-atorvastatin"]) {
      s.meds.find((m) => m.id === id)!.supply = { perDose: 1, pharmacy: "Fog City Pharmacy", count: 6, countedAt: clock(s).toISOString() };
    }
    expect(recap(s).headline).toBe("2 refills to sort out.");
  });

  it("F4-4: gives a refill date only when the refill is really on the Calendar", () => {
    const s = seed();
    setTime(s, "19:30");
    const med = s.meds.find((m) => m.id === "med-metformin")!;
    med.supply = { perDose: 1, pharmacy: "Fog City Pharmacy", count: 8, countedAt: clock(s).toISOString() };
    s.appointments = s.appointments.filter((a) => !(a.kind === "refill" && a.medIds.includes(med.id)));
    expect(recap(s).low.find((l) => l.name === "Metformin")!.on).toBeUndefined();
    evaluate(s);
    expect(recap(s).low.find((l) => l.name === "Metformin")!.on).toBeDefined();
  });

  it("keeps feeling, water and meals out while all sharing is paused, and still sends the update", () => {
    const s = seed();
    s.settings.sharingPaused = true;
    setTime(s, "19:05");
    expect(recap(s).log).toBeUndefined();
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(1);
  });

  it("sends nothing after 11 PM, and catches up when the app first runs later in the evening", () => {
    const s = seed();
    setTime(s, "23:05");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    setTime(s, "21:40");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(1);
  });

  it("F4-3: quiet hours over 7 PM skip the whole evening, even after they end", () => {
    const s = seed();
    s.settings.quietHours = { on: true, start: "19:00", end: "19:30" };
    setTime(s, "19:35");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    s.settings.quietHours = { on: true, start: "19:30", end: "07:00" };
    setTime(s, "19:10");
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(1);
  });

  it("F4-13: a late catch-up never goes out inside quiet hours", () => {
    const s = seed();
    setTime(s, "22:30"); // default quiet hours 22:00 to 07:00
    evaluate(s);
    expect(recapAlerts(s)).toHaveLength(0);
    const t = seed();
    t.settings.quietHours = { on: true, start: "20:00", end: "07:00" };
    setTime(t, "21:00");
    evaluate(t);
    expect(recapAlerts(t)).toHaveLength(0);
  });

  it("refuses James too when he tries to change Sarah's update", () => {
    const s = seed();
    applySettings(s, FAMILY, { recapNotify: false });
    expect(s.settings.recapNotify).toBe(true);
  });

  it("leaves cancelled appointments and revoked caregivers out of tomorrow", () => {
    const s = clearTomorrow(seed());
    setTime(s, "19:00");
    s.appointments.push({ id: "c1", date: tomorrowOf(s), time: "08:00", durationMin: 20, kind: "lab", title: "Cancelled test", provider: "Lab", location: "Lab", medIds: [], status: "cancelled", createdBy: GUARDIAN });
    const day = addDays(clock(s), 1).getDay();
    s.shifts = [{ id: "a", caregiverId: CAREGIVER, days: [day], start: "09:00", end: "12:00", accepted: true }];
    s.members.find((m) => m.id === CAREGIVER)!.status = "revoked";
    expect(recap(s).tomorrow).toBeUndefined();
  });
});
