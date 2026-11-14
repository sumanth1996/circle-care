import type { State, Medication } from "./types";
import { clock } from "./selectors";
import { ymd, addDays } from "../lib/time";

// Sprint 12 "Everyday Care": the small things a family checks every day. This file starts with the refill tracker.
// Pure functions so the rules engine, the screens and the tests share one answer.

/* ---------------- CC-120 – CC-121: pills on hand and refills ---------------- */

/** Pills left: the count from the last bottle, minus every dose taken since. Skipped or refused doses don't use a pill. */
export function pillsLeft(s: State, med: Medication) {
  if (!med.supply) return undefined;
  const taken = s.doses.filter((d) => d.medId === med.id && d.status === "taken" && d.at >= med.supply!.countedAt).length;
  return Math.max(0, med.supply.count - taken * med.supply.perDose);
}

/** Whole days of medicine left at the current schedule. */
export function daysLeft(s: State, med: Medication) {
  const left = pillsLeft(s, med);
  if (left === undefined || med.paused || med.times.length === 0) return undefined;
  return Math.floor(left / (med.times.length * (med.supply?.perDose ?? 1)));
}

/** The day the bottle runs out, and the day the refill goes on the Calendar: 3 days before that (never in the past). */
export function refillPlan(s: State, med: Medication) {
  const days = daysLeft(s, med);
  if (days === undefined) return undefined;
  const now = clock(s);
  const runsOut = ymd(addDays(now, days));
  const refillOn = ymd(addDays(now, Math.max(0, days - 3)));
  return { days, runsOut, refillOn };
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
  return s.meds.filter((m) => supplyState(s, m) === "low").map((m) => ({ med: m, ...refillPlan(s, m)! }));
}

/** Stable id of the Calendar entry a bottle creates, so the rule never adds it twice. */
export const autoRefillId = (med: Medication) => `appt-auto-${med.id}-${med.supply?.countedAt.slice(0, 16) ?? "none"}`;
