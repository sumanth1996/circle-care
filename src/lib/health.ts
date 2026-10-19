// Health readings and activity for the guardian Health view (CC-84 – CC-93).
//
// In production these come from the elder's watch or health devices through
// HealthKit / Health Connect, synced to the server on a schedule. In this
// prototype they are simulated: every reading is generated deterministically
// from the date and time slot, so the same moment always shows the same value
// and a new reading "arrives" each time a slot passes (every 30 minutes by
// default). No real person's health data is used.

import { at, pad, toMin } from "./time";

export type VitalReading = { at: string; slot: number; hr: number; spo2: number; asleep: boolean };
export type VitalOverride = { at: string; hr?: number; spo2?: number };

export interface VitalThresholds {
  hrHigh: number;
  hrLow: number;
  /** A change of this many bpm from the previous reading counts as sudden. */
  hrJump: number;
  spo2Low: number;
  /** A drop of this many points from the previous reading counts as sudden. */
  spo2Drop: number;
}

export const DEFAULT_THRESHOLDS: VitalThresholds = { hrHigh: 110, hrLow: 50, hrJump: 25, spo2Low: 92, spo2Drop: 4 };

export type VitalEvent = {
  at: string;
  metric: "hr" | "spo2";
  kind: "high" | "low" | "jump" | "drop";
  value: number;
  previous?: number;
  /** Plain-language explanation, safe to show inside the app. */
  label: string;
};

/** Small deterministic hash → [0, 1). */
export function noise(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const asleepAt = (min: number) => min < 6 * 60 + 30 || min >= 22 * 60 + 15;

/**
 * Built-in demo episodes so the views always have something to explain:
 * today a short run of fast heartbeats in the afternoon and a brief oxygen dip
 * overnight. Real data would come from the device.
 */
function episode(date: string, today: string, min: number): { hr?: number; spo2?: number } {
  if (date !== today) return {};
  if (min === 14 * 60 + 30) return { hr: 128 };
  if (min === 15 * 60) return { hr: 104 };
  if (min === 15 * 60 + 30) return { hr: 88 };
  if (min === 3 * 60) return { spo2: 89 };
  return {};
}

/**
 * Readings for one day, one per interval, up to `now` if the day is today.
 * `intervalMin` defaults to 30 (CC-85).
 */
export function readingsFor(date: string, now: Date, intervalMin = 30, overrides: VitalOverride[] = [], today = date): VitalReading[] {
  const out: VitalReading[] = [];
  const end = date === today ? Math.floor((now.getHours() * 60 + now.getMinutes()) / intervalMin) * intervalMin : 24 * 60 - intervalMin;
  for (let min = 0; min <= end; min += intervalMin) {
    const time = `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
    const asleep = asleepAt(min);
    const n1 = noise(`${date}|${min}|hr`);
    const n2 = noise(`${date}|${min}|o2`);
    // Resting rhythm: lower at night, a gentle rise mid-morning and after the afternoon walk.
    const base = asleep ? 58 : 70 + (min > 9 * 60 && min < 11 * 60 ? 8 : 0) + (min > 13 * 60 + 30 && min < 14 * 60 + 30 ? 10 : 0);
    let hr = Math.round(base + (n1 - 0.5) * 10);
    let spo2 = Math.round(asleep ? 95 + n2 * 2 : 96 + n2 * 3);
    const ep = episode(date, today, min);
    if (ep.hr) hr = ep.hr;
    if (ep.spo2) spo2 = ep.spo2;
    const iso = at(date, time).toISOString();
    const o = overrides.find((x) => x.at === iso);
    if (o?.hr) hr = o.hr;
    if (o?.spo2) spo2 = o.spo2;
    out.push({ at: iso, slot: min, hr, spo2: Math.min(100, spo2), asleep });
  }
  return out;
}

/** Finds out-of-range values and sudden changes between consecutive readings (CC-86, CC-88). */
export function detectEvents(readings: VitalReading[], t: VitalThresholds = DEFAULT_THRESHOLDS): VitalEvent[] {
  const events: VitalEvent[] = [];
  readings.forEach((r, i) => {
    const prev = readings[i - 1];
    if (r.hr >= t.hrHigh) events.push({ at: r.at, metric: "hr", kind: "high", value: r.hr, previous: prev?.hr, label: `Heart rate high: ${r.hr} bpm` });
    else if (r.hr <= t.hrLow && !r.asleep) events.push({ at: r.at, metric: "hr", kind: "low", value: r.hr, previous: prev?.hr, label: `Heart rate low: ${r.hr} bpm` });
    else if (prev && Math.abs(r.hr - prev.hr) >= t.hrJump) events.push({ at: r.at, metric: "hr", kind: "jump", value: r.hr, previous: prev.hr, label: `Sudden heart-rate change: ${prev.hr} → ${r.hr} bpm` });
    if (r.spo2 < t.spo2Low) events.push({ at: r.at, metric: "spo2", kind: "low", value: r.spo2, previous: prev?.spo2, label: `Blood oxygen low: ${r.spo2}%` });
    else if (prev && prev.spo2 - r.spo2 >= t.spo2Drop) events.push({ at: r.at, metric: "spo2", kind: "drop", value: r.spo2, previous: prev.spo2, label: `Sudden oxygen drop: ${prev.spo2}% → ${r.spo2}%` });
  });
  return events;
}

export function summarize(values: number[]) {
  if (!values.length) return { min: 0, max: 0, avg: 0 };
  return { min: Math.min(...values), max: Math.max(...values), avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
}

/** Resting heart rate: average of readings while asleep. */
export function restingHr(readings: VitalReading[]) {
  const asleep = readings.filter((r) => r.asleep).map((r) => r.hr);
  return asleep.length ? Math.round(asleep.reduce((a, b) => a + b, 0) / asleep.length) : null;
}

export const bmi = (kg: number, cm: number) => Math.round((kg / (cm / 100) ** 2) * 10) / 10;

/* ---------------- Activity (CC-89 – CC-92) ---------------- */

export type DayActivity = {
  date: string;
  /** Steps in each hour 0–23 (future hours of today are 0). */
  stepsByHour: number[];
  steps: number;
  /** Hours in which Maggie stood and moved for at least a minute (Apple's "stand hours"). */
  standHours: number;
  standMin: number;
  walkMin: number;
  sleepMin: number;
  restMin: number;
  /** One block per hour: what she mostly did. */
  hours: ("sleep" | "rest" | "stand" | "walk")[];
};

export const GOALS = { standHours: 10, walkMin: 30, steps: 4000, sleepMin: 7 * 60 };

export function activityFor(date: string, now: Date, today = date): DayActivity {
  const lastHour = date === today ? now.getHours() : 23;
  const stepsByHour: number[] = [];
  const hours: DayActivity["hours"] = [];
  let standMin = 0;
  let walkMin = 0;
  let sleepMin = 0;
  let standHours = 0;
  for (let h = 0; h < 24; h++) {
    const n = noise(`${date}|act|${h}`);
    if (h > lastHour) { stepsByHour.push(0); continue; }
    const asleep = h < 6 || h >= 22;
    let kind: DayActivity["hours"][number] = "rest";
    let steps = 0;
    if (asleep) { kind = "sleep"; sleepMin += 60; }
    else if (h === 10 || h === 14) { kind = "walk"; steps = 900 + Math.round(n * 600); walkMin += 18 + Math.round(n * 12); standMin += 25; }
    else if (h === 7 || h === 12 || h === 18) { kind = "stand"; steps = 300 + Math.round(n * 300); walkMin += 4; standMin += 20 + Math.round(n * 10); }
    else { steps = 60 + Math.round(n * 160); standMin += 5 + Math.round(n * 6); }
    if (!asleep && (kind !== "rest" || n > 0.35)) standHours++;
    stepsByHour.push(steps);
    hours.push(kind);
  }
  const restMin = Math.max(0, (lastHour + 1) * 60 - sleepMin - standMin - walkMin);
  return { date, stepsByHour, steps: stepsByHour.reduce((a, b) => a + b, 0), standHours, standMin, walkMin, sleepMin, restMin, hours };
}

/* ---------------- Sleep (CC-91) ---------------- */

export type SleepStage = "awake" | "rem" | "core" | "deep";
export type SleepSegment = { stage: SleepStage; start: number; end: number }; // minutes from 21:00 the night before

/** Last night's sleep: in bed ~22:15, up ~06:30, cycling through stages. */
export function sleepFor(date: string): { segments: SleepSegment[]; asleepMin: number; inBed: string; wake: string; awakenings: number } {
  const segments: SleepSegment[] = [];
  let t = 75; // 22:15
  const end = 9 * 60 + 30; // 06:30
  let cycle = 0;
  let awakenings = 0;
  while (t < end) {
    const n = noise(`${date}|sleep|${cycle}`);
    const plan: [SleepStage, number][] = cycle < 2
      ? [["core", 25 + n * 15], ["deep", 30 + n * 20], ["core", 15], ["rem", 12 + n * 8]]
      : [["core", 35 + n * 15], ["rem", 20 + n * 12], ...(n > 0.55 ? [["awake", 6 + n * 6] as [SleepStage, number]] : [])];
    for (const [stage, len] of plan) {
      if (t >= end) break;
      const e = Math.min(end, Math.round(t + len));
      segments.push({ stage, start: t, end: e });
      if (stage === "awake") awakenings++;
      t = e;
    }
    cycle++;
  }
  const asleepMin = segments.filter((s) => s.stage !== "awake").reduce((a, s) => a + s.end - s.start, 0);
  return { segments, asleepMin, inBed: "22:15", wake: "06:30", awakenings };
}

/* ---------------- Mental well-being (CC-92) ---------------- */

export type Mood = { date: string; valence: number; label: string; source: "check-in" | "none" };

const MOODS: Record<string, [number, string]> = {
  "😊": [2, "Pleasant"],
  "🙂": [1, "Slightly pleasant"],
  "😌": [1, "Calm"],
  "😐": [0, "Neutral"],
  "😕": [-1, "Slightly unpleasant"],
  "😢": [-2, "Unpleasant"],
};

/** Mood comes from Maggie's own daily check-in — she chooses whether to add one. */
export function moodFrom(date: string, emoji?: string): Mood {
  if (!emoji || !MOODS[emoji]) return { date, valence: 0, label: "No check-in mood", source: "none" };
  const [valence, label] = MOODS[emoji];
  return { date, valence, label, source: "check-in" };
}

export function mindfulMinutes(date: string) {
  return Math.round(5 + noise(`${date}|mind`) * 15);
}

/* ---------------- Body measurements (CC-84) ---------------- */

export function weightSeries(today: Date, days = 30) {
  const out: { date: string; kg: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    if (d % 3 !== 0 && d !== 0) continue; // weighed every few days
    out.push({ date: key, kg: Math.round((64.6 - (days - d) * 0.02 + (noise(`${key}|kg`) - 0.5) * 0.6) * 10) / 10 });
  }
  return out;
}

export const minutesToHm = (m: number) => `${Math.floor(m / 60)}h ${pad(Math.round(m % 60))}m`;

export const nextReadingAt = (now: Date, intervalMin: number) => {
  const m = now.getHours() * 60 + now.getMinutes();
  const next = (Math.floor(m / intervalMin) + 1) * intervalMin;
  return `${pad(Math.floor((next % 1440) / 60))}:${pad(next % 60)}`;
};

export const slotLabel = (iso: string) => {
  const d = new Date(iso);
  return toMin(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
};
