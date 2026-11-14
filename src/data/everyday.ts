import type { State, Medication } from "./types";
import { clock, todayOf } from "./selectors";
import { ymd, addDays } from "../lib/time";

// Sprint 12 "Everyday Care": the small things a family checks every day. This file starts with the refill tracker.
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
