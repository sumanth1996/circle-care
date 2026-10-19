import type { State, DoseLog, Checkin, TaskLog, Visit, Handoff, AuditEvent } from "./types";
import { chain } from "./audit";
import { ymd, hm, toMin, minutesOfDay, addDays, uid, at as atTime } from "../lib/time";

export const STATE_VERSION = 5;

// Fictional people. No real health information is used anywhere in Circle Care's demo.
export const ELDER = "m-maggie";
export const GUARDIAN = "m-sarah";
export const CAREGIVER = "m-ana";
export const FAMILY = "m-james";
export const RESPITE = "m-ruth";

export function seed(now = new Date()): State {
  const today = ymd(now);
  const nowMin = minutesOfDay(now);
  const iso = (date: string, time: string) => atTime(date, time).toISOString();

  const meds: State["meds"] = [
    {
      id: "med-lisinopril", name: "Lisinopril", strength: "10 mg", dose: "1 tablet", times: ["08:00"],
      instructions: "Take with a full glass of water.", prescriber: "Dr. Hannah Brooks", purpose: "Blood pressure",
      critical: true, paused: false, pill: { color: "#F7C6A3", shape: "round" },
      history: [{ at: iso(ymd(addDays(now, -40)), "10:12"), by: GUARDIAN, change: "Added to schedule" }],
    },
    {
      id: "med-metformin", name: "Metformin", strength: "500 mg", dose: "1 tablet", times: ["08:00", "18:00"],
      instructions: "Take with food.", prescriber: "Dr. Hannah Brooks", purpose: "Blood sugar",
      critical: false, paused: false, pill: { color: "#FFFFFF", shape: "oval" },
      history: [{ at: iso(ymd(addDays(now, -40)), "10:14"), by: GUARDIAN, change: "Added to schedule" }],
    },
    {
      id: "med-vitd", name: "Vitamin D3", strength: "1,000 IU", dose: "1 softgel", times: ["12:30"],
      instructions: "Take with lunch.", prescriber: "Dr. Hannah Brooks", purpose: "Bone health",
      critical: false, paused: false, pill: { color: "#FFD966", shape: "capsule" },
      history: [{ at: iso(ymd(addDays(now, -3)), "16:05"), by: GUARDIAN, change: "Added to schedule (approved request from Ana)" }],
    },
    {
      id: "med-atorvastatin", name: "Atorvastatin", strength: "20 mg", dose: "1 tablet", times: ["21:00"],
      instructions: "Take at bedtime.", prescriber: "Dr. Hannah Brooks", purpose: "Cholesterol",
      critical: false, paused: false, pill: { color: "#D9E7FF", shape: "oval" },
      history: [{ at: iso(ymd(addDays(now, -40)), "10:15"), by: GUARDIAN, change: "Added to schedule" }],
    },
  ];

  // Dose history: last 7 days mostly taken, one miss, one refusal — gives the
  // weekly digest a realistic trend. Today: everything due more than 60 min ago
  // is taken; the most recent due dose is left open to show escalation.
  const doses: DoseLog[] = [];
  for (let d = 7; d >= 0; d--) {
    const date = ymd(addDays(now, -d));
    for (const m of meds) {
      for (const t of m.times) {
        if (d === 0 && toMin(t) > nowMin - 60) continue;
        if (m.id === "med-vitd" && d > 3) continue;
        let status: DoseLog["status"] = "taken";
        if (d === 5 && t === "18:00") status = "skipped";
        if (d === 2 && m.id === "med-atorvastatin") status = "refused";
        const caregiverHours = toMin(t) >= 480 && toMin(t) < 840;
        doses.push({
          id: uid("dose"), medId: m.id, date, time: t, status,
          by: caregiverHours ? CAREGIVER : ELDER,
          at: iso(date, hm(new Date(atTime(date, t).getTime() + 6 * 60000))),
          verified: caregiverHours,
          reason: status === "skipped" ? "Out at a family dinner" : status === "refused" ? "Felt unwell, will ask doctor" : undefined,
        });
      }
    }
  }

  const checkins: Checkin[] = [];
  for (let d = 9; d >= 1; d--) {
    if (d === 4) continue; // one missed day breaks the streak earlier in the week
    checkins.push({ date: ymd(addDays(now, -d)), at: iso(ymd(addDays(now, -d)), "08:3" + (d % 10)), mood: ["😊", "🙂", "😊", "😌"][d % 4] });
  }
  if (nowMin > toMin("08:40")) checkins.push({ date: today, at: iso(today, "08:40"), mood: "😊" });

  const tasks: State["tasks"] = [
    { id: "t-breakfast", title: "Breakfast", icon: "coffee", time: "08:30", recurrence: "daily", assignee: "caregiver" },
    { id: "t-bath", title: "Help with shower", icon: "droplets", time: "09:30", recurrence: "weekdays", assignee: "caregiver" },
    { id: "t-walk", title: "Morning walk, 15 minutes", icon: "footprints", time: "10:30", recurrence: "daily", assignee: "caregiver" },
    { id: "t-lunch", title: "Lunch", icon: "utensils", time: "12:30", recurrence: "daily", assignee: "caregiver" },
    { id: "t-water", title: "Drink a glass of water", icon: "glass-water", time: "15:00", recurrence: "daily", assignee: "elder" },
    { id: "t-call", title: "Evening call with Sarah", icon: "phone", time: "19:00", recurrence: "daily", assignee: "elder" },
  ];
  const taskLogs: TaskLog[] = [];
  for (let d = 6; d >= 0; d--) {
    const date = ymd(addDays(now, -d));
    for (const t of tasks) {
      if (d === 0 && toMin(t.time) > nowMin - 30) continue;
      if (d === 3 && t.id === "t-walk") continue;
      taskLogs.push({ taskId: t.id, date, by: t.assignee === "elder" ? ELDER : CAREGIVER, at: iso(date, t.time) });
    }
  }

  const shifts: State["shifts"] = [
    { id: "s-ana", caregiverId: CAREGIVER, days: [1, 2, 3, 4, 5, 6], start: "08:00", end: "14:00", accepted: true },
    { id: "s-james", caregiverId: FAMILY, days: [0], start: "10:00", end: "16:00", accepted: true },
    { id: "s-evening", caregiverId: null, days: [1, 3, 5], start: "17:00", end: "20:00", accepted: false },
  ];

  // Visits: past week + today (checked in if the shift has started).
  const visits: Visit[] = [];
  const handoffs: Handoff[] = [];
  for (let d = 6; d >= 1; d--) {
    const date = addDays(now, -d);
    const day = date.getDay();
    const shift = shifts.find((s) => s.caregiverId && s.days.includes(day));
    if (!shift || !shift.caregiverId) continue;
    const id = uid("visit");
    visits.push({ id, shiftId: shift.id, caregiverId: shift.caregiverId, date: ymd(date), checkIn: iso(ymd(date), shift.start.replace(/:00$/, ":02")), checkOut: iso(ymd(date), shift.end.replace(/:00$/, ":05")) });
    handoffs.push({
      id: uid("ho"), visitId: id, by: shift.caregiverId, at: iso(ymd(date), shift.end.replace(/:00$/, ":04")),
      mood: "Cheerful", meals: "Ate most of breakfast and lunch", concerns: d === 1 ? "Slightly stiff knee after the walk; kept it short." : "None",
      notes: d === 1 ? "Maggie asked about Sunday's family lunch. Reminder card left on the fridge." : "Good day overall.",
      summary: "All doses given. All tasks done.",
      acknowledgedBy: d === 1 ? undefined : shift.caregiverId, acknowledgedAt: d === 1 ? undefined : iso(ymd(addDays(date, 1)), "08:03"),
    });
  }
  const todayShift = shifts.find((s) => s.caregiverId && s.days.includes(now.getDay()));
  if (todayShift && todayShift.caregiverId) {
    visits.push({
      id: "visit-today", shiftId: todayShift.id, caregiverId: todayShift.caregiverId, date: today,
      checkIn: nowMin >= toMin(todayShift.start) ? iso(today, todayShift.start.replace(/:00$/, ":02")) : undefined,
    });
  }

  const audit: AuditEvent[] = chain([
    { id: uid("a"), at: iso(ymd(addDays(now, -2)), "09:14"), actorId: GUARDIAN, action: "viewed", resource: "medications" },
    { id: uid("a"), at: iso(ymd(addDays(now, -1)), "08:05"), actorId: CAREGIVER, action: "viewed", resource: "today's schedule" },
    { id: uid("a"), at: iso(ymd(addDays(now, -1)), "14:04"), actorId: CAREGIVER, action: "created", resource: "a shift hand-off" },
    { id: uid("a"), at: iso(ymd(addDays(now, -1)), "19:20"), actorId: GUARDIAN, action: "viewed", resource: "the activity feed" },
    { id: uid("a"), at: iso(ymd(addDays(now, -1)), "20:02"), actorId: FAMILY, action: "viewed", resource: "care notes" },
  ]);

  return {
    version: STATE_VERSION,
    persona: null,
    signedIn: { elder: false, caregiver: false, guardian: false },
    clockOffsetMin: 0,
    elderId: ELDER,
    members: [
      { id: ELDER, name: "Margaret Lee", short: "Maggie", role: "elder", relation: "You", phone: "+1 (616) 555-0141", color: "#FF9F0A", photo: "elder", status: "active" },
      { id: GUARDIAN, name: "Sarah Lee", short: "Sarah", role: "guardian", relation: "Daughter · Healthcare power of attorney", phone: "+1 (616) 555-0177", color: "#5E5CE6", photo: "family", status: "active", verification: "verified", favorite: true },
      { id: CAREGIVER, name: "Ana Rivera", short: "Ana", role: "pro", relation: "Home care aide", phone: "+1 (616) 555-0102", color: "#30B0C7", status: "active", favorite: true },
      { id: FAMILY, name: "James Lee", short: "James", role: "family", relation: "Grandson", phone: "+1 (616) 555-0119", color: "#34C759", status: "active", favorite: true },
      { id: RESPITE, name: "Ruth Okafor", short: "Ruth", role: "pro", relation: "Respite caregiver", phone: "+1 (616) 555-0188", color: "#FF6482", status: "pending", expiresOn: ymd(addDays(now, 14)), invitedAt: iso(ymd(addDays(now, -1)), "17:30") },
    ],
    meds,
    doses,
    tasks,
    taskLogs,
    shifts,
    visits,
    handoffs,
    sos: [
      { id: "sos-past", startedAt: iso(ymd(addDays(now, -6)), "16:20"), status: "resolved", step: 0, responderId: GUARDIAN, acknowledgedAt: iso(ymd(addDays(now, -6)), "16:21"), resolvedAt: iso(ymd(addDays(now, -6)), "16:40"), outcome: "Maggie felt dizzy after standing up. Sarah came over; she was fine after resting.", via: "app" },
    ],
    checkins,
    approvals: [
      {
        id: "ap-metformin", kind: "med-change", title: "Move evening Metformin to 6:30 PM",
        detail: "Maggie has been eating dinner closer to 6:30. Metformin should be taken with food.",
        requestedBy: CAREGIVER, at: iso(today, "08:20"), status: "pending",
        payload: { medId: "med-metformin", from: "18:00", to: "18:30" },
      },
      {
        id: "ap-ruth", kind: "member", title: "Add Ruth Okafor as respite caregiver for 2 weeks",
        detail: "Covers Ana's vacation. Access ends automatically after 14 days.",
        requestedBy: FAMILY, at: iso(ymd(addDays(now, -1)), "17:30"), status: "pending",
        payload: { memberId: RESPITE },
      },
      {
        id: "ap-vitd", kind: "med-change", title: "Add Vitamin D3 with lunch",
        detail: "Recommended at the last check-up.", requestedBy: CAREGIVER,
        at: iso(ymd(addDays(now, -3)), "11:00"), status: "approved", decidedAt: iso(ymd(addDays(now, -3)), "16:05"),
        note: "Approved after talking with Dr. Brooks.", elderSeen: false,
      },
    ],
    notes: [
      { id: uid("n"), by: GUARDIAN, at: iso(ymd(addDays(now, -2)), "19:40"), text: "Mom's eye appointment is moved to next Thursday at 10 AM. I'll drive her.", visibility: "everyone" },
      { id: uid("n"), by: CAREGIVER, at: iso(ymd(addDays(now, -1)), "13:50"), text: "We tried the new walking route by the park. Maggie loved the ducks!", visibility: "everyone" },
    ],
    docs: [
      { id: uid("d"), name: "Care plan — spring update.pdf", kind: "Care plan", by: GUARDIAN, at: iso(ymd(addDays(now, -30)), "11:00"), size: "212 KB" },
      { id: uid("d"), name: "Hospital discharge summary.pdf", kind: "Discharge summary", by: GUARDIAN, at: iso(ymd(addDays(now, -55)), "15:30"), size: "488 KB" },
      { id: uid("d"), name: "Healthcare power of attorney.pdf", kind: "Legal authority", by: GUARDIAN, at: iso(ymd(addDays(now, -60)), "09:00"), size: "1.1 MB", status: "verified" },
    ],
    appointments: appointmentsSeed(now),
    health: { heightCm: 163, birthYear: 1946, device: "Maggie's watch", overrides: [] },
    audit,
    alerts: [
      { id: uid("al"), at: iso(ymd(addDays(now, -1)), "17:30"), to: ["guardian"], title: "You have a new request in Circle Care", detail: "James asked to add Ruth Okafor as a respite caregiver for 2 weeks.", severity: "info", read: [], link: "/app/guardian/approvals" },
      { id: uid("al"), at: iso(today, "08:20"), to: ["guardian"], title: "You have a new request in Circle Care", detail: "Ana asked to move evening Metformin to 6:30 PM.", severity: "info", read: [], link: "/app/guardian/approvals" },
    ],
    settings: {
      checkinWindow: { start: "08:00", end: "10:00" },
      escalation: [GUARDIAN, CAREGIVER, FAMILY],
      escalationDelayMin: 2,
      doseEscalation: { caregiverMin: 30, guardianMin: 60 },
      quietHours: { on: true, start: "22:00", end: "07:00" },
      channels: { push: true, sms: true, email: false },
      criticalBypass: true,
      textSize: "xl",
      highContrast: false,
      readAloud: true,
      sharingPaused: false,
      consent: { version: "1.0", at: iso(ymd(addDays(now, -60)), "10:00"), by: ELDER },
      sessionLockMin: 15,
      elderLockMin: 0,
      toured: {},
      vitals: { intervalMin: 30, thresholds: { hrHigh: 110, hrLow: 50, hrJump: 25, spo2Low: 92, spo2Drop: 4 }, shareWithGuardian: true },
      emergencyCard: {
        allergies: "Penicillin",
        conditions: "High blood pressure, type 2 diabetes",
        directives: "Healthcare power of attorney: Sarah Lee",
        bloodType: "O+",
        approvedByElder: true,
        approvedAt: iso(ymd(addDays(now, -20)), "11:00"),
      },
    },
  };
}

/** Medication-related appointments around today, including two on the same day. */
function appointmentsSeed(now: Date): State["appointments"] {
  const d = (n: number) => ymd(addDays(now, n));
  // The care note says the eye appointment is next Thursday at 10 AM.
  const toThu = ((4 - now.getDay() + 7) % 7) || 7;
  const a = (n: number, time: string, kind: State["appointments"][number]["kind"], title: string, provider: string, location: string, medIds: string[], extra: Partial<State["appointments"][number]> = {}) => ({
    id: uid("appt"), date: d(n), time, durationMin: kind === "refill" ? 15 : kind === "lab" ? 20 : 45, kind, title, provider, location, medIds,
    status: (n < 0 ? "done" : "scheduled") as "done" | "scheduled", createdBy: GUARDIAN, ...extra,
  });
  return [
    a(-12, "16:00", "refill", "Pick up Atorvastatin refill", "Lakeshore Pharmacy", "212 Lake St", ["med-atorvastatin"], { escortId: FAMILY }),
    a(-6, "10:30", "doctor", "Blood pressure check", "Dr. Hannah Brooks", "Grand River Family Medicine", ["med-lisinopril"], { escortId: GUARDIAN }),
    a(-3, "09:00", "review", "Pharmacist medication review", "Lakeshore Pharmacy", "Phone call", ["med-lisinopril", "med-metformin", "med-vitd", "med-atorvastatin"]),
    a(0, "16:30", "refill", "Pick up Metformin refill", "Lakeshore Pharmacy", "212 Lake St", ["med-metformin"], { escortId: CAREGIVER }),
    a(2, "08:15", "lab", "A1c and kidney blood test", "Grand River Lab", "Suite 110, 400 Fulton St", ["med-metformin", "med-lisinopril"], { prep: "No food after midnight. Take morning medicines after the test.", escortId: CAREGIVER }),
    a(2, "11:00", "doctor", "Diabetes follow-up", "Dr. Hannah Brooks", "Grand River Family Medicine", ["med-metformin"], { escortId: CAREGIVER, prep: "Bring the glucose log." }),
    a(toThu, "10:00", "doctor", "Eye exam (diabetes screening)", "Dr. Omar Patel", "Lakeview Eye Care", ["med-metformin"], { escortId: GUARDIAN, prep: "Pupils will be dilated — bring sunglasses." }),
    a(9, "14:00", "refill", "Lisinopril 90-day refill", "Lakeshore Pharmacy", "Mail order", ["med-lisinopril"]),
    a(14, "09:30", "lab", "Cholesterol panel", "Grand River Lab", "Suite 110, 400 Fulton St", ["med-atorvastatin"], { prep: "Fasting for 10 hours." }),
    a(14, "13:00", "refill", "Vitamin D3 refill", "Lakeshore Pharmacy", "212 Lake St", ["med-vitd"], { escortId: FAMILY }),
    a(16, "15:00", "doctor", "Cardiology follow-up", "Dr. Lena Ortiz", "Mercy Heart Center", ["med-lisinopril", "med-atorvastatin"], { escortId: GUARDIAN, prep: "Bring the heart-rate report from the Health tab." }),
    a(21, "10:00", "review", "Annual medication review", "Dr. Hannah Brooks", "Grand River Family Medicine", ["med-lisinopril", "med-metformin", "med-vitd", "med-atorvastatin"], { escortId: GUARDIAN }),
    a(28, "16:00", "refill", "Metformin refill", "Lakeshore Pharmacy", "212 Lake St", ["med-metformin"]),
    a(35, "08:30", "lab", "Kidney function test", "Grand River Lab", "Suite 110, 400 Fulton St", ["med-metformin"]),
  ];
}
