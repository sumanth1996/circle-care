import type { State, Medication, DailyLog, Feeling, Meal } from "./types";
import { clock, todayOf } from "./selectors";
import { can } from "./policy";
import { GUARDIAN } from "./demo";
import { ymd, addDays, toMin, minutesOfDay } from "../lib/time";

// Sprint 12 "Everyday Care": the small things a family checks every day. This file has the refill tracker and the daily check-ins.
// Pure functions so the rules engine, the screens and the tests share one answer.

/* ---------------- CC-120 – CC-121: pills on hand and refills ---------------- */

/** Pills used by one dose, read from the dose text ("2 tablets" uses 2, "1/2 tablet" uses 0.5). */
export function unitsPerDose(med: Medication) {
  const dose = med.dose.trim().replace(/^½/, "1/2").replace(/^¼/, "1/4").replace(/^¾/, "3/4");
  const frac = dose.match(/^(\d+)\s*\/\s*(\d+)/);
  const n = frac ? Number(frac[1]) / Number(frac[2]) : parseFloat(dose);
  return Number.isFinite(n) && n >= 0.25 && n <= 10 ? n : 1;
}

/**
 * When the dose amount changes mid-bottle, start a fresh count from what is left now,
 * so past doses keep the amount they used and future doses use the new one.
 */
export function rebaseSupply(s: State, before: Medication, after: Medication): Medication {
  if (!before.supply || before.dose === after.dose) return after;
  return { ...after, supply: { ...before.supply, bottleId: bottleOf(before), count: pillsLeft(s, before)!, countedAt: clock(s).toISOString(), perDose: unitsPerDose(after) } };
}

/** Pills left: the count from the last bottle, minus every dose taken since. Skipped or refused doses don't use a pill. */
export function pillsLeft(s: State, med: Medication) {
  if (!med.supply) return undefined;
  const taken = s.doses.filter((d) => d.medId === med.id && d.status === "taken" && d.at >= med.supply!.countedAt).length;
  // Past doses used the amount saved with the count, not today's dose text.
  return Math.max(0, med.supply.count - taken * med.supply.perDose);
}

/** Today's doses that nobody has marked yet. They still need pills, whatever the time of day. */
function dosesStillDueToday(s: State, med: Medication) {
  const today = todayOf(s);
  return med.times.filter((t) => !s.doses.some((d) => d.medId === med.id && d.date === today && d.time === t)).length;
}

/**
 * Whole days of medicine left after today's remaining doses. The same bottle gives the same answer
 * at 7 AM and at 8 PM: doses still due today are set aside first.
 */
export function daysLeft(s: State, med: Medication) {
  const left = pillsLeft(s, med);
  if (left === undefined || med.paused || med.times.length === 0) return undefined;
  const per = unitsPerDose(med);
  const afterToday = left - dosesStillDueToday(s, med) * per;
  if (afterToday <= 0) return 0;
  return Math.floor(afterToday / (med.times.length * per));
}

/** The last day with every dose covered, and the day the refill goes on the Calendar: 3 days before that (never in the past). */
export function refillPlan(s: State, med: Medication) {
  const days = daysLeft(s, med);
  if (days === undefined) return undefined;
  const now = clock(s);
  const runsOut = ymd(addDays(now, days));
  const refillOn = ymd(addDays(now, Math.max(0, days - 3)));
  return { days, runsOut, refillOn };
}

/** An approved change request was made against an older copy of the medicine: keep today's pill count. */
export const withCurrentSupply = (proposed: Medication, current: Medication): Medication => ({ ...proposed, supply: current.supply });

/** The earliest refill already on the Calendar for this medicine, from today on. */
export function scheduledRefill(s: State, med: Medication) {
  const today = todayOf(s);
  return s.appointments
    .filter((a) => a.kind === "refill" && a.status === "scheduled" && a.medIds.includes(med.id) && a.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}

export type SupplyState = "ok" | "low" | "requested" | "untracked" | "paused";
export function supplyState(s: State, med: Medication): SupplyState {
  if (med.paused) return "paused";
  const days = daysLeft(s, med);
  if (days === undefined) return "untracked";
  if (med.supply?.requestedAt) return "requested";
  return days <= s.settings.refillAlertDays ? "low" : "ok";
}

/** Medicines at or under the alert threshold that nobody has asked the pharmacy about yet. */
export function lowSupply(s: State) {
  return s.meds.filter((m) => supplyState(s, m) === "low").map((m) => {
    const plan = refillPlan(s, m)!;
    // What the screens show: the refill that is really on the Calendar, if there is one.
    return { med: m, ...plan, calendarOn: scheduledRefill(s, m)?.date };
  });
}

/** The bottle a count belongs to: set by a new bottle, kept when only the dose changes. */
export const bottleOf = (med: Medication) => med.supply?.bottleId ?? med.supply?.countedAt ?? "none";

/** Stable id of the Calendar entry a bottle creates, so the rule never adds it twice. */
export const autoRefillId = (med: Medication) => `appt-auto-${med.id}-${bottleOf(med)}`;

/* ---------------- CC-142 – CC-143: feeling, water and meals ---------------- */

/** Six drawn faces, no emoji. Valence feeds the guardian's mood trend in Health. */
export const FEELINGS: { key: Feeling; label: string; valence: number }[] = [
  { key: "great", label: "Great", valence: 2 },
  { key: "good", label: "Good", valence: 1 },
  { key: "calm", label: "Calm", valence: 1 },
  { key: "okay", label: "Okay", valence: 0 },
  { key: "uneasy", label: "Not great", valence: -1 },
  { key: "low", label: "Low", valence: -2 },
];
export const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];
export const feelingOf = (k?: Feeling) => FEELINGS.find((f) => f.key === k);

/** The day's log, or an empty one when Maggie hasn't added anything. */
export function dailyLogFor(s: State, date = todayOf(s)): DailyLog {
  return s.dailyLogs.find((l) => l.date === date) ?? { date, water: 0, meals: [], updatedAt: "" };
}

/** True when Maggie has added anything today. */
export const hasLoggedToday = (s: State) => {
  const l = dailyLogFor(s);
  return !!l.feeling || l.water > 0 || l.meals.length > 0;
};

/** Seven days ending on `endDate` (oldest first), for the guardian's Well-being view. */
export function dailyWeek(s: State, endDate = todayOf(s)) {
  return Array.from({ length: 7 }, (_, i) => dailyLogFor(s, ymd(addDays(new Date(`${endDate}T12:00:00`), i - 6))));
}

/** Can Sarah see the check-ins right now? Maggie decides (CC-143); the permission matrix is the one answer. */
export const dailyShared = (s: State) => can(s, GUARDIAN, "read", "wellbeing");

/** What Sarah may see of one day: nothing while not shared, and nothing from a day Maggie logged privately. */
export function sharedLogFor(s: State, date = todayOf(s)): DailyLog | undefined {
  if (!dailyShared(s)) return undefined;
  const l = dailyLogFor(s, date);
  return l.private ? NOT_SHARED(date) : l;
}

/** A day Sarah may not see: no counts at all, only the mark that it isn't shared. (Review F2-12.) */
const NOT_SHARED = (date: string): DailyLog => ({ date, water: 0, meals: [], updatedAt: "", private: true });

/** The guardian's seven days: private days read as blank. */
export const sharedWeek = (s: State, endDate = todayOf(s)) => dailyWeek(s, endDate).map((l) => (l.private ? NOT_SHARED(l.date) : l));

/**
 * CC-143: no meals logged yesterday or the day before, on days Sarah can see, from someone who does use
 * the meal check-ins (at least one meal in the five days before). Only from 9 AM, never overnight.
 * A private day counts as unknown, so it never triggers the note. (Review F2-3.)
 * So does any day Sarah couldn't see because sharing was off or paused for part of it. (Review F2-11.)
 */
export function mealsGap(s: State) {
  const now = clock(s);
  if (minutesOfDay(now) < toMin("09:00")) return false;
  const since = s.settings.dailyLog.sharedSince;
  if (since && new Date(since) > new Date(`${ymd(addDays(now, -2))}T00:00:00`)) return false;
  const day = (d: number) => dailyLogFor(s, ymd(addDays(now, -d)));
  const recent = [1, 2].map(day);
  if (recent.some((l) => l.private || l.meals.length > 0)) return false;
  return [3, 4, 5, 6, 7].map(day).some((l) => !l.private && l.meals.length > 0);
}

/** Older "I'm OK" check-ins carried a face; map it onto the same six feelings so the trend reads one way. */
const LEGACY_FACE: Record<string, Feeling> = { "\u{1F60A}": "great", "\u{1F642}": "good", "\u{1F60C}": "calm", "\u{1F610}": "okay", "\u{1F615}": "uneasy", "\u{1F622}": "low" };

/** CC-143: Sarah's feeling for a day: the face Maggie tapped, else an older check-in face, only while shared. */
export function sharedFeeling(s: State, date: string): { state: "shared"; feeling: (typeof FEELINGS)[number] } | { state: "none" | "private" } {
  if (!dailyShared(s) || dailyLogFor(s, date).private) return { state: "private" };
  const l = dailyLogFor(s, date);
  const key = l.feeling ?? LEGACY_FACE[s.checkins.find((c) => c.date === date)?.mood ?? ""];
  const f = feelingOf(key);
  return f ? { state: "shared", feeling: f } : { state: "none" };
}
