import type { State, QuietDay } from "./types";
import { audit, allowed, pushAlert } from "./store";
import { clock, currentQuiet, todayOf } from "./selectors";
import { addDays, fmtShortDay, uid, ymd } from "../lib/time";
import { ELDER } from "./demo";

// Sprint 22: quiet days (CC-129). Maggie taps "Resting today" or "Away until…" so her family isn't alarmed. Missed
// check-in prompts, the guardian's missed check-in alert, the 7 PM "nothing logged" nudge and the no-meals note
// pause until the end of that day. Medicine, SOS and late-caregiver alerts never pause. No reason is asked or kept.

/** How far ahead Maggie can say she's away, in days. */
export const QUIET_MAX_DAYS = 14;

/** The last day Maggie can pick for "Away until…". */
export const quietMaxDay = (s: State) => ymd(addDays(clock(s), QUIET_MAX_DAYS));

/** What Sarah and the family see instead of an alert: "Maggie is resting today", "Maggie is away until Fri, Dec 4". */
export function quietLine(s: State, q: QuietDay) {
  if (q.kind === "resting" || q.until === todayOf(s)) return q.kind === "resting" ? "Maggie is resting today" : "Maggie is away today";
  return `Maggie is away until ${fmtShortDay(q.until)}`;
}

/** CC-129: Maggie starts a resting day (today only) or an away period (today until `until`). Only Maggie; audited. */
export function setQuiet(s: State, by: string, kind: QuietDay["kind"], until?: string): QuietDay | null {
  if (by !== ELDER) { audit(s, by, "denied", "set Maggie's resting or away days"); return null; }
  if (!allowed(s, by, "write", "quietDays")) return null;
  const today = todayOf(s);
  const last = kind === "resting" ? today : until;
  if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last) || last < today || last > quietMaxDay(s)) return null;
  const now = clock(s).toISOString();
  // A new choice replaces one that is still on.
  const on = currentQuiet(s);
  if (on) on.endedAt = now;
  const q: QuietDay = { id: uid("quiet"), kind, from: today, until: last, by, at: now };
  s.quietDays = [...(s.quietDays ?? []), q];
  audit(s, by, "created", kind === "resting" ? "a resting day" : "away days");
  pushAlert(s, {
    key: `quiet-${q.id}`, to: ["guardian"], severity: "info", title: "Update from Circle Care",
    detail: `${quietLine(s, q)}. Check-in reminders are paused${kind === "resting" || last === today ? " until tonight" : ""}. Medicine and SOS alerts still come to you.`,
    link: "/app/guardian",
  });
  return q;
}

/** CC-129: Maggie is back. Check-ins count again from her next window. Only Maggie. */
export function endQuiet(s: State, by: string) {
  const q = currentQuiet(s);
  if (!q) return false;
  if (by !== ELDER) { audit(s, by, "denied", "end Maggie's resting or away days"); return false; }
  q.endedAt = clock(s).toISOString();
  audit(s, by, "updated", q.kind === "resting" ? "resting day ended" : "away days ended (I'm back)");
  pushAlert(s, { key: `quiet-back-${q.id}`, to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: "Maggie says she's back. Check-in reminders are on again from her next check-in.", link: "/app/guardian" });
  return true;
}
