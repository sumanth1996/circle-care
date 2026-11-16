import type { State, DoseLog, Checkin, TaskLog, Visit, Handoff, AuditEvent, DailyLog, Feeling, Meal, ChatMessage } from "./types";
import { chain } from "./audit";
import { ymd, hm, toMin, minutesOfDay, addDays, uid, at as atTime } from "../lib/time";

export const STATE_VERSION = 18;

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

  // CC-120: each bottle was counted at midnight; doses taken since then come off the count.
  // Atorvastatin starts with 6 days left so the low-supply alert and Calendar refill show (CC-121).
  const counted = iso(today, "00:00");
  const meds: State["meds"] = [
    {
      id: "med-lisinopril", name: "Lisinopril", strength: "10 mg", dose: "1 tablet", times: ["08:00"],
      instructions: "Take with a full glass of water.", prescriber: "Dr. Hannah Brooks", purpose: "Blood pressure",
      critical: true, paused: false, pill: { color: "#F7C6A3", shape: "round" },
      supply: { count: 12, countedAt: counted, perDose: 1, pharmacy: "Fog City Pharmacy" },
      history: [{ at: iso(ymd(addDays(now, -40)), "10:12"), by: GUARDIAN, change: "Added to schedule" }],
    },
    {
      id: "med-metformin", name: "Metformin", strength: "500 mg", dose: "1 tablet", times: ["08:00", "18:00"],
      instructions: "Take with food.", prescriber: "Dr. Hannah Brooks", purpose: "Blood sugar",
      critical: false, paused: false, pill: { color: "#FFFFFF", shape: "oval" },
      supply: { count: 50, countedAt: counted, perDose: 1, pharmacy: "Fog City Pharmacy" },
      history: [{ at: iso(ymd(addDays(now, -40)), "10:14"), by: GUARDIAN, change: "Added to schedule" }],
    },
    {
      id: "med-vitd", name: "Vitamin D3", strength: "1,000 IU", dose: "1 softgel", times: ["12:30"],
      instructions: "Take with lunch.", prescriber: "Dr. Hannah Brooks", purpose: "Bone health",
      critical: false, paused: false, pill: { color: "#FFD966", shape: "capsule" },
      supply: { count: 57, countedAt: counted, perDose: 1, pharmacy: "Fog City Pharmacy" },
      history: [{ at: iso(ymd(addDays(now, -3)), "16:05"), by: GUARDIAN, change: "Added to schedule (approved request from Ana)" }],
    },
    {
      id: "med-atorvastatin", name: "Atorvastatin", strength: "20 mg", dose: "1 tablet", times: ["21:00"],
      instructions: "Take at bedtime.", prescriber: "Dr. Hannah Brooks", purpose: "Cholesterol",
      critical: false, paused: false, pill: { color: "#D9E7FF", shape: "oval" },
      supply: { count: 6, countedAt: counted, perDose: 1, pharmacy: "Fog City Pharmacy" },
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

  // CC-142: a week of Maggie's optional feeling, water and meal check-ins. Four days ago she logged no feeling.
  const feelings: Feeling[] = ["good", "great", "calm", "good", "okay", "uneasy", "good", "calm"];
  const dailyLogs: DailyLog[] = [];
  for (let d = 7; d >= 1; d--) {
    const date = ymd(addDays(now, -d));
    if (d === 4) { dailyLogs.push({ date, water: 3, meals: ["breakfast", "lunch", "dinner"], updatedAt: iso(date, "19:10") }); continue; }
    const meals: Meal[] = d === 3 ? ["breakfast", "dinner"] : ["breakfast", "lunch", "dinner"];
    dailyLogs.push({ date, feeling: feelings[d], feelingAt: iso(date, "08:4" + d), water: 4 + (d % 4), meals, updatedAt: iso(date, "19:3" + d) });
  }
  if (nowMin > toMin("08:45")) {
    const meals: Meal[] = (["breakfast", "lunch", "dinner"] as Meal[]).filter((_, i) => nowMin > toMin(["09:00", "13:00", "19:00"][i]));
    dailyLogs.push({ date: today, feeling: "good", feelingAt: iso(today, "08:45"), water: Math.min(5, Math.max(1, Math.floor((nowMin - 480) / 110))), meals, updatedAt: iso(today, hm(now)) });
  }

  // CC-164: the family chat. Ana (paid caregiver) isn't in it until Maggie or Sarah adds her.
  const chatMessages: ChatMessage[] = [
    { id: "msg-1", by: FAMILY, at: iso(ymd(addDays(now, -2)), "18:10"), text: "Found the photos from Ocean Beach on Sunday. Adding them to the family album tonight." },
    { id: "msg-2", by: ELDER, at: iso(ymd(addDays(now, -2)), "18:32"), text: "Thank you James. The one with the kite is my favorite.", via: "voice" },
    { id: "msg-3", by: GUARDIAN, at: iso(ymd(addDays(now, -1)), "12:05"), text: "I'm bringing dinner on Saturday. Mom, would you like the noodle soup from Clement Street?" },
    { id: "msg-4", by: ELDER, at: iso(ymd(addDays(now, -1)), "12:40"), text: "Yes please. And the sesame bread.", via: "voice" },
    { id: "msg-5", by: FAMILY, at: iso(today, "07:45"), text: "The Giants have a day game at Oracle Park next Sunday. Grandma, want to come with me?" },
  ];

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

  const appointments = appointmentsSeed(now);
  return {
    version: STATE_VERSION,
    persona: null,
    signedIn: { elder: false, caregiver: false, guardian: false, family: false },
    clockOffsetMin: 0,
    elderId: ELDER,
    members: [
      { id: ELDER, name: "Margaret Lee", short: "Maggie", role: "elder", relation: "You", phone: "+1 (415) 555-0141", color: "#FF9F0A", photo: "elder", status: "active" },
      { id: GUARDIAN, name: "Sarah Lee", short: "Sarah", role: "guardian", relation: "Daughter · Healthcare power of attorney", phone: "+1 (415) 555-0177", color: "#5E5CE6", photo: "family", status: "active", verification: "verified", favorite: true },
      { id: CAREGIVER, name: "Ana Rivera", short: "Ana", role: "pro", relation: "Home care aide", phone: "+1 (415) 555-0102", color: "#30B0C7", status: "active", favorite: true },
      { id: FAMILY, name: "James Lee", short: "James", role: "family", relation: "Grandson", phone: "+1 (415) 555-0119", color: "#34C759", status: "active", favorite: true },
      { id: RESPITE, name: "Ruth Okafor", short: "Ruth", role: "pro", relation: "Respite caregiver", phone: "+1 (415) 555-0188", color: "#FF6482", status: "pending", expiresOn: ymd(addDays(now, 14)), invitedAt: iso(ymd(addDays(now, -1)), "17:30") },
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
    dailyLogs,
    chat: { messages: chatMessages, pros: [], readAt: { [GUARDIAN]: iso(ymd(addDays(now, -1)), "13:00"), [ELDER]: iso(ymd(addDays(now, -1)), "12:41"), [FAMILY]: iso(today, "07:46") }, joinedAt: {} },
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
      { id: uid("n"), by: CAREGIVER, at: iso(ymd(addDays(now, -1)), "13:50"), text: "We tried the new walking route around Stow Lake in Golden Gate Park. Maggie loved the ducks!", visibility: "everyone" },
    ],
    docs: [
      { id: uid("d"), name: "Care plan — spring update.pdf", kind: "Care plan", by: GUARDIAN, at: iso(ymd(addDays(now, -30)), "11:00"), size: "212 KB" },
      { id: uid("d"), name: "Hospital discharge summary.pdf", kind: "Discharge summary", by: GUARDIAN, at: iso(ymd(addDays(now, -55)), "15:30"), size: "488 KB" },
      { id: uid("d"), name: "Healthcare power of attorney.pdf", kind: "Legal authority", by: GUARDIAN, at: iso(ymd(addDays(now, -60)), "09:00"), size: "1.1 MB", status: "verified" },
    ],
    appointments,
    help: helpSeed(now, appointments),
    plans: [],
    calls: callsSeed(now, tasks),
    aboutMe: aboutMeSeed(now),
    aways: [],
    // Sprint 22: one note from Sarah that is always on Maggie's home. Already read aloud once.
    quietDays: [],
    memoryAids: [{ id: "aid-keys", text: "Your keys are in the blue bowl by the door.", kind: "always", by: GUARDIAN, at: iso(ymd(addDays(now, -3)), "18:05"), spokenAt: iso(ymd(addDays(now, -3)), "18:30") }],
    scams: [],
    scamTips: { done: [], notNow: 0 },
    filesToDelete: [],
    health: { heightCm: 163, birthYear: 1946, device: "Maggie's watch", overrides: [] },
    audit,
    alerts: [
      { id: uid("al"), at: iso(ymd(addDays(now, -1)), "17:30"), to: ["guardian"], title: "You have a new request in Circle Care", detail: "James asked to add Ruth Okafor as a respite caregiver for 2 weeks.", severity: "info", read: [], link: "/app/guardian/approvals" },
      { id: uid("al"), at: iso(today, "08:20"), to: ["guardian"], title: "You have a new request in Circle Care", detail: "Ana asked to move evening Metformin to 6:30 PM.", severity: "info", read: [], link: "/app/guardian/approvals" },
    ],
    reminders: [],
    settings: {
      checkinWindow: { start: "08:00", end: "10:00" },
      escalation: [GUARDIAN, CAREGIVER, FAMILY],
      escalationDelayMin: 2,
      doseEscalation: { caregiverMin: 30, guardianMin: 60 },
      quietHours: { on: true, start: "22:00", end: "07:00" },
      reminderRepeats: 3,
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
      refillAlertDays: 7,
      dailyLog: { shareWithGuardian: true, waterGoal: 6 },
      elderChatOnHome: true,
      recapNotify: true,
      helpFrom: [FAMILY],
      adminTo: [],
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
    status: (n < 0 ? "done" : "scheduled") as "done" | "scheduled", createdBy: GUARDIAN,
    // CC-218: the demo starts with past visits already reminded about, so loading it doesn't fire old reminders.
    ...(n < 0 ? { notesReminded: true } : {}), ...extra,
  });
  return [
    a(-12, "16:00", "refill", "Pick up Atorvastatin refill", "Fog City Pharmacy", "1840 Irving St, San Francisco, CA", ["med-atorvastatin"], { escortId: FAMILY }),
    a(-6, "10:30", "doctor", "Blood pressure check", "Dr. Hannah Brooks", "Golden Gate Family Medicine, 2100 Webster St, San Francisco, CA", ["med-lisinopril"], { escortId: GUARDIAN }),
    a(-3, "09:00", "review", "Pharmacist medication review", "Fog City Pharmacy", "Phone call", ["med-lisinopril", "med-metformin", "med-vitd", "med-atorvastatin"]),
    a(0, "16:30", "refill", "Pick up Metformin refill", "Fog City Pharmacy", "1840 Irving St, San Francisco, CA", ["med-metformin"], { escortId: CAREGIVER }),
    a(2, "08:15", "lab", "A1c and kidney blood test", "Bay Area Lab", "Suite 210, 3801 Sacramento St, San Francisco, CA", ["med-metformin", "med-lisinopril"], { prep: "No food after midnight. Take morning medicines after the test.", escortId: CAREGIVER }),
    a(2, "11:00", "doctor", "Diabetes follow-up", "Dr. Hannah Brooks", "Golden Gate Family Medicine, 2100 Webster St, San Francisco, CA", ["med-metformin"], { escortId: CAREGIVER, prep: "Bring the glucose log." }),
    a(toThu, "10:00", "doctor", "Eye exam (diabetes screening)", "Dr. Omar Patel", "Presidio Eye Care, 3700 California St, San Francisco, CA", ["med-metformin"], { escortId: GUARDIAN, prep: "Pupils will be dilated — bring sunglasses." }),
    a(9, "14:00", "refill", "Lisinopril 90-day refill", "Fog City Pharmacy", "Mail order", ["med-lisinopril"]),
    a(14, "09:30", "lab", "Cholesterol panel", "Bay Area Lab", "Suite 210, 3801 Sacramento St, San Francisco, CA", ["med-atorvastatin"], { prep: "Fasting for 10 hours." }),
    a(14, "13:00", "refill", "Vitamin D3 refill", "Fog City Pharmacy", "1840 Irving St, San Francisco, CA", ["med-vitd"], { escortId: FAMILY }),
    a(16, "15:00", "doctor", "Cardiology follow-up", "Dr. Lena Ortiz", "Bay Heart Center, 1100 Van Ness Ave, San Francisco, CA", ["med-lisinopril", "med-atorvastatin"], { escortId: GUARDIAN, prep: "Bring the heart-rate report from the Health tab." }),
    a(21, "10:00", "review", "Annual medication review", "Dr. Hannah Brooks", "Golden Gate Family Medicine, 2100 Webster St, San Francisco, CA", ["med-lisinopril", "med-metformin", "med-vitd", "med-atorvastatin"], { escortId: GUARDIAN }),
    a(28, "16:00", "refill", "Metformin refill", "Fog City Pharmacy", "1840 Irving St, San Francisco, CA", ["med-metformin"]),
    a(35, "08:30", "lab", "Kidney function test", "Bay Area Lab", "Suite 210, 3801 Sacramento St, San Francisco, CA", ["med-metformin"]),
  ];
}

/** CC-209, CC-210: two open requests and one James finished, all fictional. */
function helpSeed(now: Date, appointments: State["appointments"]): State["help"] {
  const d = (n: number) => ymd(addDays(now, n));
  const iso = (date: string, time: string) => atTime(date, time).toISOString();
  const lab = appointments.find((a) => a.title === "Cholesterol panel");
  const toSat = ((6 - now.getDay() + 7) % 7) || 7;
  const posted = iso(d(-1), "19:10");
  return [
    {
      id: "help-ride", kind: "ride", note: "Pick Mom up at 9 and bring her home after.", date: lab?.date ?? d(14), time: "09:00", appointmentId: lab?.id,
      audience: [FAMILY, CAREGIVER], by: GUARDIAN, at: posted, status: "open", rev: 1, history: [{ at: posted, by: GUARDIAN, change: "Posted" }],
    },
    {
      id: "help-company", kind: "company", note: "Sit with Mom on Saturday afternoon while I'm at work. She'd love a card game.", date: d(toSat), time: "14:00",
      audience: [FAMILY], by: GUARDIAN, at: posted, status: "open", rev: 1, history: [{ at: posted, by: GUARDIAN, change: "Posted" }],
    },
    {
      id: "help-groceries", kind: "groceries", note: "Milk, bread, bananas and the noodle soup from Clement Street.", date: d(-2), time: "17:00",
      audience: [FAMILY, CAREGIVER], by: GUARDIAN, at: iso(d(-3), "09:00"), status: "done", claimedBy: FAMILY, claimedAt: iso(d(-3), "09:40"), doneBy: FAMILY, closedAt: iso(d(-2), "17:45"), rev: 3,
      history: [{ at: iso(d(-3), "09:00"), by: GUARDIAN, change: "Posted" }, { at: iso(d(-3), "09:40"), by: FAMILY, change: "Claimed" }, { at: iso(d(-2), "17:45"), by: FAMILY, change: "Done" }],
    },
  ];
}

/** CC-219: Maggie has written two sections and Sarah one; "Things I don't want" is still empty. All fictional. */
function aboutMeSeed(now: Date): State["aboutMe"] {
  const iso = (n: number, time: string) => atTime(ymd(addDays(now, n)), time).toISOString();
  return {
    sarahCanEdit: true,
    elderSeenAt: iso(-1, "18:00"),
    sections: [
      { key: "day", text: "I wake up around 7 and like my tea before anything else. I nap after lunch, and I like the radio on in the afternoon.", by: ELDER, at: iso(-5, "10:10"), sharedWith: [GUARDIAN, CAREGIVER] },
      { key: "help", text: "Tell me what you are going to do before you do it. Let me press the buttons myself. Speak up a little, but please don't shout.", by: ELDER, at: iso(-5, "10:20"), sharedWith: [GUARDIAN, CAREGIVER] },
      { key: "food", text: "Oatmeal with banana in the morning. I love a bowl of soup at lunch. Nothing too spicy.", by: GUARDIAN, at: iso(-4, "19:00"), sharedWith: [GUARDIAN, FAMILY] },
    ],
  };
}

/** CC-226 – CC-227: three calls Sarah logged, two with Maggie's (fictional) insurer, one with a next step. */
function callsSeed(now: Date, tasks: State["tasks"]): State["calls"] {
  const d = (n: number) => ymd(addDays(now, n));
  const iso = (n: number, time: string) => atTime(d(n), time).toISOString();
  const taskId = "t-call-lab-bill";
  tasks.push({ id: taskId, title: "Bayside Health Plan: Call back about the lab bill", icon: "phone", time: "10:00", recurrence: "once", date: d(12), assignee: GUARDIAN, callId: "call-3" });
  return [
    { id: "call-1", org: "Bayside Health Plan", date: d(-9), contact: "Priya, member services", outcome: "Approved the test strips for another 90 days.", ref: "BHP44712209", by: GUARDIAN, at: iso(-9, "11:20") },
    { id: "call-2", org: "Fog City Pharmacy", date: d(-4), contact: "Tom, pharmacist", outcome: "Lisinopril moves to mail order from next month.", by: GUARDIAN, at: iso(-4, "15:05") },
    { id: "call-3", org: "Bayside Health Plan", date: d(-2), contact: "Marcus, claims", outcome: "They will review the lab bill again. Call back if no letter comes.", ref: "CLM88120773", nextStep: { text: "Call back about the lab bill", owner: GUARDIAN, date: d(12), taskId }, by: GUARDIAN, at: iso(-2, "09:40") },
  ];
}
