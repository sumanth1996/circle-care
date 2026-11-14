import type { State, Persona } from "./types";
import { audit, pushAlert, allowed } from "./store";
import { clock, nameOf } from "./selectors";

// Sprint 12 "Everyday Care" state changes. Each one checks the permission matrix first
// (refusals are audited and change nothing), so the store, the tests and a future API share them.

/** CC-120: a new bottle resets the count; the refill is logged on the medicine's history. */
export function recordRefill(s: State, by: string, medId: string, count: number) {
  if (!allowed(s, by, "write", "supply")) return;
  const med = s.meds.find((m) => m.id === medId);
  if (!med || !Number.isFinite(count) || count <= 0 || count > 1000) return;
  const at = clock(s).toISOString();
  const n = Math.round(count);
  med.supply = { perDose: med.supply?.perDose ?? 1, pharmacy: med.supply?.pharmacy, count: n, countedAt: at };
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
