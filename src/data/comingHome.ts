import type { State, ComingHome, PlanItem, PlanItemKind, HelpRequest } from "./types";
import { audit, pushAlert, allowed } from "./store";
import { can } from "./policy";
import { clock, nameOf, todayOf, personaOf } from "./selectors";
import { addDays, at as atTime, fmtShortDay, minutesOfDay, toMin, uid, ymd } from "../lib/time";
import { inQuietHours } from "./everyday";
import { ELDER, GUARDIAN } from "./demo";
import { helpCandidates, helpLabel } from "./help";

// Sprint 17 "Coming Home" (CC-213, CC-214). Sarah's plan for the first days after Maggie leaves hospital.
// The plan never asks why Maggie was in hospital. Each item Sarah gives to someone becomes a help request on
// their board, so they see only that item. Maggie and Sarah see the whole plan.

export const PLAN_ITEM_MAX = 120;
/** CC-214: the first follow-up visit should be booked within this many days of coming home, unless Sarah changes it. */
export const FOLLOW_UP_DAYS = 7;
export const FOLLOW_UP_CHOICES = [7, 14, 21, 30];
/** CC-214: the daily reminder goes out at 9 AM, never in Sarah's quiet hours. */
export const FOLLOW_UP_REMIND_AT = "09:00";
/** CC-213: the plan becomes read-only this long after the coming-home day. */
export const PLAN_ARCHIVE_DAYS = 30;

const DEFAULT_ITEMS: { kind: PlanItemKind; title: string }[] = [
  { kind: "meds", title: "Pick up medicines" },
  { kind: "followup", title: "Book a follow-up visit" },
  { kind: "home", title: "Get the home ready" },
  { kind: "night", title: "Stay the first night" },
];

/** The plan Sarah is working on: the newest one that isn't archived. */
export function activePlan(s: State): ComingHome | undefined {
  return [...(s.plans ?? [])].reverse().find((p) => !p.archived);
}

/** Maggie and Sarah see plans; everyone else sees only the items given to them, on their Help board. */
export function canSeePlan(s: State, viewerId: string) {
  return (viewerId === ELDER || viewerId === GUARDIAN) && can(s, viewerId, "read", "plan");
}

function editable(s: State, by: string, planId: string) {
  const p = (s.plans ?? []).find((x) => x.id === planId);
  if (!p || p.archived) return undefined;
  if (!allowed(s, by, "write", "plan")) return undefined;
  return p;
}

/** CC-213: "Maggie's coming home". Sarah picks the day; the plan starts with four items she can change. */
export function startPlan(s: State, by: string, date: string): ComingHome | null {
  if (!allowed(s, by, "write", "plan")) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(atTime(date, "00:00").getTime())) return null;
  const current = activePlan(s);
  if (current) {
    current.date = date;
    current.remindedUnassigned = false;
    audit(s, by, "updated", "the coming-home plan (date)");
    for (const it of current.items) syncItem(s, current, it);
    return current;
  }
  const p: ComingHome = {
    id: uid("plan"), date, by, at: clock(s).toISOString(), followUpDays: FOLLOW_UP_DAYS, followUpReminded: [],
    items: DEFAULT_ITEMS.map((d) => ({ id: uid("pi"), kind: d.kind, title: d.title })),
  };
  s.plans = [...(s.plans ?? []), p];
  audit(s, by, "created", "a coming-home plan");
  return p;
}

const help = (s: State, it: PlanItem) => (it.helpId ? (s.help ?? []).find((r) => r.id === it.helpId) : undefined);

/** Keep an item's help request in step with the item's name and the plan's day. */
function syncItem(s: State, p: ComingHome, it: PlanItem) {
  const r = help(s, it);
  if (r && (r.status === "open" || r.status === "claimed")) { r.title = it.title; r.date = p.date; r.rev += 1; }
}

function cancelItemHelp(s: State, by: string, it: PlanItem) {
  const r = help(s, it);
  if (r && (r.status === "open" || r.status === "claimed")) {
    r.status = "cancelled";
    r.closedAt = clock(s).toISOString();
    r.rev += 1;
    r.history.push({ at: clock(s).toISOString(), by, change: "Cancelled" });
  }
  it.helpId = undefined;
  it.assignee = undefined;
}

export function renameItem(s: State, by: string, planId: string, itemId: string, title: string) {
  const p = editable(s, by, planId);
  const it = p?.items.find((x) => x.id === itemId);
  const t = title.trim().slice(0, PLAN_ITEM_MAX);
  if (!p || !it || !t) return false;
  it.title = t;
  syncItem(s, p, it);
  audit(s, by, "updated", "a coming-home plan item");
  return true;
}

export function addItem(s: State, by: string, planId: string, title: string) {
  const p = editable(s, by, planId);
  const t = title.trim().slice(0, PLAN_ITEM_MAX);
  if (!p || !t) return null;
  const it: PlanItem = { id: uid("pi"), kind: "custom", title: t };
  p.items.push(it);
  audit(s, by, "created", "a coming-home plan item");
  return it;
}

export function removeItem(s: State, by: string, planId: string, itemId: string) {
  const p = editable(s, by, planId);
  const it = p?.items.find((x) => x.id === itemId);
  if (!p || !it) return false;
  cancelItemHelp(s, by, it);
  p.items = p.items.filter((x) => x.id !== itemId);
  audit(s, by, "removed", "a coming-home plan item");
  return true;
}

/** People Sarah can give an item to: herself, or anyone she could post a help request to. */
export function planPeople(s: State) {
  return [GUARDIAN, ...helpCandidates(s).map((m) => m.id)];
}

/**
 * CC-213: give an item to someone. For anyone but Sarah it becomes a help request on their board, for the
 * coming-home day, and they're told. Giving it to someone else cancels the earlier request. `null` takes it back.
 */
export function assignItem(s: State, by: string, planId: string, itemId: string, personId: string | null) {
  const p = editable(s, by, planId);
  const it = p?.items.find((x) => x.id === itemId);
  if (!p || !it) return false;
  if (personId && !planPeople(s).includes(personId)) return false;
  if ((it.assignee ?? null) === personId) return true;
  cancelItemHelp(s, by, it);
  if (!personId) { audit(s, by, "updated", "a coming-home plan item (taken back)"); return true; }
  it.assignee = personId;
  if (personId !== GUARDIAN) {
    const now = clock(s).toISOString();
    const r: HelpRequest = {
      id: uid("help"), kind: "other", title: it.title, note: "", date: p.date, time: "12:00", anyTime: true, planItemId: it.id,
      audience: [personId], by, at: now, status: "open", rev: 1, history: [{ at: now, by, change: "Posted" }],
    };
    s.help = [...(s.help ?? []), r];
    it.helpId = r.id;
    const persona = personaOf(personId);
    if (persona && can(s, personId, "read", "help")) pushAlert(s, { key: `help-new-${r.id}`, to: [persona], severity: "info", title: "New help request in Circle Care", detail: `${nameOf(s, by)} asked for help: ${helpLabel(r)}, ${fmtShortDay(p.date)}.`, link: "/app/help" });
  }
  audit(s, by, "updated", "a coming-home plan item (given to someone)");
  return true;
}

/** CC-214: Sarah changes how soon the first follow-up visit should be. */
export function setFollowUpDays(s: State, by: string, planId: string, days: number) {
  const p = editable(s, by, planId);
  if (!p || !FOLLOW_UP_CHOICES.includes(days)) return false;
  p.followUpDays = days;
  audit(s, by, "updated", "the coming-home plan (follow-up window)");
  return true;
}

/** The last day the follow-up visit counts for. */
export const followUpEnd = (p: ComingHome) => ymd(addDays(atTime(p.date, "12:00"), p.followUpDays));

/** CC-214: the doctor visit booked in the window, if there is one. Only Maggie and Sarah see its details. */
export function followUpBooked(s: State, p: ComingHome) {
  const end = followUpEnd(p);
  return s.appointments
    .filter((a) => a.kind === "doctor" && a.status !== "cancelled" && a.date >= p.date && a.date <= end)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}

export type ItemState = { label: string; tone: "done" | "waiting" | "open" };

/** How one item stands, for the plan screen. */
export function itemState(s: State, p: ComingHome, it: PlanItem): ItemState {
  if (it.kind === "followup") {
    const appt = followUpBooked(s, p);
    if (appt) return { label: `Booked: ${fmtShortDay(appt.date)}`, tone: "done" };
    if (!it.assignee) return { label: "Not booked yet", tone: "open" };
  }
  if (!it.assignee) return { label: "No one yet", tone: "open" };
  const who = s.members.find((m) => m.id === it.assignee)?.short ?? nameOf(s, it.assignee);
  if (it.assignee === GUARDIAN) return { label: it.kind === "followup" ? "You have this. Not booked yet" : "You have this", tone: "waiting" };
  const r = help(s, it);
  if (r?.status === "done") return { label: `${who} did this`, tone: "done" };
  if (r?.status === "claimed") return { label: `${who} has this`, tone: "waiting" };
  return { label: `Given to ${who}, waiting for a yes`, tone: "waiting" };
}

/**
 * Scheduler step, run with the rules engine.
 * - CC-213: a day before Maggie comes home, Sarah is told once if anything has nobody yet.
 * - CC-214: while no follow-up visit is booked, Sarah is reminded each day at 9 AM, never in her quiet hours,
 *   until the window ends. Booking one stops it.
 * - CC-213: 30 days after the coming-home day the plan becomes read-only.
 */
export function runPlans(s: State) {
  const now = clock(s);
  const today = todayOf(s);
  for (const p of s.plans ?? []) {
    if (p.archived) continue;
    if (today > ymd(addDays(atTime(p.date, "12:00"), PLAN_ARCHIVE_DAYS))) {
      p.archived = true;
      audit(s, "system", "updated", "a coming-home plan (archived)");
      continue;
    }
    const dayBefore = ymd(addDays(atTime(p.date, "12:00"), -1));
    const open = p.items.filter((it) => !it.assignee && !(it.kind === "followup" && followUpBooked(s, p)));
    if (!p.remindedUnassigned && open.length && today >= dayBefore && today <= p.date) {
      p.remindedUnassigned = true;
      pushAlert(s, { key: `plan-open-${p.id}-${p.date}`, to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `${open.length === 1 ? "1 item" : `${open.length} items`} in Maggie's coming-home plan ${open.length === 1 ? "has" : "have"} no one yet.`, link: "/app/guardian/coming-home" });
    }
    const follow = p.items.find((it) => it.kind === "followup");
    if (!follow || followUpBooked(s, p) || today > followUpEnd(p) || p.followUpReminded.includes(today)) continue;
    const nowMin = minutesOfDay(now);
    if (nowMin < toMin(FOLLOW_UP_REMIND_AT) || inQuietHours(s.settings.quietHours, nowMin)) continue;
    p.followUpReminded = [...p.followUpReminded, today];
    pushAlert(s, { key: `plan-follow-${p.id}-${today}`, to: ["guardian"], severity: "info", title: "You have a reminder from Circle Care", detail: `Maggie's first follow-up visit isn't booked yet. It should be by ${fmtShortDay(followUpEnd(p))}.`, link: "/app/guardian/coming-home" });
  }
}

