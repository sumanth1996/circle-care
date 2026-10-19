import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, FAMILY } from "../data/demo";
import { evaluate, audit } from "../data/store";
import { todayOf, clock } from "../data/selectors";
import { hm } from "../lib/time";
import { verifyChain } from "../data/audit";

const minsAgo = (s: ReturnType<typeof seed>, m: number) => hm(new Date(clock(s).getTime() - m * 60000));

describe("rules engine", () => {
  it("escalates a missed dose to the caregiver, then the guardian", () => {
    const s = seed();
    const med = s.meds.find((m) => m.id === "med-lisinopril")!;
    med.times = [minsAgo(s, 70)];
    s.doses = s.doses.filter((d) => !(d.medId === med.id && d.date === todayOf(s)));
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-repeat") && a.to.includes("elder"))).toBe(true);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-cg") && a.to.includes("caregiver"))).toBe(true);
    expect(s.alerts.some((a) => a.key?.startsWith("dose-g") && a.to.includes("guardian"))).toBe(true);
  });

  it("does not repeat the same alert", () => {
    const s = seed();
    const med = s.meds.find((m) => m.id === "med-lisinopril")!;
    med.times = [minsAgo(s, 70)];
    s.doses = s.doses.filter((d) => !(d.medId === med.id && d.date === todayOf(s)));
    evaluate(s); const n = s.alerts.length; evaluate(s);
    expect(s.alerts.length).toBe(n);
  });

  it("missed check-in prompts the elder first, then the guardian 15 minutes later (CC-52)", () => {
    const s = seed();
    s.checkins = s.checkins.filter((c) => c.date !== todayOf(s));
    s.settings.checkinWindow = { start: minsAgo(s, 120), end: minsAgo(s, 5) };
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `checkin-elder-${todayOf(s)}`)).toBe(true);
    expect(s.alerts.some((a) => a.key === `checkin-${todayOf(s)}`)).toBe(false);
    s.settings.checkinWindow = { start: minsAgo(s, 120), end: minsAgo(s, 20) };
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `checkin-${todayOf(s)}`)).toBe(true);
  });

  it("flags bulk record viewing as suspicious (CC-35)", () => {
    const s = seed();
    for (let i = 0; i < 9; i++) audit(s, FAMILY, "viewed", `record ${i}`);
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`sec-bulk-${FAMILY}`) && a.to.includes("guardian"))).toBe(true);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("flags repeated denials (CC-35)", () => {
    const s = seed();
    for (let i = 0; i < 3; i++) audit(s, FAMILY, "denied", "read audit");
    evaluate(s);
    expect(s.alerts.some((a) => a.key?.startsWith(`sec-deny-${FAMILY}`))).toBe(true);
  });

  it("reminds the guardian about requests older than a day (CC-64)", () => {
    const s = seed();
    const p = s.approvals.find((a) => a.status === "pending")!;
    p.at = new Date(clock(s).getTime() - 26 * 3600000).toISOString();
    evaluate(s);
    expect(s.alerts.some((a) => a.key === `approval-remind-${p.id}` && a.to.includes("guardian"))).toBe(true);
  });

  it("ends time-limited access automatically (CC-25)", () => {
    const s = seed();
    const m = s.members.find((x) => x.id !== GUARDIAN && x.role !== "elder")!;
    m.expiresOn = "2000-01-01";
    m.status = "active";
    evaluate(s);
    expect(m.status).toBe("revoked");
  });
});
