import type { State, Alert, Away, Persona } from "./types";
import type { Resource } from "./policy";
import { audit, allowed, pushAlert } from "./store";
import { can } from "./policy";
import { clock, nameOf, personaOf, todayOf } from "./selectors";
import { addDays, fmtShortDay, uid, ymd } from "../lib/time";
import { ELDER, GUARDIAN } from "./demo";

// Sprint 20: away mode (CC-229 – CC-231). Sarah says she's away from a date to a date and asks a family member
// to cover. Once they accept, from the start date the alerts Sarah would get, and that their own role can see,
// go to them instead, and they take Sarah's place in the SOS order and the missed-dose chain. When the dates end
// (or Sarah taps I'm back) everything comes back to her, with one summary, and the backup is thanked.
// Covering never widens what the backup can see: settings and the Privacy Center stay with Sarah and Maggie.

/** How long a stay can be, in days. */
export const AWAY_MAX_DAYS = 60;

/** The away period that isn't over yet: asked, accepted or declined, and not ended or cancelled. */
export function currentAway(s: State): Away | undefined {
  return (s.aways ?? []).find((a) => a.status === "asked" || a.status === "accepted" || a.status === "declined");
}

/** The away period that is happening now: accepted and today within its dates. */
export function activeAway(s: State): Away | undefined {
  const a = currentAway(s);
  const today = todayOf(s);
  return a && a.status === "accepted" && a.start <= today && today <= a.end ? a : undefined;
}

/** Who is covering for Sarah right now, if anyone. */
export const coverId = (s: State) => activeAway(s)?.backupId;

/** CC-229 criterion 3: only active family members can cover. A paid caregiver's access is limited to shifts. */
export const backupCandidates = (s: State) => s.members.filter((m) => m.role === "family" && m.status === "active" && !!personaOf(m.id));

/** CC-229 criterion 4: the SOS order with the backup in Sarah's place while she's away. */
export function escalationOrder(s: State): string[] {
  const chain = s.settings.escalation;
  const cover = coverId(s);
  if (!cover) return chain;
  const out: string[] = [];
  for (const id of chain) {
    const who = id === GUARDIAN ? cover : id;
    if (!out.includes(who)) out.push(who);
  }
  return out;
}

/** "until Friday" this week, "until Sat, Mar 7" further out. */
export function untilText(s: State, end: string) {
  const today = todayOf(s);
  if (end === today) return "until tonight";
  if (end <= ymd(addDays(clock(s), 6))) return `until ${new Date(`${end}T12:00:00`).toLocaleDateString([], { weekday: "long" })}`;
  return `until ${fmtShortDay(end)}`;
}

/**
 * Which of Sarah's alerts a backup can take, and what their own role must be able to read for it. Anything not
 * listed (security notices, approvals, the evening recap, Maggie's daily check-ins, the coming-home plan, the
 * help board's notices) stays with Sarah, because the backup's role can't see it or it's Sarah's to decide.
 */
const COVERABLE: { prefix: string; resource: Resource; link: (p: Persona) => string }[] = [
  { prefix: "dose-g-", resource: "doses", link: (p) => `/app/${p}/away` },
  { prefix: "checkin-", resource: "history", link: (p) => `/app/${p}/away` },
  { prefix: "late-", resource: "schedule", link: (p) => `/app/${p}/away` },
  { prefix: "sos-", resource: "sos", link: () => "/app/sos" },
  { prefix: "call-overdue-", resource: "calls", link: (p) => `/app/${p}/calls` },
];

function coverRule(a: Pick<Alert, "key" | "link">) {
  if (!a.key && a.link === "/app/sos") return COVERABLE.find((c) => c.prefix === "sos-");
  return a.key ? COVERABLE.find((c) => a.key!.startsWith(c.prefix)) : undefined;
}

/**
 * CC-229 criteria 1 and 6: called by pushAlert. While someone covers, an alert meant for Sarah that their role
 * can read goes to them instead, marked as covering. Everything else is left as it was.
 */
export function routeForCover(s: State, a: Omit<Alert, "id" | "at" | "read">): Omit<Alert, "id" | "at" | "read"> {
  if (!a.to.includes("guardian")) return a;
  const away = activeAway(s);
  if (!away) return a;
  const rule = coverRule(a);
  const persona = personaOf(away.backupId);
  if (!rule || !persona || !can(s, away.backupId, "read", rule.resource)) return a;
  const to: Persona[] = a.to.filter((p) => p !== "guardian");
  if (!to.includes(persona)) to.push(persona);
  return { ...a, to, detail: `Covering for Sarah. ${a.detail}`, link: rule.link(persona), awayId: away.id, coverLink: a.link };
}

type AwayInput = { start: string; end: string; backupId: string };

function valid(s: State, input: AwayInput) {
  const today = todayOf(s);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(input.start) || !day.test(input.end)) return false;
  // While cover is running, the first day stays as it was even though it's now in the past.
  const running = activeAway(s);
  const keepsStart = !!running && input.start === running.start;
  if ((!keepsStart && input.start < today) || input.end < input.start || input.end < today) return false;
  if (input.end > ymd(addDays(new Date(`${input.start}T12:00:00`), AWAY_MAX_DAYS))) return false;
  return backupCandidates(s).some((m) => m.id === input.backupId);
}

function tell(s: State, id: string, a: Omit<Alert, "id" | "at" | "read" | "to">) {
  const p = personaOf(id);
  if (p) pushAlert(s, { ...a, to: [p] });
}

/** CC-229: Sarah sets her away dates and asks someone to cover, or changes them. Only Sarah; audited. */
export function setAway(s: State, by: string, input: AwayInput): Away | null {
  if (by !== GUARDIAN) { audit(s, by, "denied", "set Sarah's away dates"); return null; }
  if (!allowed(s, by, "write", "away")) return null;
  if (!valid(s, input)) return null;
  const now = clock(s).toISOString();
  let a = currentAway(s);
  const backup = nameOf(s, input.backupId);
  if (a) {
    const newBackup = a.backupId !== input.backupId;
    const wasActive = !!activeAway(s);
    Object.assign(a, { start: input.start, end: input.end, updatedAt: now });
    if (newBackup) Object.assign(a, { backupId: input.backupId, status: "asked", answeredAt: undefined, pickReminded: false, maggieAsked: undefined });
    if (newBackup && wasActive) a.start = todayOf(s) > input.start ? todayOf(s) : input.start;
    audit(s, by, "updated", "away dates and backup");
  } else {
    a = { id: uid("away"), start: input.start, end: input.end, backupId: input.backupId, status: "asked", by, at: now };
    s.aways = [...(s.aways ?? []), a];
    audit(s, by, "created", "away dates and backup");
  }
  if (a.status === "asked") {
    tell(s, a.backupId, { key: `away-ask-${a.id}-${a.backupId}`, severity: "info", title: "You have a new request in Circle Care", detail: `Sarah asked you to cover for her from ${fmtShortDay(a.start)} to ${fmtShortDay(a.end)}.`, link: `/app/${personaOf(a.backupId)}/away` });
  }
  // Criterion 5: Maggie is told who will cover and until when, in plain words.
  pushAlert(s, { key: `away-elder-${a.id}-${a.backupId}-${a.start}-${a.end}`, to: ["elder"], severity: "info", title: "Update from Circle Care", detail: `Sarah will be away from ${fmtShortDay(a.start)} to ${fmtShortDay(a.end)}. She asked ${backup} to look after things while she's gone.`, link: "/app/elder" });
  return a;
}

/** CC-229 criterion 1: the backup accepts or says they can't. Only the person asked. Audited. */
export function answerAway(s: State, by: string, yes: boolean) {
  const a = currentAway(s);
  if (!a || a.status !== "asked") return false;
  if (by !== a.backupId) { audit(s, by, "denied", "answer someone else's cover request"); return false; }
  a.status = yes ? "accepted" : "declined";
  a.answeredAt = clock(s).toISOString();
  audit(s, by, yes ? "approved" : "declined", "covering for Sarah");
  const who = nameOf(s, by);
  pushAlert(s, {
    key: `away-answer-${a.id}-${by}-${a.status}`, to: ["guardian"], severity: yes ? "info" : "warning", title: "Update from Circle Care",
    detail: yes ? `${who} will cover for you from ${fmtShortDay(a.start)} to ${fmtShortDay(a.end)}.` : `${who} can't cover for you. Pick someone else for your away dates.`,
    link: "/app/guardian/away",
  });
  if (yes) pushAlert(s, { key: `away-elder-ok-${a.id}-${by}`, to: ["elder"], severity: "info", title: "Update from Circle Care", detail: `${who} will look after you while Sarah is away, ${untilText(s, a.end)}.`, link: "/app/elder" });
  return true;
}

/** CC-231 criterion 2: Maggie would rather someone else covered. Sarah is told and asked to pick again. */
export function maggieAsksChange(s: State, by: string) {
  const a = currentAway(s);
  if (!a || a.status === "declined") return false;
  if (by !== ELDER) { audit(s, by, "denied", "ask for a different backup"); return false; }
  a.maggieAsked = clock(s).toISOString();
  audit(s, by, "updated", "asked Sarah for a different backup");
  pushAlert(s, { key: `away-maggie-${a.id}-${a.maggieAsked}`, to: ["guardian"], severity: "warning", urgent: true, title: "Circle Care needs your attention", detail: `Maggie would like someone other than ${nameOf(s, a.backupId)} to cover while you're away. Pick someone else.`, link: "/app/guardian/away" });
  return true;
}

/** What the backup did while covering, within their own role (CC-230 criterion 4). */
export function coverSummary(s: State, a: Away) {
  const alerts = s.alerts.filter((x) => x.awayId === a.id);
  const tasks = s.taskLogs.filter((l) => l.by === a.backupId && l.at >= (a.startedAt ?? a.at) && (!a.endedAt || l.at <= a.endedAt));
  const sos = s.sos.filter((e) => e.startedAt >= (a.startedAt ?? a.at) && (!a.endedAt || e.startedAt <= a.endedAt));
  return { alerts, tasksDone: tasks.length, sos: sos.length };
}

/** The alerts James got while covering that nobody has read yet. */
export const openCoverAlerts = (s: State, a: Away) => {
  const p = personaOf(a.backupId);
  return s.alerts.filter((x) => x.awayId === a.id && !x.resolved && p && !x.read.includes(p));
};

/**
 * CC-230: hands everything back. Alerts go to Sarah again, open ones move to her and the backup is told they're
 * hers now, the backup is thanked with a short summary, and Sarah gets one summary of the time away. Audited.
 */
function handBack(s: State, a: Away, by: string, early: boolean) {
  const now = clock(s).toISOString();
  a.status = "ended";
  a.endedAt = now;
  a.endedEarly = early;
  const backup = nameOf(s, a.backupId);
  const open = openCoverAlerts(s, a);
  for (const x of open) {
    if (!x.to.includes("guardian")) x.to.push("guardian");
    x.movedToSarah = now;
  }
  audit(s, by, "updated", early ? "away mode ended early (I'm back)" : "away mode ended");
  const sum = coverSummary(s, a);
  const persona = personaOf(a.backupId);
  if (persona) {
    pushAlert(s, {
      key: `away-thanks-${a.id}`, to: [persona], severity: "info", title: "Update from Circle Care",
      detail: `Thank you for covering for Sarah. She's back now.${open.length ? ` ${open.length === 1 ? "One alert that was still open is" : `${open.length} alerts that were still open are`} hers now.` : ""}`,
      items: summaryLines(sum),
      link: `/app/${persona}/away`,
    });
  }
  a.summaryFor = { alerts: sum.alerts.length, tasksDone: sum.tasksDone, sos: sum.sos, open: open.map((x) => x.id) };
  pushAlert(s, { key: `away-back-${a.id}`, to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `Welcome back. ${backup} covered while you were away. Your summary is on your home screen.`, link: "/app/guardian" });
  pushAlert(s, { key: `away-elder-back-${a.id}`, to: ["elder"], severity: "info", title: "Update from Circle Care", detail: "Sarah is back. She's your first call again.", link: "/app/elder" });
}

export function summaryLines(sum: { alerts: Alert[]; tasksDone: number; sos: number }) {
  const n = sum.alerts.length;
  return [
    `${n} ${n === 1 ? "alert" : "alerts"} came to you`,
    `${sum.tasksDone} ${sum.tasksDone === 1 ? "task" : "tasks"} done`,
    ...(sum.sos ? [`${sum.sos} SOS ${sum.sos === 1 ? "alert" : "alerts"}`] : []),
  ];
}

/** CC-230 criterion 2: Sarah's back early. Before the dates start, it just cancels. Only Sarah. */
export function imBack(s: State, by: string) {
  const a = currentAway(s);
  if (!a) return false;
  if (by !== GUARDIAN) { audit(s, by, "denied", "end Sarah's away mode"); return false; }
  if (activeAway(s)) { handBack(s, a, by, true); return true; }
  a.status = "cancelled";
  a.endedAt = clock(s).toISOString();
  audit(s, by, "removed", "away dates and backup");
  if (a.backupId) tell(s, a.backupId, { key: `away-cancel-${a.id}`, severity: "info", title: "Update from Circle Care", detail: "Sarah cancelled her away dates. You don't need to cover.", link: `/app/${personaOf(a.backupId)}/away` });
  return true;
}

/** Sarah has read her summary. */
export function seenSummary(s: State, by: string) {
  if (by !== GUARDIAN) return;
  const last = lastEnded(s);
  if (last && !last.summarySeenAt) last.summarySeenAt = clock(s).toISOString();
}

export const lastEnded = (s: State) => [...(s.aways ?? [])].reverse().find((a) => a.status === "ended");

/**
 * Runs on every tick: marks the start, reminds Sarah a day before if nobody has accepted (CC-229 criterion 2), and
 * hands back once the end date has passed (CC-230 criterion 1). Asked or declined periods that pass just lapse.
 */
export function runAway(s: State) {
  const a = currentAway(s);
  if (!a) return;
  const today = todayOf(s);
  if (today > a.end) {
    if (a.status === "accepted") handBack(s, a, "system", false);
    else { a.status = "cancelled"; a.endedAt = clock(s).toISOString(); }
    return;
  }
  if (a.status === "accepted" && today >= a.start && !a.startedAt) {
    a.startedAt = clock(s).toISOString();
    audit(s, "system", "updated", "away mode started");
  }
  if (a.status !== "accepted" && today >= ymd(addDays(new Date(`${a.start}T12:00:00`), -1)) && !a.pickReminded) {
    a.pickReminded = true;
    pushAlert(s, { key: `away-pick-${a.id}-${a.backupId}`, to: ["guardian"], severity: "warning", title: "You have a reminder from Circle Care", detail: `${nameOf(s, a.backupId)} hasn't agreed to cover yet. Pick someone else for your away dates.`, link: "/app/guardian/away" });
  }
}

/** What the backup sees of their own cover: the request, the dates, and the alerts that came to them. */
export function coverView(s: State, viewer: string) {
  const a = currentAway(s);
  if (a && a.backupId === viewer) return { away: a, active: !!activeAway(s), alerts: s.alerts.filter((x) => x.awayId === a.id) };
  const last = lastEnded(s);
  if (last && last.backupId === viewer) return { away: last, active: false, alerts: s.alerts.filter((x) => x.awayId === last.id) };
  return undefined;
}
