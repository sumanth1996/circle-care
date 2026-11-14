import type { State, Persona, Feeling, Meal } from "./types";
import { audit, pushAlert, allowed } from "./store";
import { clock, nameOf, todayOf } from "./selectors";
import { unitsPerDose, dailyLogFor, dailyShared } from "./everyday";
import { ELDER } from "./demo";

// Sprint 12 "Everyday Care" state changes. Each one checks the permission matrix first
// (refusals are audited and change nothing), so the store, the tests and a future API share them.

/** CC-120: a new bottle resets the count; the refill is logged on the medicine's history. */
export function recordRefill(s: State, by: string, medId: string, count: number) {
  if (!allowed(s, by, "write", "supply")) return;
  const med = s.meds.find((m) => m.id === medId);
  if (!med || !Number.isFinite(count) || count <= 0 || count > 1000) return;
  const at = clock(s).toISOString();
  const n = Math.round(count);
  med.supply = { perDose: unitsPerDose(med), pharmacy: med.supply?.pharmacy, count: n, countedAt: at, bottleId: `b-${at}` };
  med.history.push({ at, by, change: `New bottle: ${n} on hand` });
  // The automatic refill entry for the old bottle is no longer needed.
  for (const a of s.appointments) if (a.id.startsWith(`appt-auto-${med.id}-`) && a.status === "scheduled") a.status = "done";
  audit(s, by, "updated", `pill count for ${med.name}`);
}

/** CC-121: someone asked the pharmacy; no more low-supply reminders for this bottle. */
export function requestRefill(s: State, by: string, medId: string) {
  if (!allowed(s, by, "write", "supply")) return;
  const med = s.meds.find((m) => m.id === medId);
  if (!med?.supply || med.supply.requestedAt) return;
  const at = clock(s).toISOString();
  med.supply.requestedAt = at;
  med.supply.requestedBy = by;
  const pharmacy = med.supply.pharmacy ?? "the pharmacy";
  med.history.push({ at, by, change: `Refill requested from ${pharmacy}` });
  audit(s, by, "updated", `refill request for ${med.name}`);
  const to = (["guardian", "caregiver"] as Persona[]).filter((p) => p !== s.persona);
  pushAlert(s, { to, severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, by)} asked ${pharmacy} to refill ${med.name}.`, link: "/app/guardian/meds" });
}

export type DailyPatch = { feeling?: Feeling | null; water?: number; waterBy?: number; meal?: Meal };

/** CC-142: Maggie's one-tap check-ins save as she taps. Tapping the same face again clears it. Skipping sends nothing. */
export function logDaily(s: State, by: string, patch: DailyPatch) {
  if (!allowed(s, by, "write", "wellbeing")) return;
  const today = todayOf(s);
  const at = clock(s).toISOString();
  const cur = dailyLogFor(s, today);
  const next = { ...cur, meals: [...cur.meals], updatedAt: at };
  if (patch.feeling !== undefined) {
    next.feeling = patch.feeling ?? undefined;
    next.feelingAt = patch.feeling ? at : undefined;
  }
  // waterBy adds to what's saved now, so a fast double tap or a stale screen never loses a glass.
  const water = patch.waterBy !== undefined ? cur.water + patch.waterBy : patch.water;
  if (water !== undefined && Number.isFinite(water)) next.water = Math.max(0, Math.min(20, Math.round(water)));
  // A day she starts while not sharing stays private, even if she turns sharing on later.
  if (cur.private || !dailyShared(s)) next.private = true;
  if (patch.meal) next.meals = next.meals.includes(patch.meal) ? next.meals.filter((m) => m !== patch.meal) : [...next.meals, patch.meal];
  s.dailyLogs = [...s.dailyLogs.filter((l) => l.date !== today), next];
}

/** CC-143: only Maggie decides whether Sarah sees her feeling, water and meals. */
export function setDailySharing(s: State, by: string, on: boolean) {
  if (by !== ELDER) { audit(s, by, "denied", "change check-in sharing"); return; }
  if (s.settings.dailyLog.shareWithGuardian === on) return;
  s.settings.dailyLog.shareWithGuardian = on;
  audit(s, ELDER, "updated", on ? "check-in sharing (on)" : "check-in sharing (off)");
  pushAlert(s, {
    to: ["guardian"], severity: "info", title: "Update from Circle Care",
    detail: !on ? "Maggie stopped sharing her feeling, water and meal check-ins. Her “I'm OK” check-in works as before."
      : s.settings.sharingPaused ? "Maggie will share her daily check-ins with you once she resumes sharing."
      : "Maggie is sharing her daily check-ins with you again. Days she logged privately stay private.",
  });
}
