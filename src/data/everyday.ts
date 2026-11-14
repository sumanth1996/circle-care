import type { State, Medication, DailyLog, Feeling, Meal, Persona, ChatMessage, Settings } from "./types";
import { clock, todayOf, dosesFor, tasksFor, checkinToday, checkinMissed, member, shiftForDay } from "./selectors";
import { can } from "./policy";
import { GUARDIAN, ELDER, CAREGIVER } from "./demo";
import { ymd, addDays, toMin, minutesOfDay } from "../lib/time";

// Sprint 12 "Everyday Care": the small things a family checks every day. This file has the refill tracker, the daily check-ins and the family chat.
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

/* ---------------- CC-164 – CC-165: family chat ---------------- */

/** CC-164: longest message the chat accepts. Longer ones are refused, not cut. */
export const CHAT_MAX = 1000;

/** Who can read the chat right now: the active circle, with paid caregivers only once added (policy decides). */
export function chatMembers(s: State) {
  return s.members.filter((m) => m.status === "active" && can(s, m.id, "read", "chat"));
}

export const inChat = (s: State, memberId: string) => can(s, memberId, "read", "chat");

/**
 * Messages already sent, oldest first (the demo seeds some later in the day). With a viewer, only
 * what that person may see: an added caregiver sees messages from when they joined.
 */
export function chatMessages(s: State, viewer?: string): ChatMessage[] {
  const now = clock(s).toISOString();
  const from = viewer ? s.chat.joinedAt[viewer] ?? "" : "";
  return s.chat.messages.filter((m) => m.at <= now && m.at >= from);
}

export function unreadChat(s: State, memberId: string) {
  if (!inChat(s, memberId)) return 0;
  const since = s.chat.readAt[memberId] ?? "";
  return chatMessages(s, memberId).filter((m) => m.by !== memberId && m.at > since).length;
}

export const lastChatMessage = (s: State, viewer?: string): ChatMessage | undefined => chatMessages(s, viewer).at(-1);

/** The demo personas to notify about a new message: everyone in the chat except the sender. */
export function chatAudience(s: State, by: string): Persona[] {
  const to = new Set<Persona>();
  for (const m of chatMembers(s)) {
    if (m.id === by) continue;
    if (m.id === ELDER) to.add("elder");
    else if (m.id === GUARDIAN) to.add("guardian");
    else if (m.id === CAREGIVER) to.add("caregiver");
  }
  return [...to];
}

const escapeRe = (x: string) => x.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");

/** Whole words (plurals allowed), plus stems that end in "*". Everyday words that also mean
 *  other things ("tablet", "kidney beans", "units") are left out to keep false alarms rare. */
const HEALTH_WORDS = [
  "diagnos*", "prescri*", "alzheimer*", "parkinson*", "chemo*", "milligram*", "diabet*",
  "medicine", "medication", "meds", "dose", "dosage", "dosing", "pill", "insulin",
  "blood pressure", "blood sugar", "a1c", "glucose", "heart rate", "heart condition",
  "dementia", "cancer", "arthritis", "kidney disease", "kidney function",
  "surgery", "symptom", "test result", "lab result",
];

/**
 * CC-192: everyday phrases that use a health word in another sense ("stroke the cat", "laughter is the best
 * medicine", "a dose of sunshine", "add 250 ml of milk"). They are blanked out before the check runs, so only
 * these exact senses are let through and every other use of the word still warns. Each pattern names its
 * everyday words outright, with no free "any word" gaps, so it can't swallow a health word next to it
 * ("in the car her cancer diagnosis" still warns). Missing a real health detail is worse than one extra
 * warning, so a phrase only goes here when the CC-192 health and mixed sets still pass.
 */
const EVERYDAY_SENSES: RegExp[] = [
  // medicine as an idiom or a gym ball ("Tylenol is the best medicine", "the best medicine for her cough" still warn)
  /\b(?:laughter|laughing|a\s+good\s+laugh|love|music|sleep|time)\s+is\s+(?:still\s+|really\s+|always\s+)?the\s+best\s+medicine\b(?!\s+for\b)/g,
  /\bmedicine\s+balls?\b/g,
  /\btaste\s+of\s+(?:his|her|their|my|your|our|its)\s+own\s+medicine\b/g,
  // "a dose of sunshine", "a healthy dose of fun"
  /\bdoses?\s+of\s+(?:sunshine|sun|reality|fun|fresh\s+air|humou?r|laughter|nature|good\s+news|patience|kindness|love|cheer|joy|optimism|common\s+sense)\b/g,
  // fixing a car, a laptop or the wifi, as the direct object only ("she was diagnosed in the car" still warns)
  /\bdiagnos(?:e|es|ed|ing)\s+(?:the\s+|my\s+|our\s+|your\s+|why\s+the\s+|what'?s\s+wrong\s+with\s+the\s+)?(?:car|cars|engine|truck|van|laptop|wifi|wi-fi|router|printer|furnace|boiler|dishwasher|washer|dryer|fridge)\b/g,
  /\b(?:car|engine|truck|van|laptop|router|printer|furnace|boiler)\s+needs?\s+a\s+diagnostic\b/g,
  // a reading list or a race route ("prescribed reading glasses" and "prescribed course of prednisone" still warn)
  /\bprescribed\s+reading\b(?!\s+glasses)/g,
  /\bprescribed\s+route\b/g,
  // a pet's operation, only with the possessive ("walk the dog surgery is at 9" still warns)
  /\b(?:dog|cat|puppy|kitten|pet|bird|horse|rabbit)'s\s+surgery\b/g,
  // the star sign, "Cancer season" (the "Mom is a Cancer, birthday in July" case runs on the original capitals, below)
  /\bcancer\s+season\b/g,
  // school and driving tests ("family history test results" still warns)
  /\b(?:school|math|maths|science|spelling|sat|driving|driver's|drivers|class|english|spanish|french|chemistry|physics|biology)\s+test\s+results?\b/g,
  /\btest\s+results?\s+(?:from|for|at)\s+(?:\w+'s\s+)?(?:school|class|college|university|driving)\b/g,
  // a garden bug or an idiom
  /\bpill\s+bugs?\b/g,
  /\bchill\s+pills?\b/g,
  /\bbitter\s+pill\b/g,
  /\bpoison\s+pills?\b/g,
  // cooking: "add 250 ml of milk", "add 30 ml of olive oil" ("give her 5 ml with juice", "5 ml of cough syrup" still warn)
  /\b(?:add|adding|stir\s+in|mix\s+in|pour|pour\s+in|whisk\s+in|heat)\s+\d+\s?ml\s+of\s+(?:olive\s+|coconut\s+|vegetable\s+|whole\s+|skim\s+|almond\s+|oat\s+|warm\s+|cold\s+|hot\s+)?(?:milk|water|cream|oil|stock|broth|wine|juice|vinegar|sauce|batter|coffee|tea|beer|rum|vodka)\b/g,
  // storage and housing units
  /\d\s?units?\s+of\s+(?:the\s+|rental\s+)*(?:storage|housing|apartments?|condos?|furniture|space|lumber|wood)\b/g,
  // "stroke the cat", "brush strokes", "swimming strokes", "with 2 strokes", "a stroke of luck"
  /\bstrok(?:e|es|ed|ing)\s+(?:the|her|his|my|your|our|its)\s+(?:cat|cats|dog|dogs|kitten|puppy|pet|fur|hair|beard)\b/g,
  /\b(?:brush|swimming|swim|paint|pen|key|breast|back|golf|tennis|oar|rowing|bold|broad)\s+strokes?\b/g,
  /\b(?:with|in)\s+(?:\d+|a\s+few|long|short|light|quick)\s+strokes\b/g,
  /\bstrokes?\s+of\s+(?:luck|genius|brilliance|fate|inspiration|midnight|good\s+fortune|bad\s+luck|the\s+pen)\b/g,
];

/** The star sign, matched on the original capitals: "Mom is a Cancer, birthday in July". Lower-case "a cancer"
 *  and "a cancer sign" still warn, and so does "a cancer survivor". */
const ZODIAC_CANCER = /\b(?:[Mm]om|[Dd]ad|[Ss]he|[Hh]e|I|[Gg]randma|[Gg]randpa|[Mm]aggie|[Ll]ily)(?:'s|'m|\s+is|\s+am)\s+a\s+Cancer\b(?!\s+(?:survivor|patient))(?=[^.?!]*\b(?:birthday|born|zodiac|star\s+sign|horoscope)\b)/g;

/**
 * CC-164: the chat is for everyday family life. When a message names one of Maggie's medicines
 * (with or without its strength), a diagnosis or a dose, suggest Notes, which keep health details
 * on her record under her sharing choices. Returns what was spotted (shown as chips), or an empty list.
 * CC-192: everyday senses of health words (see EVERYDAY_SENSES) no longer warn.
 */
export function phiHint(s: State, text: string) {
  let t = ` ${text.replace(/[\u2018\u2019]/g, "'")} `.replace(ZODIAC_CANCER, " ").toLowerCase();
  for (const re of EVERYDAY_SENSES) t = t.replace(re, " ");
  const hits = new Set<string>();
  for (const m of s.meds) {
    // "Vitamin D3" also matches "vitamin d"; "Atorvastatin" also matches "atorvastatin20mg".
    const name = m.name.toLowerCase();
    const stripped = name.replace(/\s*\d+$/, "");
    const base = stripped.replace(/[^a-z]/g, "").length >= 3 ? stripped : name;
    if (new RegExp(`\\b${escapeRe(base)}(?![a-z])`).test(t)) hits.add(m.name);
  }
  for (const w of HEALTH_WORDS) {
    const stem = w.endsWith("*");
    const word = stem ? w.slice(0, -1) : w;
    if (new RegExp(stem ? `\\b${word}` : `\\b${word}(s|es)?\\b`).test(t)) hits.add(stem ? `${word}…` : word);
  }
  if (/\d\s?(mg|mcg|ml|iu)\b/.test(t) || /\b(gave|give|gives|giving|took|take|takes|taking)\b[^.?!]*\d\s?units?\b/.test(t)) hits.add("a dose");
  // Ambiguous on its own, so only in a health sense: "her BP", "BP 140/90". Everyday senses of "stroke" are
  // blanked out above, so any "stroke" left warns.
  if (/\b(her|his|my|mom'?s|dad'?s|grandma'?s)\s+bp\b|\bbp\s*(is\s*)?\d/.test(t)) hits.add("bp");
  if (/\bstrokes?\b/.test(t)) hits.add("stroke");
  return [...hits];
}

/* ---------------- CC-191: evening recap ---------------- */

/** True when quiet hours cover this minute of the day (they may run past midnight). */
export function inQuietHours(q: Settings["quietHours"], min: number) {
  if (!q.on) return false;
  const a = toMin(q.start), b = toMin(q.end);
  return a <= b ? min >= a && min < b : min >= a || min < b;
}

/** The recap card shows on Sarah's Home from 6 PM. Its one update is decided at 7 PM; if the app first runs later
 *  that evening it still goes out, until 11 PM, but never when quiet hours covered 7 PM or cover the moment it would go. */
export const RECAP_CARD_FROM = "18:00";
export const RECAP_NOTIFY_AT = "19:00";
export const RECAP_LAST_CALL = "23:00";
export const recapOpen = (s: State) => minutesOfDay(clock(s)) >= toMin(RECAP_CARD_FROM);

export type RecapDose = { name: string; time: string };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One calm summary of Maggie's day for Sarah. Health details stay in the app, never on the lock screen. */
export function recap(s: State) {
  const now = clock(s);
  const today = todayOf(s);
  const all = dosesFor(s);
  const doses = all.filter((d) => d.state !== "upcoming");
  const pick = (...st: string[]): RecapDose[] => doses.filter((d) => st.includes(d.state)).map((d) => ({ name: d.med.name, time: d.time }));
  const taken = doses.filter((d) => d.state === "taken").length;
  const unconfirmed = pick("late", "escalated");
  const skipped = pick("skipped");
  const refused = pick("refused");
  const due = pick("due");
  const needLook = unconfirmed.length + skipped.length + refused.length;
  const next = all.find((d) => d.state === "upcoming");
  const tasks = tasksFor(s).filter((t) => toMin(t.task.time) <= minutesOfDay(now));
  const visits = s.visits.filter((v) => v.date === today && v.checkIn);
  const ci = checkinToday(s);
  const ciMissed = checkinMissed(s);
  // Maggie's own feeling, water and meals: only while she shares them, and never on a day she kept private.
  const log = sharedLogFor(s);
  const tomorrow = ymd(addDays(now, 1));
  const appt = s.appointments.filter((a) => a.date === tomorrow && a.status === "scheduled").sort((a, b) => a.time.localeCompare(b.time))[0];
  const shift = appt ? undefined : shiftForDay(s, tomorrow)
    .filter((sh) => sh.caregiverId && sh.accepted && member(s, sh.caregiverId)?.status === "active")
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const low = lowSupply(s);
  // Calm needs the check-in done (Review F4-15); while her window is open the headline says it's still to come.
  const calm = needLook === 0 && due.length === 0 && !!ci && low.length === 0;
  return {
    calm,
    headline: calm
      ? "A calm day for Maggie."
      : needLook ? `${plural(needLook, "dose needs", "doses need")} a look.`
      : due.length ? `${plural(due.length, "dose is", "doses are")} due now.`
      : ciMissed ? "Maggie didn't check in today."
      : !ci && !low.length ? "Maggie's check-in is still to come."
      : low.length === 1 ? "One refill to sort out." : `${low.length} refills to sort out.`,
    doses: { taken, total: doses.length, unconfirmed, skipped, refused, due, next: next?.time, any: all.length > 0 },
    tasks: { done: tasks.filter((t) => t.done).length, total: tasks.length },
    visits: visits.map((v) => ({ who: member(s, v.caregiverId)?.short ?? "Caregiver", from: v.checkIn!, to: v.checkOut })),
    checkin: ci?.at,
    checkinMissed: ciMissed,
    log,
    tomorrow: appt
      ? { kind: "appointment" as const, time: appt.time, title: appt.title, note: appt.prep }
      : shift ? { kind: "visit" as const, time: shift.start, who: member(s, shift.caregiverId)?.short ?? "A caregiver", until: shift.end }
      : undefined,
    // Only a refill that is really on the Calendar gets a date (Review F4-4).
    low: low.map((l) => ({ name: l.med.name, days: l.days, on: l.calendarOn })),
    newMessages: unreadChat(s, GUARDIAN),
  };
}
