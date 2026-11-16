import { describe, it, expect, afterEach } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { evaluate, applySettings } from "../data/store";
import { clock, alertsFor, alertLink } from "../data/selectors";
import { MATRIX, can } from "../data/policy";
import { phiHint } from "../data/everyday";
import {
  postHelp, claimHelp, releaseHelp, finishHelp, cancelHelp, repostHelp, notYetHelp, askingDone,
  helpBoard, helpHistory, helpView, helpWeek, canSeeHelp, helpCandidates, BOARD_DAYS, type HelpInput,
} from "../data/help";
import { verifyChain } from "../data/audit";
import { addDays, hm, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 16 "Help board" (CC-209, CC-210). Times are pinned to noon so a test never crosses midnight by accident.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); s.help = []; return s; };
const inDays = (s: State, n: number) => ymd(addDays(clock(s), n));
const ride = (s: State, extra: Partial<HelpInput> = {}): HelpInput => ({ kind: "ride", note: "Pick Mom up at 9 and bring her home after.", date: inDays(s, 3), time: "09:00", audience: [FAMILY, CAREGIVER], ...extra });
const keyed = (s: State, prefix: string) => s.alerts.filter((a) => a.key?.startsWith(prefix));
const lastAudit = (s: State) => s.audit[s.audit.length - 1];
const pause = (s: State, on: boolean) => applySettings(s, ELDER, { sharingPaused: on });

const original = { ...MATRIX.appointments };
afterEach(() => { MATRIX.appointments = { ...original }; });

describe("post a help request to the circle (CC-209)", () => {
  it("each chosen person gets \"New help request in Circle Care\" and it shows on their board", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    expect(r).toBeTruthy();
    const [a] = keyed(s, `help-new-${r.id}`);
    expect(a.title).toBe("New help request in Circle Care");
    expect(a.to.sort()).toEqual(["caregiver", "family"]);
    expect(a.detail).toMatch(/^Sarah asked for help: Ride, .* at 9:00\sAM\.$/);
    expect(alertLink("family", a.link)).toBe("/app/family");
    expect(alertLink("caregiver", a.link)).toBe("/app/caregiver/help");
    for (const id of [FAMILY, CAREGIVER, GUARDIAN, ELDER]) expect(helpBoard(s, id).map((x) => x.id)).toEqual([r.id]);
  });

  it("only the people Sarah picks see it, besides Maggie and Sarah", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { audience: [FAMILY] }))!;
    expect(keyed(s, `help-new-${r.id}`)[0].to).toEqual(["family"]);
    expect(canSeeHelp(s, CAREGIVER, r)).toBe(false);
    expect(helpBoard(s, CAREGIVER)).toEqual([]);
    // Ana can't claim what she can't see, and the refusal is logged.
    expect(claimHelp(s, CAREGIVER, r.id, r.rev)).toEqual({ ok: false });
    expect(lastAudit(s)).toMatchObject({ actorId: CAREGIVER, action: "denied", resource: "respond help" });
  });

  it("only Sarah posts, and only to people in the circle", () => {
    const s = noon();
    expect(postHelp(s, FAMILY, ride(s))).toBeNull();
    expect(lastAudit(s)).toMatchObject({ actorId: FAMILY, action: "denied", resource: "write help" });
    expect(postHelp(s, GUARDIAN, ride(s, { audience: ["m-stranger", ELDER] }))).toBeNull();
    expect(helpCandidates(s).map((m) => m.id).sort()).toEqual([CAREGIVER, FAMILY].sort());
    expect(postHelp(s, GUARDIAN, ride(s, { kind: "other", note: "  " }))).toBeNull();
    expect(postHelp(s, GUARDIAN, ride(s, { date: "soon" }))).toBeNull();
    expect(s.help).toEqual([]);
  });

  it("a request tied to an appointment shows only \"Appointment\" and the time to someone without appointment access", () => {
    const s = noon();
    const appt = s.appointments.find((a) => a.title === "Cholesterol panel")!;
    const r = postHelp(s, GUARDIAN, ride(s, { appointmentId: appt.id, date: appt.date, time: "09:00", note: "Bring her home after." }))!;
    // Ana loses appointment access (as a narrower role would have).
    MATRIX.appointments = { ...original, read: ["elder", "guardian", "family"] };
    expect(can(s, CAREGIVER, "read", "appointments")).toBe(false);
    const v = helpView(s, CAREGIVER, r);
    expect(v).toMatchObject({ title: "Appointment", note: "", place: "", masked: true });
    expect(v.when).toMatch(/at 9:00\sAM$/);
    expect(JSON.stringify(v)).not.toMatch(/Cholesterol|Bay Area Lab|Sacramento/);
  });

  it("the circle never sees the appointment's reason or clinic; Sarah and Maggie do, and so does whoever has it, to get there", () => {
    const s = noon();
    const appt = s.appointments.find((a) => a.title === "Cholesterol panel")!;
    const r = postHelp(s, GUARDIAN, ride(s, { appointmentId: appt.id, date: appt.date }))!;
    expect(helpView(s, FAMILY, r)).toMatchObject({ title: "Ride to an appointment", place: "" });
    expect(helpView(s, GUARDIAN, r)).toMatchObject({ title: "Ride for Cholesterol panel", place: appt.location });
    expect(helpView(s, ELDER, r).title).toBe("Ride for Cholesterol panel");
    // The alert and the lock screen carry nothing about the appointment.
    const [a] = keyed(s, `help-new-${r.id}`);
    expect(`${a.title} ${a.detail}`).not.toMatch(/Cholesterol|Lab|Sacramento/);
    expect(a.detail).toContain("Ride to an appointment");
    claimHelp(s, FAMILY, r.id, r.rev);
    expect(helpView(s, FAMILY, r)).toMatchObject({ title: "Ride to an appointment", place: appt.location });
    expect(helpView(s, CAREGIVER, r).place).toBe("");
  });

  it("a note that names a medicine, a diagnosis or a dose gets the same health-detail hint as family chat", () => {
    const s = noon();
    expect(phiHint(s, "Pick up her Metformin on the way")).toContain("Metformin");
    expect(phiHint(s, "She has a diabetes check")).toContain("diabet…");
    expect(phiHint(s, "Give her 500 mg with lunch")).toContain("a dose");
    expect(phiHint(s, "Pick Mom up at 9 and bring her home after.")).toEqual([]);
  });

  it("still unclaimed 24 hours before it is due, Sarah is told once and can post it again or do it herself", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 2), time: "13:00" }))!;
    later(s, 23 * 60); // tomorrow 11 AM: more than a day ahead still
    expect(keyed(s, `help-unclaimed-${r.id}`)).toHaveLength(0);
    later(s, 2 * 60); // tomorrow 1 PM: exactly a day ahead
    const told = keyed(s, `help-unclaimed-${r.id}`);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ to: ["guardian"], title: "Update from Circle Care" });
    expect(told[0].detail).toMatch(/^No one has picked up ride, .*\. Post it again or do it yourself\.$/);
    later(s, 30);
    expect(keyed(s, `help-unclaimed-${r.id}`)).toHaveLength(1);
    // Post again: the same people get it again.
    expect(repostHelp(s, GUARDIAN, r.id)).toBe(true);
    expect(keyed(s, `help-again-${r.id}`)[0].to.sort()).toEqual(["caregiver", "family"]);
    // Or Sarah does it herself.
    expect(claimHelp(s, GUARDIAN, r.id, r.rev)).toEqual({ ok: true });
    expect(r.claimedBy).toBe(GUARDIAN);
  });

  it("is not flagged as unclaimed when it was posted less than a day ahead", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 0), time: "18:00" }))!;
    later(s, 60);
    expect(keyed(s, `help-unclaimed-${r.id}`)).toHaveLength(0);
  });

  it("cancelled, it leaves every board and the person who had it is told", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    expect(cancelHelp(s, FAMILY, r.id)).toBe(false);
    expect(cancelHelp(s, GUARDIAN, r.id)).toBe(true);
    for (const id of [FAMILY, CAREGIVER, GUARDIAN, ELDER]) expect(helpBoard(s, id)).toEqual([]);
    const [a] = keyed(s, `help-cancel-${r.id}`);
    expect(a).toMatchObject({ to: ["family"], title: "Update from Circle Care" });
    expect(a.detail).toMatch(/^Sarah cancelled a help request you had: Ride, /);
    // Still in the history, for Maggie and Sarah only.
    expect(helpHistory(s, GUARDIAN).map((x) => x.status)).toEqual(["cancelled"]);
    expect(helpHistory(s, ELDER)).toHaveLength(1);
    expect(helpHistory(s, FAMILY)).toEqual([]);
    expect(helpHistory(s, CAREGIVER)).toEqual([]);
  });

  it("while Maggie has paused sharing, family and paid caregivers see no requests and get no alerts", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    pause(s, true);
    expect(helpBoard(s, FAMILY)).toEqual([]);
    expect(helpBoard(s, CAREGIVER)).toEqual([]);
    expect(helpBoard(s, GUARDIAN)).toHaveLength(1);
    expect(helpBoard(s, ELDER)).toHaveLength(1);
    expect(claimHelp(s, FAMILY, r.id, r.rev).ok).toBe(false);
    const r2 = postHelp(s, GUARDIAN, ride(s, { time: "10:00" }))!;
    expect(keyed(s, `help-new-${r2.id}`)).toHaveLength(0);
    pause(s, false);
    expect(helpBoard(s, FAMILY)).toHaveLength(2);
  });

  it("finished or cancelled requests leave the boards after 30 days and stay in Maggie's and Sarah's history", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 0), time: "13:00" }))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    finishHelp(s, FAMILY, r.id);
    later(s, (BOARD_DAYS - 1) * 1440);
    expect(helpBoard(s, FAMILY).map((x) => x.id)).toEqual([r.id]);
    later(s, 2 * 1440);
    for (const id of [FAMILY, CAREGIVER, GUARDIAN, ELDER]) expect(helpBoard(s, id)).toEqual([]);
    expect(helpHistory(s, GUARDIAN).map((x) => x.id)).toEqual([r.id]);
    expect(helpHistory(s, ELDER).map((x) => x.id)).toEqual([r.id]);
  });

  it("posting, changing and cancelling are in the audit history with who made them", () => {
    const s = noon();
    const before = s.audit.length;
    const r = postHelp(s, GUARDIAN, ride(s))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    releaseHelp(s, FAMILY, r.id);
    repostHelp(s, GUARDIAN, r.id);
    cancelHelp(s, GUARDIAN, r.id);
    const added = s.audit.slice(before).map((a) => `${a.actorId} ${a.action} ${a.resource}`);
    expect(added).toEqual([
      `${GUARDIAN} created a help request`,
      `${FAMILY} updated a help request (claimed)`,
      `${FAMILY} updated a help request (reopened)`,
      `${GUARDIAN} updated a help request (posted again)`,
      `${GUARDIAN} removed a help request (cancelled)`,
    ]);
    expect(verifyChain(s.audit).ok).toBe(true);
    expect(r.history.map((h) => `${h.by} ${h.change}`)).toEqual([
      `${GUARDIAN} Posted`, `${FAMILY} Claimed`, `${FAMILY} Can't do it anymore`, `${GUARDIAN} Posted again`, `${GUARDIAN} Cancelled`,
    ]);
  });
});

describe("claim and finish a help request (CC-210)", () => {
  it("\"I'll do it\": everyone who can see it sees James has it, and Sarah is told", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    expect(claimHelp(s, FAMILY, r.id, r.rev)).toEqual({ ok: true });
    for (const id of [CAREGIVER, GUARDIAN, ELDER]) expect(helpBoard(s, id)[0]).toMatchObject({ status: "claimed", claimedBy: FAMILY });
    const [a] = keyed(s, `help-claim-${r.id}`);
    expect(a).toMatchObject({ to: ["guardian"], title: "Update from Circle Care" });
    expect(a.detail).toMatch(/^James has this: Ride, /);
    expect(alertsFor(s, "guardian").some((x) => x.id === a.id)).toBe(true);
  });

  it("two people tap at the same moment: only the first claim succeeds and the second sees who has it", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    const seen = r.rev; // both screens show the same revision
    expect(claimHelp(s, FAMILY, r.id, seen)).toEqual({ ok: true });
    expect(claimHelp(s, CAREGIVER, r.id, seen)).toEqual({ ok: false, heldBy: FAMILY });
    expect(r.claimedBy).toBe(FAMILY);
    expect(keyed(s, `help-claim-${r.id}`)).toHaveLength(1);
    // A claim from a stale screen fails even after the request reopens.
    releaseHelp(s, FAMILY, r.id);
    expect(claimHelp(s, CAREGIVER, r.id, seen)).toEqual({ ok: false });
    expect(claimHelp(s, CAREGIVER, r.id, r.rev)).toEqual({ ok: true });
  });

  it("\"Can't anymore\": the request reopens and Sarah is told", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    expect(releaseHelp(s, CAREGIVER, r.id)).toBe(false); // only the person who has it
    expect(releaseHelp(s, FAMILY, r.id)).toBe(true);
    expect(r).toMatchObject({ status: "open", claimedBy: undefined });
    const [a] = keyed(s, `help-release-${r.id}`);
    expect(a.to).toEqual(["guardian"]);
    expect(a.detail).toMatch(/^James can't do this anymore, so it's open again: Ride, /);
  });

  it("marked done, it moves to Done with the time and counts in Who helped this week", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 0), time: "13:00" }))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    expect(finishHelp(s, CAREGIVER, r.id)).toBe(false);
    expect(finishHelp(s, FAMILY, r.id)).toBe(true);
    expect(r).toMatchObject({ status: "done", doneBy: FAMILY });
    expect(hm(new Date(r.closedAt!))).toBe(hm(clock(s)));
    expect(helpBoard(s, GUARDIAN)[0].status).toBe("done");
    expect(helpWeek(s, GUARDIAN)).toEqual([{ id: FAMILY, name: "James", did: ["Ride"] }]);
    expect(keyed(s, `help-done-${r.id}`)[0].detail).toMatch(/^James finished: Ride, /);
    later(s, 8 * 1440);
    expect(helpWeek(s, GUARDIAN)).toEqual([]);
  });

  it("Who helped this week lists people A to Z, without ranking", () => {
    const s = noon();
    for (const [who, kind] of [[FAMILY, "groceries"], [CAREGIVER, "ride"], [FAMILY, "company"]] as const) {
      const r = postHelp(s, GUARDIAN, ride(s, { kind, date: inDays(s, 0), time: "13:00" }))!;
      claimHelp(s, who, r.id, r.rev);
      finishHelp(s, who, r.id);
    }
    expect(helpWeek(s, GUARDIAN).map((w) => [w.name, w.did.length])).toEqual([["Ana", 1], ["James", 2]]);
  });

  it("an hour after a claimed request's time, the person who has it is asked once \"Did this happen?\"", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 0), time: "13:00" }))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    later(s, 60 + 59); // 1:59 PM
    expect(keyed(s, `help-ask-${r.id}`)).toHaveLength(0);
    later(s, 1); // 2:00 PM
    const asked = keyed(s, `help-ask-${r.id}`);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ to: ["family"], title: "Update from Circle Care" });
    expect(asked[0].detail).toMatch(/^Did this happen\? Ride, /);
    expect(askingDone(r, FAMILY)).toBe(true);
    // "Not yet" puts the question away; it isn't asked again.
    notYetHelp(s, FAMILY, r.id);
    expect(askingDone(r, FAMILY)).toBe(false);
    later(s, 180);
    expect(keyed(s, `help-ask-${r.id}`)).toHaveLength(1);
    expect(r.status).toBe("claimed");
  });

  it("\"Yes\" to \"Did this happen?\" marks it done", () => {
    const s = noon();
    const r = postHelp(s, GUARDIAN, ride(s, { date: inDays(s, 0), time: "10:00" }))!;
    claimHelp(s, FAMILY, r.id, r.rev);
    evaluate(s); // noon: two hours after 10 AM
    expect(askingDone(r, FAMILY)).toBe(true);
    finishHelp(s, FAMILY, r.id);
    expect(r.status).toBe("done");
  });

  it("the demo circle starts with two open requests and one James finished", () => {
    const s = seed();
    evaluate(s);
    const board = helpBoard(s, GUARDIAN);
    expect(board.map((r) => r.status).sort()).toEqual(["done", "open", "open"]);
    expect(helpBoard(s, CAREGIVER).map((r) => r.id).sort()).toEqual(["help-groceries", "help-ride"]);
    expect(helpWeek(s, GUARDIAN).map((w) => w.name)).toEqual(["James"]);
  });
});
