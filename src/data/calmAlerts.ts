import type { State, Alert, Persona, DoseStatus, DoseReminder } from "./types";
import { audit, pushAlert, allowed } from "./store";
import { clock, dosesFor, nameOf, todayOf, yesterdayOf, overnightDoses } from "./selectors";
import { inQuietHours } from "./everyday";
import { at as atTime, fmtTime, hm, minutesOfDay, toMin } from "../lib/time";

// Sprint 16 "Calm alerts & all-clear" (CC-206 – CC-208). Plain functions on the state, so the store,
// the tests and a future API share them. In production the same rules run on the server's scheduler.

/** CC-207: minutes between reminders, and after a snooze. */
export const REMINDER_GAP_MIN = 10;
export const SNOOZE_MIN = 15;
export const REMINDER_DEFAULT = 3;

/** Sarah's choice of 1 to 5 reminders per dose (default 3). */
export function reminderLimit(s: State) {
  const n = Math.round(s.settings.reminderRepeats ?? REMINDER_DEFAULT);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : REMINDER_DEFAULT;
}

const remKey = (date: string, key: string, n: number) => `dose-rem-${date}-${key}-${n}`;
const missedKeys = (date: string, key: string) => [`dose-cg-${date}-${key}`, `dose-g-${date}-${key}`];

/** Today's reminder record for one dose slot, if its reminders have started. */
export function reminderFor(s: State, key: string): DoseReminder | undefined {
  return (s.reminders ?? []).find((r) => r.date === todayOf(s) && r.key === key);
}

/**
 * CC-207: Maggie's dose reminders. The first comes at the dose time, then one every 10 minutes
 * (15 after a snooze) until the limit; then they stop. Missed-dose alerts to Ana and Sarah keep
 * their own timers (CC-42, CC-43), so stopping reminders never delays them.
 * CC-199: a late-evening dose's reminders carry on past midnight while its escalation is still running,
 * or while its next reminder is due after midnight. Earlier reminders and days are dropped.
 */
export function runReminders(s: State) {
  const now = clock(s);
  const today = todayOf(s);
  const yesterday = yesterdayOf(s);
  const nowMin = minutesOfDay(now);
  const midnight = atTime(today, "00:00").getTime();
  const overnight = overnightDoses(s).map((d) => d.key);
  s.reminders = (s.reminders ?? []).filter((r) => r.date === today
    || (r.date === yesterday && (overnight.includes(r.key) || (r.sent < r.limit && new Date(r.nextAt).getTime() >= midnight))));
  const fromYesterday = dosesFor(s, yesterday).filter((d) => overnight.includes(d.key) || s.reminders.some((r) => r.date === yesterday && r.key === d.key));
  for (const d of [...fromYesterday, ...dosesFor(s)]) {
    if (d.log || (d.date === today && toMin(d.time) > nowMin)) continue;
    let r = s.reminders.find((x) => x.date === d.date && x.key === d.key);
    if (!r) {
      // The limit is fixed when a dose's reminders start, so a new setting applies from the next dose.
      r = { date: d.date, key: d.key, limit: reminderLimit(s), sent: 0, nextAt: atTime(d.date, d.time).toISOString() };
      s.reminders.push(r);
    }
    while (r.sent < r.limit && now.getTime() >= new Date(r.nextAt).getTime()) {
      r.sent += 1;
      pushAlert(s, {
        key: remKey(d.date, d.key, r.sent), to: ["elder"], severity: "info",
        title: "You have a reminder from Circle Care",
        detail: `Reminder ${r.sent} of ${r.limit}. Time for ${d.med.name}, ${d.med.dose}. ${d.med.instructions}`, link: "/app/elder/next",
      }, r.nextAt);
      r.nextAt = new Date(new Date(r.nextAt).getTime() + REMINDER_GAP_MIN * 60000).toISOString();
      r.snoozed = false;
    }
  }
}

/** CC-207: Snooze puts the next reminder 15 minutes away. It still counts toward the limit. */
export function snoozeReminder(s: State, by: string, medId: string, time: string) {
  if (!allowed(s, by, "write", "doses")) return false;
  const r = reminderFor(s, `${medId}@${time}`);
  if (!r || r.sent >= r.limit) return false;
  r.nextAt = new Date(clock(s).getTime() + SNOOZE_MIN * 60000).toISOString();
  r.snoozed = true;
  audit(s, by, "updated", "a dose reminder (snoozed 15 minutes)");
  return true;
}

/**
 * CC-206: settle a dose's reminders and missed-dose alerts once someone marks it.
 * Taken: each person who got a missed-dose alert gets an all-clear that names no medicine.
 * Skipped or refused: the alert shows that, who marked it and why, and no all-clear goes out.
 * `date` is the day the dose was due, so a dose due before midnight settles the same way after it (CC-199).
 */
export function settleDose(s: State, by: string, medId: string, time: string, status: DoseStatus, reason?: string, date = todayOf(s)) {
  const key = `${medId}@${time}`;
  const at = clock(s).toISOString();
  const resolution = { at, by, outcome: status, ...(reason ? { reason } : {}) };

  // Maggie's repeat reminder clears from her screen, and no more come (criterion 5).
  for (const a of s.alerts) {
    if (!a.key?.startsWith(`dose-rem-${date}-${key}-`)) continue;
    if (!a.read.includes("elder")) a.read.push("elder");
    a.resolved ??= resolution;
  }
  s.reminders = (s.reminders ?? []).filter((r) => !(r.date === date && r.key === key));

  const missed = s.alerts.filter((a) => a.key && missedKeys(date, key).includes(a.key) && !a.resolved);
  if (!missed.length) return; // No alert went out, so there's nothing to clear (criterion 2).
  for (const a of missed) a.resolved = resolution;
  audit(s, by, "updated", `a missed-dose alert (${status === "taken" ? "resolved: taken" : `resolved: ${status}`})`);
  if (status !== "taken") return;

  // While Maggie has paused sharing, only people who may still see doses get it (criterion 6).
  const to = [...new Set(missed.flatMap((a) => a.to))].filter((p) => p !== "caregiver" || !s.settings.sharingPaused);
  if (!to.length) return;
  pushAlert(s, {
    key: `dose-clear-${date}-${key}`, to, severity: "info",
    title: "Update from Circle Care",
    detail: `All clear: the ${fmtTime(time)} dose was taken at ${fmtTime(hm(clock(s)))}.`,
    link: to.includes("guardian") ? "/app/guardian" : "/app/caregiver",
  });
}

/** CC-208: SOS, falls, high-priority medicines, warning-sign answers and security notices always come at once. */
export function isUrgent(a: Pick<Alert, "severity" | "urgent">) {
  return a.severity === "critical" || a.urgent === true;
}

/**
 * CC-208: who an alert waits for. Quiet hours are Sarah's, so only her non-urgent alerts wait.
 * Off by default for a new circle; when off, everything is delivered at once.
 */
export function heldFor(s: State, a: Pick<Alert, "to" | "severity" | "urgent">): Persona[] {
  if (!s.settings.quietHours.on || isUrgent(a) || !a.to.includes("guardian")) return [];
  return inQuietHours(s.settings.quietHours, minutesOfDay(clock(s))) ? ["guardian"] : [];
}

/** CC-208: when quiet hours end, what waited overnight goes out as one summary. Nothing held, no summary. */
export function releaseHeld(s: State) {
  const held = s.alerts.filter((a) => a.held?.includes("guardian"));
  if (!held.length || inQuietHours(s.settings.quietHours, minutesOfDay(clock(s)))) return;
  held.sort((a, b) => a.at.localeCompare(b.at));
  for (const a of held) {
    a.held = a.held!.filter((p) => p !== "guardian");
    if (!a.held.length) delete a.held;
  }
  const n = held.length;
  pushAlert(s, {
    key: `quiet-summary-${held[0].id}`, to: ["guardian"], severity: "info",
    title: "Update from Circle Care",
    detail: `Overnight summary: ${n} ${n === 1 ? "update" : "updates"} waited for your quiet hours to end.`,
    items: held.map((a) => `${fmtTime(hm(new Date(a.at)))}: ${a.detail}`),
    link: "/app/guardian/alerts",
  });
}

/** How a settled alert reads in the app. */
export function resolutionText(s: State, a: Alert) {
  const r = a.resolved;
  if (!r) return undefined;
  const when = fmtTime(hm(new Date(r.at)));
  if (r.outcome === "taken") return `Resolved: marked taken at ${when} by ${nameOf(s, r.by)}.`;
  const word = r.outcome === "skipped" ? "Skipped" : "Refused";
  return `${word}: marked by ${nameOf(s, r.by)} at ${when}${r.reason ? `. Reason: ${r.reason}` : ""}.`;
}

/** The elder's open reminder for a dose, for "Reminder 2 of 3" and Snooze on her screen. */
export function reminderState(s: State, medId: string, time: string) {
  const r = reminderFor(s, `${medId}@${time}`);
  if (!r || r.sent === 0) return undefined;
  return { sent: r.sent, limit: r.limit, canSnooze: r.sent < r.limit, snoozed: !!r.snoozed, nextAt: r.nextAt };
}
