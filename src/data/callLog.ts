import type { State, CallEntry, CareTask } from "./types";
import { audit, allowed, pushAlert } from "./store";
import { can } from "./policy";
import { clock, nameOf, personaOf, todayOf } from "./selectors";
import { stepOwners, STEP_MAX } from "./visitNotes";
import { addDays, fmtShortDay, minutesOfDay, uid, ymd } from "../lib/time";
import { ELDER, GUARDIAN } from "./demo";

// Sprint 19: the call log (CC-226 – CC-228). Sarah or Maggie writes down each call with an insurer, a pharmacy
// or an agency: who they spoke to, what was agreed and the reference number. Everyone in the circle who can see
// it sees the organization, the date and the next step. The rest are "insurance and admin details", which reach
// family and caregivers only when Maggie picks them in her Privacy Center. A next step with an owner and a day
// becomes that person's care task (CC-227), with a reminder the day before and an overdue flag for Sarah.

export const ORG_MAX = 80;
export const CONTACT_MAX = 80;
export const OUTCOME_MAX = 1000;
export const REF_MAX = 40;
export { STEP_MAX };
/** The morning hour after which Sarah hears about a follow-up that's past its day. */
export const OVERDUE_FROM = "08:00";
const STEP_TIME = "10:00";

export const canSeeCalls = (s: State, viewer: string) => can(s, viewer, "read", "calls");
export const canSeeAdmin = (s: State, viewer: string) => can(s, viewer, "read", "calls.admin");
export const canEditCalls = (s: State, viewer: string) => can(s, viewer, "write", "calls");
export const canRevealRef = (s: State, viewer: string) => can(s, viewer, "read", "calls.ref");

/** A reference number in a list: its last 4 only (criterion 3). */
export function maskRef(ref: string) {
  const tail = ref.replace(/\s+/g, "").slice(-4);
  return `•••• ${tail}`;
}

/** The task a call's next step became, with its done record if it has one. */
function stepState(s: State, c: CallEntry) {
  if (!c.nextStep) return undefined;
  const log = s.taskLogs.find((l) => l.taskId === c.nextStep!.taskId);
  return {
    ...c.nextStep,
    done: log ? { by: log.by, at: log.at } : undefined,
    overdue: !log && c.nextStep.date < todayOf(s),
  };
}

export type CallView = {
  id: string;
  org: string;
  date: string;
  nextStep?: ReturnType<typeof stepState>;
  /** Only with Maggie's "Insurance and admin details" choice (criterion 2). */
  admin?: { contact?: string; outcome?: string; refMasked?: string };
  canReveal: boolean;
};

/** What one viewer sees of one call. */
export function callView(s: State, viewer: string, c: CallEntry): CallView {
  const admin = canSeeAdmin(s, viewer)
    ? { contact: c.contact, outcome: c.outcome, refMasked: c.ref ? maskRef(c.ref) : undefined }
    : undefined;
  return { id: c.id, org: c.org, date: c.date, nextStep: stepState(s, c), admin, canReveal: !!c.ref && canRevealRef(s, viewer) };
}

const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

/** The organizations in the log, for the filter's suggestions. */
export function callOrgs(s: State, viewer: string) {
  if (!canSeeCalls(s, viewer)) return [];
  const seen = new Map<string, string>();
  for (const c of s.calls) if (!seen.has(norm(c.org))) seen.set(norm(c.org), c.org);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** CC-228: the log, newest first, optionally only one organization's calls. Nothing at all without access. */
export function callsFor(s: State, viewer: string, org?: string): CallView[] {
  if (!canSeeCalls(s, viewer)) return [];
  const want = org ? norm(org) : "";
  return s.calls
    .filter((c) => !want || norm(c.org) === want)
    .sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at))
    .map((c) => callView(s, viewer, c));
}

export type CallInput = {
  org: string; date: string; contact?: string; outcome?: string; ref?: string;
  step?: { text: string; owner: string; date: string } | null;
};

const clean = (t: string | undefined, max: number) => {
  const v = (t ?? "").trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : undefined;
};

function valid(s: State, input: CallInput) {
  const org = clean(input.org, ORG_MAX);
  if (!org || input.org.trim().length > ORG_MAX) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayOf(s)) return null;
  if ((input.outcome ?? "").trim().length > OUTCOME_MAX || (input.ref ?? "").trim().length > REF_MAX || (input.contact ?? "").trim().length > CONTACT_MAX) return null;
  const step = input.step && input.step.text.trim() ? input.step : null;
  if (step) {
    if (step.text.trim().length > STEP_MAX) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(step.date) || step.date < todayOf(s)) return null;
    if (!stepOwners(s).some((m) => m.id === step.owner)) return null;
  }
  return { org, step };
}

/** The task's title carries the organization and the step only, never a reference number (CC-227 criterion 3). */
const taskTitle = (org: string, text: string) => `${org}: ${text}`;

function tellOwner(s: State, by: string, c: CallEntry) {
  const st = c.nextStep!;
  const persona = personaOf(st.owner);
  if (!persona || st.owner === by || !can(s, st.owner, "read", "tasks")) return;
  pushAlert(s, { key: `call-step-${st.taskId}`, to: [persona], severity: "info", title: "You have a new task in Circle Care", detail: `${nameOf(s, by)} added a follow-up for you: ${c.org}, ${st.text}, ${fmtShortDay(st.date)}.`, link: `/app/${persona}/calls` });
}

/**
 * CC-226: adds a call, or changes one when `id` is given. Only Maggie and Sarah may; anyone else is refused and
 * the refusal audited (criterion 6). The screen shows the health-detail hint before this (criterion 4).
 */
export function saveCall(s: State, by: string, input: CallInput, id?: string): CallEntry | null {
  if (!allowed(s, by, "write", "calls")) return null;
  const v = valid(s, input);
  if (!v) return null;
  const now = clock(s).toISOString();
  let c = id ? s.calls.find((x) => x.id === id) : undefined;
  if (id && !c) return null;
  const fields = { org: v.org, date: input.date, contact: clean(input.contact, CONTACT_MAX), outcome: (input.outcome ?? "").trim().slice(0, OUTCOME_MAX) || undefined, ref: clean(input.ref, REF_MAX)?.replace(/\s+/g, "") };
  if (!c) {
    c = { id: uid("call"), ...fields, by, at: now };
    s.calls.push(c);
    audit(s, by, "created", "a call log entry");
  } else {
    Object.assign(c, fields, { updatedBy: by, updatedAt: now });
    audit(s, by, "updated", "a call log entry");
  }
  setStep(s, by, c, v.step);
  return c;
}

/** CC-227: the next step becomes, changes or stops being its owner's care task. A done step stays as it was. */
function setStep(s: State, by: string, c: CallEntry, step: { text: string; owner: string; date: string } | null) {
  const old = c.nextStep;
  const done = old && s.taskLogs.some((l) => l.taskId === old.taskId);
  if (done) return;
  if (!step) {
    if (old) { s.tasks = s.tasks.filter((t) => t.id !== old.taskId); c.nextStep = undefined; }
    return;
  }
  const text = step.text.trim().replace(/\s+/g, " ");
  if (old && old.text === text && old.owner === step.owner && old.date === step.date) {
    const t = s.tasks.find((x) => x.id === old.taskId);
    if (t) t.title = taskTitle(c.org, text);
    return;
  }
  if (old) s.tasks = s.tasks.filter((t) => t.id !== old.taskId);
  const task: CareTask = { id: uid("t"), title: taskTitle(c.org, text), icon: "phone", time: STEP_TIME, recurrence: "once", date: step.date, assignee: step.owner === ELDER ? "elder" : step.owner, callId: c.id };
  s.tasks.push(task);
  c.nextStep = { text, owner: step.owner, date: step.date, taskId: task.id };
  audit(s, by, "created", "a follow-up from a call (care task)");
  tellOwner(s, by, c);
}

/** Deletes a call and its open next step. Audited (criterion 6). */
export function deleteCall(s: State, by: string, id: string) {
  if (!allowed(s, by, "write", "calls")) return false;
  const c = s.calls.find((x) => x.id === id);
  if (!c) return false;
  if (c.nextStep && !s.taskLogs.some((l) => l.taskId === c.nextStep!.taskId)) s.tasks = s.tasks.filter((t) => t.id !== c.nextStep!.taskId);
  s.calls = s.calls.filter((x) => x !== c);
  audit(s, by, "removed", "a call log entry");
  return true;
}

/** Shows a reference number in full. Only Maggie and Sarah; each reveal is in the access history. */
export function revealRef(s: State, by: string, id: string): string | null {
  const c = s.calls.find((x) => x.id === id);
  if (!c?.ref) return null;
  if (!allowed(s, by, "read", "calls.ref")) return null;
  audit(s, by, "viewed", "a call reference number");
  return c.ref;
}

/** Can this person still get the reminder? Active, still able to own a step, and not hidden by a paused share. */
function reachable(s: State, owner: string) {
  if (!stepOwners(s).some((m) => m.id === owner)) return false;
  if (s.settings.sharingPaused && owner !== ELDER && owner !== GUARDIAN) return false;
  return true;
}

/** CC-227 criteria 1, 2 and 4: a reminder the day before, then Sarah hears once if it's past its day. Generic titles. */
export function runCalls(s: State) {
  const now = clock(s);
  const today = ymd(now);
  const tomorrow = ymd(addDays(now, 1));
  const morning = minutesOfDay(now) >= 8 * 60;
  for (const c of s.calls) {
    const st = c.nextStep;
    if (!st || s.taskLogs.some((l) => l.taskId === st.taskId)) continue;
    if (st.date === tomorrow && reachable(s, st.owner)) {
      const persona = personaOf(st.owner);
      if (persona) pushAlert(s, { key: `call-remind-${st.taskId}`, to: [persona], severity: "info", title: "You have a reminder from Circle Care", detail: `Tomorrow: ${c.org}, ${st.text}.`, link: `/app/${persona}/calls` });
    }
    if (st.date < today && morning) {
      pushAlert(s, { key: `call-overdue-${st.taskId}`, to: ["guardian"], severity: "warning", title: "Circle Care needs your attention", detail: `A follow-up from a call is past its day: ${c.org}, ${st.text} (${nameOf(s, st.owner)}, ${fmtShortDay(st.date)}).`, link: "/app/guardian/calls" });
    }
  }
}

/** Who did a step, for "Done by Sarah, Tue 9:40 AM". */
export const doneBy = (s: State, viewer: string, by: string) => (by === viewer ? "you" : nameOf(s, by));

/** The people Maggie can let see insurance and admin details: active family and caregivers. Sarah always sees them. */
export const adminCandidates = (s: State) => s.members.filter((m) => m.status === "active" && (m.role === "family" || m.role === "pro"));

export function adminPeople(s: State) {
  const ok = new Set(adminCandidates(s).map((m) => m.id));
  return (s.settings.adminTo ?? []).filter((id) => ok.has(id));
}

/** CC-226: Maggie's "Insurance and admin details" choice in her Privacy Center. Only she can change it; audited. */
export function setAdminTo(s: State, by: string, ids: string[]) {
  if (by !== ELDER) { audit(s, by, "denied", "change who sees Maggie's insurance and admin details"); return false; }
  const ok = new Set(adminCandidates(s).map((m) => m.id));
  s.settings = { ...s.settings, adminTo: [...new Set(ids)].filter((id) => ok.has(id)) };
  audit(s, by, "updated", "who sees her insurance and admin details");
  return true;
}
