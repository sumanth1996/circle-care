import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seed, GUARDIAN } from "../data/demo";
import { evaluate } from "../data/store";
import { clock, todayOf, doseThresholds } from "../data/selectors";
import { requestRefill } from "../data/everydayActions";
import { supplyState, REFILL_BUTTON, REFILL_HINT, REFILL_NOT_CONTACTED, refillSavedToast } from "../data/everyday";
import { TOURS } from "../components/Extras";
import { hm, minutesOfDay, toMin } from "../lib/time";
import type { State } from "../data/types";

// Sprint 25: three changes from the dummy-profile POC research round (docs/research/13-poc-research-round.md).
// The round used dummy profiles, so each change still needs real research to confirm it.

const SRC = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("CC-236: the refill button says the person asked the pharmacy", () => {
  it("never says Request refill, and the hint, toast and line all say Circle Care doesn't contact the pharmacy", () => {
    const ui = SRC("components/guardianEveryday.tsx");
    expect(ui).not.toContain("Request refill");
    expect(ui).toContain("{REFILL_BUTTON}");
    expect(REFILL_BUTTON).toBe("I asked the pharmacy");
    expect(REFILL_HINT).toMatch(/doesn't contact pharmacies/);
    expect(REFILL_NOT_CONTACTED).toBe("Circle Care doesn't contact pharmacies.");
    const med = seed().meds.find((m) => m.id === "med-lisinopril")!;
    expect(refillSavedToast(med)).toBe("Saved: you asked Fog City Pharmacy for Lisinopril. Circle Care didn't contact them.");
  });

  it("records that the person asked, in the medicine's history, and stops the low-supply alert", () => {
    const s = seed();
    s.persona = "guardian";
    const med = s.meds.find((m) => m.id === "med-atorvastatin")!;
    requestRefill(s, GUARDIAN, med.id);
    evaluate(s);
    expect(supplyState(s, med)).toBe("requested");
    expect(med.history.at(-1)!.change).toBe("Asked Fog City Pharmacy for a refill (Circle Care does not contact pharmacies)");
  });
});

describe("CC-238: elders get help on first use", () => {
  it("starts with the largest text", () => {
    expect(seed().settings.textSize).toBe("xxl");
  });

  it("walks through the three big buttons once, and names Text size and the Saved tick", () => {
    const steps = TOURS.elder;
    const titles = steps.map((x) => x.title);
    for (const button of ["What's next", "SOS", "Call my person"]) expect(titles).toContain(button);
    const all = steps.map((x) => x.body).join(" ");
    expect(all).toContain("Text size");
    expect(all).toContain("Saved");
    // The tour shows once: it is hidden as soon as it is marked done for this persona.
    expect(SRC("components/Extras.tsx")).toMatch(/if \(state\.settings\.toured\?\.\[persona\]\) return null;/);
  });

  it("each button the tour names is on the elder's Home", () => {
    const home = SRC("pages/elder/ElderHome.tsx");
    expect(home).toContain('aria-label="SOS. Get help now"');
    expect(home).toContain("Call my person");
    expect(home).toContain('to="/app/elder/next"');
    expect(home).toContain("Text size");
  });

  it("My day shows a Saved tick that stays after each tap", () => {
    const myDay = SRC("components/everyday.tsx");
    expect(myDay).toMatch(/className="daily-saved" role="status"/);
    expect(myDay).toContain("Saved</span>");
    // Every kind of tap sets it: feelings and meals through saved(), water directly.
    expect(myDay.match(/setSavedMark\(/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("CC-239: a guardian can choose to hear about a missed dose with the caregiver", () => {
  const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
  /** One medicine due `minsLate` minutes ago with nothing logged, the others paused. */
  function dueAgo(s: State, medId: string, minsLate: number) {
    const time = hm(new Date(clock(s).getTime() - minsLate * 60000));
    for (const m of s.meds) m.paused = m.id !== medId;
    s.meds.find((m) => m.id === medId)!.times = [time];
    s.doses = s.doses.filter((d) => !(d.medId === medId && d.date === todayOf(s)));
    return `${medId}@${time}`;
  }
  const missedTo = (s: State, key: string) =>
    s.alerts.filter((a) => a.key === `dose-cg-${todayOf(s)}-${key}` || a.key === `dose-g-${todayOf(s)}-${key}`).map((a) => a.to[0]).sort();

  it("is off by default, so the caregiver goes first", () => {
    const s = seed();
    expect(s.settings.doseEscalation.withCaregiver).toBe(false);
    const med = s.meds.find((m) => m.id === "med-metformin")!;
    expect(doseThresholds(s, med)).toEqual({ caregiver: 30, guardian: 60 });
  });

  it("when on, the guardian's timer matches the caregiver's, for high-priority medicines too", () => {
    const s = seed();
    s.settings.doseEscalation.withCaregiver = true;
    expect(doseThresholds(s, s.meds.find((m) => m.id === "med-metformin")!)).toEqual({ caregiver: 30, guardian: 30 });
    expect(doseThresholds(s, s.meds.find((m) => m.id === "med-lisinopril")!)).toEqual({ caregiver: 15, guardian: 15 });
  });

  it("off: 35 minutes late tells only the caregiver; on: it tells both together", () => {
    const off = seed(); at(off, "12:00"); evaluate(off);
    const k1 = dueAgo(off, "med-metformin", 35); evaluate(off);
    expect(missedTo(off, k1)).toEqual(["caregiver"]);

    const on = seed(); at(on, "12:00"); evaluate(on);
    on.settings.doseEscalation.withCaregiver = true;
    const k2 = dueAgo(on, "med-metformin", 35); evaluate(on);
    expect(missedTo(on, k2)).toEqual(["caregiver", "guardian"]);
  });

  it("the guardian sets it in Settings, and the minutes picker hides while it is on", () => {
    const ui = SRC("pages/guardian/GuardianSettings.tsx");
    expect(ui).toContain('label="Tell me at the same time as the caregiver"');
    expect(ui).toContain("{!s.doseEscalation.withCaregiver && <label");
  });
});
