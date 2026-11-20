import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate } from "../data/store";
import { clock, currentQuiet, feed, todayOf } from "../data/selectors";
import { setQuiet, endQuiet, quietLine, QUIET_MAX_DAYS } from "../data/quietDays";
import { addAid, editAid, removeAid, setAidOn, seeAid, spokeAid, aidsDue, aidPage, looksLikeCode, canSeeAids, AID_MAX } from "../data/memoryAids";
import {
  reportScam, checkScam, resolveScam, seeScamAnswer, scamAnswer, scamSentLine, elderScams, openScams, runScams, hasGuardian,
  tipCard, tipGotIt, tipNotNow, tipProgress, mondayOf, SCAM_CHECKLIST, SCAM_PHOTO_DAYS,
} from "../data/scams";
import { SCAM_TIPS } from "../data/scamTips";
import { can } from "../data/policy";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 22: confident at home. Resting and away days (CC-129), memory aids (CC-138, CC-139), and scam help
// (CC-132 – CC-134). Times are pinned to the minute; the demo's day of the week is moved where it matters.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, days: number, time = "12:00") => { s.clockOffsetMin += days * 24 * 60; at(s, time); evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };
/** Moves the clock forward to the next given weekday (0 = Sunday), or keeps today if it already is one. */
const toDay = (s: State, dow: number, time = "12:00") => { const d = (dow - clock(s).getDay() + 7) % 7; later(s, d, time); };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
/** Maggie hasn't checked in today. */
const noCheckin = (s: State) => { s.checkins = s.checkins.filter((c) => c.date !== todayOf(s)); };

/* ---------------- CC-129 ---------------- */

describe("Elder sets quiet days (CC-129)", () => {
  it("Resting today pauses the missed check-in prompt and Sarah's alert until midnight", () => {
    const s = seed(); at(s, "07:30"); noCheckin(s); evaluate(s);
    expect(setQuiet(s, ELDER, "resting")).not.toBeNull();
    at(s, "12:00"); evaluate(s);
    expect(keyed(s, "checkin-")).toEqual([]);
    // The next day counts again.
    later(s, 1, "07:00"); noCheckin(s); at(s, "12:00"); evaluate(s);
    expect(keyed(s, `checkin-${todayOf(s)}`)).toHaveLength(1);
  });

  it("pauses the 7 PM nothing-logged reminder and the no-meals note too", () => {
    const s = seed(); at(s, "07:30"); evaluate(s);
    s.dailyLogs = s.dailyLogs.filter((l) => l.date !== todayOf(s));
    for (const d of [1, 2]) { const date = inDays(s, -d); s.dailyLogs = s.dailyLogs.map((l) => (l.date === date ? { ...l, meals: [] } : l)); }
    setQuiet(s, ELDER, "resting");
    at(s, "19:30"); evaluate(s);
    expect(keyed(s, "daily-elder-")).toEqual([]);
    expect(keyed(s, "meals-")).toEqual([]);
  });

  it("Away until takes a date up to 14 days ahead, and refuses a past date or one further out", () => {
    const s = noon();
    expect(setQuiet(s, ELDER, "away", inDays(s, -1))).toBeNull();
    expect(setQuiet(s, ELDER, "away", inDays(s, QUIET_MAX_DAYS + 1))).toBeNull();
    const q = setQuiet(s, ELDER, "away", inDays(s, QUIET_MAX_DAYS));
    expect(q).toMatchObject({ kind: "away", from: todayOf(s), until: inDays(s, QUIET_MAX_DAYS) });
    // Each day of the period is paused.
    later(s, 3, "07:00"); noCheckin(s); at(s, "12:00"); evaluate(s);
    expect(keyed(s, `checkin-${todayOf(s)}`)).toEqual([]);
  });

  it("Sarah sees 'Maggie is resting today' or 'away until' in plain words, with no reason asked", () => {
    const s = noon();
    const r = setQuiet(s, ELDER, "resting")!;
    expect(quietLine(s, r)).toBe("Maggie is resting today");
    const told = keyed(s, `quiet-${r.id}`)[0];
    expect(told).toMatchObject({ to: ["guardian"], severity: "info", title: "Update from Circle Care" });
    expect(told.detail).toBe("Maggie is resting today. Check-in reminders are paused until tonight. Medicine and SOS alerts still come to you.");
    const a = setQuiet(s, ELDER, "away", inDays(s, 4))!;
    expect(quietLine(s, a)).toMatch(/^Maggie is away until \w{3}, \w{3} \d+$/);
    expect(Object.keys(a)).not.toContain("reason");
    // A new choice replaces the one that was on.
    expect(r.endedAt).toBeDefined();
    expect(currentQuiet(s)?.id).toBe(a.id);
  });

  it("SOS, missed-dose and late-caregiver alerts still go out", () => {
    const s = seed(); at(s, "07:30"); evaluate(s);
    setQuiet(s, ELDER, "resting");
    s.doses = s.doses.filter((d) => d.date !== todayOf(s));
    s.visits = s.visits.filter((v) => v.date !== todayOf(s));
    at(s, "11:30"); evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-g-") || a.key?.startsWith("dose-cg-"))).toBe(true);
    if (clock(s).getDay() !== 0) expect(keyed(s, `late-${todayOf(s)}`).length).toBeGreaterThan(0);
  });

  it("I'm back resumes check-ins from the next window, and the change shows in the activity history", () => {
    const s = seed(); at(s, "07:00"); noCheckin(s); evaluate(s);
    setQuiet(s, ELDER, "away", inDays(s, 3));
    at(s, "07:30");
    expect(endQuiet(s, ELDER)).toBe(true);
    // Back before today's 8 AM window: today's check-in counts again.
    at(s, "12:00"); evaluate(s);
    expect(keyed(s, `checkin-${todayOf(s)}`)).toHaveLength(1);
    const lines = feed(s).map((f) => f.text);
    expect(lines.some((t) => t.startsWith("Away until"))).toBe(true);
    expect(lines).toContain("Back. Check-in reminders are on again");
    expect(keyed(s, "quiet-back-")[0].detail).toBe("Maggie says she's back. Check-in reminders are on again from her next check-in.");
  });

  it("back after today's window opened: today stays paused, tomorrow counts", () => {
    const s = seed(); at(s, "07:00"); noCheckin(s); evaluate(s);
    setQuiet(s, ELDER, "away", inDays(s, 3));
    at(s, "09:00"); endQuiet(s, ELDER);
    at(s, "12:00"); evaluate(s);
    expect(keyed(s, `checkin-${todayOf(s)}`)).toEqual([]);
    later(s, 1, "07:00"); noCheckin(s); at(s, "12:00"); evaluate(s);
    expect(keyed(s, `checkin-${todayOf(s)}`)).toHaveLength(1);
  });

  it("only Maggie sets or ends quiet days; others are refused and audited", () => {
    const s = noon();
    for (const who of [GUARDIAN, FAMILY, CAREGIVER]) {
      expect(setQuiet(s, who, "resting")).toBeNull();
      expect(lastAudit(s)).toMatchObject({ actorId: who, action: "denied" });
    }
    setQuiet(s, ELDER, "resting");
    expect(endQuiet(s, GUARDIAN)).toBe(false);
    expect(currentQuiet(s)).toBeDefined();
    expect(can(s, GUARDIAN, "read", "quietDays")).toBe(true);
    expect(can(s, FAMILY, "read", "quietDays")).toBe(true);
    expect(can(s, CAREGIVER, "read", "quietDays")).toBe(false);
    expect(verifyChain(s.audit).ok).toBe(true);
  });
});

/* ---------------- CC-138 ---------------- */

describe("Family writes a memory aid (CC-138)", () => {
  it("adds a note of up to 140 characters, always or once at a date and time, audited without its words", () => {
    const s = noon();
    const a = addAid(s, FAMILY, { text: "Ana comes at 9 tomorrow.", kind: "once", date: inDays(s, 1), time: "08:30" })!;
    expect(a).toMatchObject({ kind: "once", date: inDays(s, 1), time: "08:30", by: FAMILY });
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "created", resource: "a memory aid for Maggie" });
    expect(addAid(s, GUARDIAN, { text: "x".repeat(AID_MAX), kind: "always" })).not.toBeNull();
    expect(addAid(s, GUARDIAN, { text: "x".repeat(AID_MAX + 1), kind: "always" })).toBeNull();
    expect(addAid(s, GUARDIAN, { text: "  ", kind: "always" })).toBeNull();
    expect(addAid(s, GUARDIAN, { text: "Lunch", kind: "once" })).toBeNull();
    expect(addAid(s, GUARDIAN, { text: "Lunch", kind: "once", date: inDays(s, -1), time: "12:00" })).toBeNull();
  });

  it("refuses text that looks like a PIN, door code or password", () => {
    for (const t of ["The door code is 4821", "Your PIN: 1234", "wifi password is sunshine", "Lockbox 0915", "Gate code 77412"]) expect(looksLikeCode(t), t).toBe(true);
    for (const t of ["Your keys are in the blue bowl by the door.", "Ana comes at 9 tomorrow.", "Call Sarah at 555-0177", "Dinner with James in 2026", "Bus 38 at 10:15"]) expect(looksLikeCode(t), t).toBe(false);
    const s = noon();
    expect(addAid(s, GUARDIAN, { text: "The door code is 4821", kind: "always" })).toBeNull();
  });

  it("the writer sees when Maggie tapped Got it", () => {
    const s = noon();
    const a = addAid(s, FAMILY, { text: "Dentist at 3 today.", kind: "once", date: todayOf(s), time: "12:00" })!;
    at(s, "15:02");
    seeAid(s, ELDER, a.id);
    expect(new Date(s.memoryAids.find((x) => x.id === a.id)!.seenAt!).getMinutes()).toBe(2);
  });

  it("Maggie can turn any note off and back on; nobody else can", () => {
    const s = noon();
    const keys = s.memoryAids[0];
    expect(aidsDue(s).always.map((a) => a.id)).toContain(keys.id);
    expect(setAidOn(s, GUARDIAN, keys.id, false)).toBe(false);
    expect(setAidOn(s, ELDER, keys.id, false)).toBe(true);
    expect(aidsDue(s).always).toEqual([]);
    setAidOn(s, ELDER, keys.id, true);
    expect(aidsDue(s).always.map((a) => a.id)).toContain(keys.id);
  });

  it("a caregiver on shift reads notes but can't create or change them", () => {
    const s = noon();
    s.visits = s.visits.filter((v) => !(v.caregiverId === CAREGIVER && v.date === todayOf(s)));
    expect(canSeeAids(s, CAREGIVER)).toBe(false);
    // Ana checks in for her shift.
    s.visits.push({ id: "v-test", shiftId: "s-ana", caregiverId: CAREGIVER, date: todayOf(s), checkIn: clock(s).toISOString() });
    expect(can(s, CAREGIVER, "read", "memoryAids")).toBe(true);
    expect(canSeeAids(s, CAREGIVER)).toBe(true);
    expect(addAid(s, CAREGIVER, { text: "Hello", kind: "always" })).toBeNull();
    expect(editAid(s, CAREGIVER, s.memoryAids[0].id, { text: "Changed", kind: "always" })).toBe(false);
    // Off shift again.
    s.visits.find((v) => v.id === "v-test")!.checkOut = clock(s).toISOString();
    expect(canSeeAids(s, CAREGIVER)).toBe(false);
  });

  it("only the writer or Sarah changes or removes a note; a replaced or removed photo is deleted", () => {
    const s = noon();
    const a = addAid(s, FAMILY, { text: "Glasses are on the shelf.", kind: "always", photoId: "photo-1" })!;
    expect(editAid(s, GUARDIAN, a.id, { text: "Glasses are on the hall shelf.", kind: "always", photoId: "photo-2" })).toBe(true);
    expect(s.filesToDelete).toContain("photo-1");
    const sarahs = s.memoryAids[0];
    expect(removeAid(s, FAMILY, sarahs.id)).toBe(false);
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied" });
    expect(removeAid(s, FAMILY, a.id)).toBe(true);
    expect(s.filesToDelete).toContain("photo-2");
  });
});

/* ---------------- CC-139 ---------------- */

describe("Memory aids shown and read aloud (CC-139)", () => {
  it("a once note shows from its time, until Maggie taps Got it", () => {
    const s = seed(); at(s, "14:00"); evaluate(s);
    const a = addAid(s, GUARDIAN, { text: "Ana is here at 3.", kind: "once", date: todayOf(s), time: "15:00" })!;
    expect(aidsDue(s).once).toEqual([]);
    at(s, "15:00");
    expect(aidsDue(s).once.map((x) => x.id)).toEqual([a.id]);
    seeAid(s, ELDER, a.id);
    expect(aidsDue(s).once).toEqual([]);
  });

  it("an always note leaves her home for the day after Got it and is back tomorrow", () => {
    const s = noon();
    const keys = s.memoryAids[0];
    seeAid(s, ELDER, keys.id);
    expect(aidsDue(s).always).toEqual([]);
    later(s, 1);
    expect(aidsDue(s).always.map((a) => a.id)).toEqual([keys.id]);
  });

  it("is read aloud once; an edit makes it new again", () => {
    const s = noon();
    const a = addAid(s, FAMILY, { text: "Library books are due Friday.", kind: "always" })!;
    expect(spokeAid(s, ELDER, a.id)).toBe(true);
    expect(spokeAid(s, ELDER, a.id)).toBe(false);
    editAid(s, FAMILY, a.id, { text: "Library books are due Saturday.", kind: "always" });
    expect(s.memoryAids.find((x) => x.id === a.id)!.spokenAt).toBeUndefined();
  });

  it("with more than 3 always notes, they rotate 3 at a time", () => {
    const s = noon();
    for (const t of ["One", "Two", "Three", "Four"]) addAid(s, GUARDIAN, { text: t, kind: "always" });
    const all = aidsDue(s).always;
    expect(all).toHaveLength(5);
    expect(aidPage(all, 0)).toHaveLength(3);
    expect(aidPage(all, 1).map((a) => a.text)).toEqual(["Three", "Four"]);
    expect(aidPage(all, 2)).toEqual(aidPage(all, 0));
  });
});

/* ---------------- CC-132 ---------------- */

describe("Report a possible scam in one tap (CC-132)", () => {
  it("Maggie reports a phone call; Sarah gets an urgent in-app alert straight away, without the note", () => {
    const s = noon();
    const r = reportScam(s, ELDER, { kind: "call", note: "Said they were from my bank and wanted the code." })!;
    const alert = keyed(s, `scam-${r.id}`)[0];
    expect(alert).toMatchObject({ to: ["guardian"], urgent: true, title: "Circle Care needs your attention", link: `/app/guardian/scams/${r.id}` });
    expect(alert.detail).toBe('Maggie asked "Is this a scam?" about a phone call. Call her before she sends money or shares a code.');
    expect(alert.detail).not.toContain("bank");
    expect(openScams(s).map((x) => x.id)).toEqual([r.id]);
  });

  it("reaches Sarah even in quiet hours", () => {
    const s = seed(); at(s, "23:00"); evaluate(s);
    const r = reportScam(s, ELDER, { kind: "door" })!;
    expect(keyed(s, `scam-${r.id}`)).toHaveLength(1);
  });

  it("Maggie sees what to do at once, or to call someone she trusts when she has no guardian", () => {
    const s = noon();
    expect(scamSentLine(s)).toBe("Don't send money or share codes. Sarah has been told.");
    s.members = s.members.map((m) => (m.role === "guardian" ? { ...m, status: "revoked" as const } : m));
    expect(hasGuardian(s)).toBe(false);
    expect(scamSentLine(s)).toBe("Don't send money or share codes. Hang up and call someone you trust.");
  });

  it("the note and photo reach Maggie and guardians only, never family or caregivers, and never the audit log", () => {
    const s = noon();
    const note = "Card ending 4417, they asked for the code";
    reportScam(s, ELDER, { kind: "text", note, photoId: "photo-scam" });
    for (const who of [FAMILY, CAREGIVER]) expect(can(s, who, "read", "scams")).toBe(false);
    expect(can(s, GUARDIAN, "read", "scams")).toBe(true);
    // Only what each entry says, not its hashes: a random hash can happen to contain "4417".
    const said = JSON.stringify(s.audit.map(({ prev: _p, hash: _h, ...rest }) => rest));
    expect(said).not.toContain("4417");
    expect(said).not.toContain("photo-scam");
    expect(said).not.toContain("they asked for the code");
    expect(lastAudit(s)).toMatchObject({ actorId: ELDER, action: "created", resource: "a scam report" });
    expect(JSON.stringify(s.alerts.map((a) => [a.title, a.detail]))).not.toContain("4417");
  });

  it("only Maggie reports, and only the five kinds", () => {
    const s = noon();
    expect(reportScam(s, GUARDIAN, { kind: "call" })).toBeNull();
    expect(lastAudit(s)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
    expect(reportScam(s, ELDER, { kind: "voicemail" as never })).toBeNull();
  });

  it("the photo is deleted 30 days after the report is resolved", () => {
    const s = noon();
    const r = reportScam(s, ELDER, { kind: "email", photoId: "photo-scam" })!;
    later(s, 40);
    expect(s.scams[0].photoId).toBe("photo-scam"); // still open
    resolveScam(s, GUARDIAN, r.id);
    later(s, SCAM_PHOTO_DAYS - 1);
    expect(s.scams[0].photoId).toBe("photo-scam");
    later(s, 1);
    runScams(s);
    expect(s.scams[0].photoId).toBeUndefined();
    expect(s.scams[0].photoRemovedAt).toBeDefined();
    expect(s.filesToDelete).toContain("photo-scam");
  });
});

/* ---------------- CC-133 ---------------- */

describe("Guardian responds to a scam report (CC-133)", () => {
  it("ticks are shared by every guardian, and only guardians tick", () => {
    const s = noon();
    const r = reportScam(s, ELDER, { kind: "payment" })!;
    expect(checkScam(s, GUARDIAN, r.id, "bank", true)).toBe(true);
    expect(checkScam(s, FAMILY, r.id, "card", true)).toBe(false);
    expect(checkScam(s, GUARDIAN, r.id, "not-an-item", true)).toBe(false);
    expect(s.scams[0].checked).toEqual(["bank"]);
    checkScam(s, GUARDIAN, r.id, "bank", false);
    expect(s.scams[0].checked).toEqual([]);
    expect(SCAM_CHECKLIST.map((c) => c.id)).toEqual(["bank", "card", "codes", "report"]);
    expect(SCAM_CHECKLIST.some((c) => /FTC/.test(c.text) && /attorney general/.test(c.text))).toBe(true);
  });

  it("resolving without a note shows Maggie 'Sarah checked this. You're safe.'", () => {
    const s = noon();
    const r = reportScam(s, ELDER, { kind: "call" })!;
    expect(resolveScam(s, GUARDIAN, r.id)).toBe(true);
    expect(scamAnswer(s, s.scams[0])).toBe("Sarah checked this. You're safe.");
    expect(keyed(s, `scam-safe-${r.id}`)[0]).toMatchObject({ to: ["elder"], detail: "Sarah checked this. You're safe." });
    expect(elderScams(s)).toHaveLength(1);
    seeScamAnswer(s, ELDER, r.id);
    expect(elderScams(s)).toEqual([]);
  });

  it("resolving with a note shows Maggie Sarah's note", () => {
    const s = noon();
    const r = reportScam(s, ELDER, { kind: "text" })!;
    resolveScam(s, GUARDIAN, r.id, "It was a scam. Your card is safe.");
    expect(scamAnswer(s, s.scams[0])).toBe("Sarah: It was a scam. Your card is safe.");
    expect(resolveScam(s, GUARDIAN, r.id)).toBe(false);
    expect(resolveScam(s, FAMILY, r.id)).toBe(false);
  });
});

/* ---------------- CC-134 ---------------- */

describe("Weekly scam-awareness tip (CC-134)", () => {
  it("has 12 tips of 3 sentences with a made-up example, and names no real company", () => {
    expect(SCAM_TIPS).toHaveLength(12);
    for (const t of SCAM_TIPS) {
      expect(t.text.match(/[.!?]["”]?(\s|$)/g)?.length, t.id).toBe(3);
      expect(t.example.length).toBeGreaterThan(10);
      expect(`${t.text} ${t.example}`).not.toMatch(/\b(Amazon|Apple|Google|Microsoft|Wells Fargo|Chase|Bank of America|PayPal|Venmo|Zelle|IRS|Walmart|Target|Facebook|Netflix|FedEx|UPS|USPS)\b/);
    }
  });

  it("shows from Monday 8 AM in Maggie's time zone, once a week", () => {
    const s = noon();
    toDay(s, 1, "07:30");
    expect(tipCard(s)).toBeUndefined();
    at(s, "08:00");
    expect(tipCard(s)?.id).toBe("tip-01");
    expect(mondayOf(clock(s))).toBe(todayOf(s));
  });

  it("Got it marks the tip done and moves the progress on; the next tip waits for next Monday", () => {
    const s = noon();
    toDay(s, 1, "09:00");
    expect(tipProgress(s)).toBe("0 of 12 tips");
    expect(tipGotIt(s, ELDER)).toBe(true);
    expect(tipProgress(s)).toBe("1 of 12 tips");
    expect(tipCard(s)).toBeUndefined();
    later(s, 3);
    expect(tipCard(s)).toBeUndefined();
    later(s, 4, "09:00");
    expect(tipCard(s)?.id).toBe("tip-02");
  });

  it("Not now brings it back the next day, at most twice", () => {
    const s = noon();
    toDay(s, 1, "09:00");
    expect(tipNotNow(s, ELDER)).toBe(true);
    expect(tipCard(s)).toBeUndefined();
    later(s, 1, "09:00");
    expect(tipCard(s)?.id).toBe("tip-01");
    tipNotNow(s, ELDER);
    later(s, 1, "09:00");
    expect(tipCard(s)?.id).toBe("tip-01");
    tipNotNow(s, ELDER);
    later(s, 1, "09:00");
    expect(tipCard(s)).toBeUndefined();
    // A new week starts afresh with the same tip.
    toDay(s, 1, "09:00");
    expect(tipCard(s)?.id).toBe("tip-01");
  });

  it("only Maggie answers her tips", () => {
    const s = noon();
    toDay(s, 1, "09:00");
    expect(tipGotIt(s, GUARDIAN)).toBe(false);
    expect(tipNotNow(s, FAMILY)).toBe(false);
    expect(can(s, GUARDIAN, "read", "tips")).toBe(false);
  });
});

describe("Sprint 22 data starts clean", () => {
  it("the seed has one always note from Sarah, already read aloud, and nothing else", () => {
    const s = noon();
    expect(s.memoryAids).toHaveLength(1);
    expect(s.memoryAids[0]).toMatchObject({ kind: "always", by: GUARDIAN, text: "Your keys are in the blue bowl by the door." });
    expect(s.memoryAids[0].spokenAt).toBeDefined();
    expect(s.quietDays).toEqual([]);
    expect(s.scams).toEqual([]);
    expect(s.scamTips).toEqual({ done: [], notNow: 0 });
    expect(s.filesToDelete).toEqual([]);
  });
});
