import { describe, it, expect } from "vitest";
import { seed } from "../data/demo";
import { can, MATRIX, type Action, type Resource } from "../data/policy";
import { GUARDIAN, ELDER, CAREGIVER, FAMILY } from "../data/demo";
import { todayOf } from "../data/selectors";
import type { State } from "../data/types";

function offShift(s: State) {
  s.visits = s.visits.filter((v) => !(v.caregiverId === CAREGIVER && v.date === todayOf(s)));
  return s;
}
function onShift(s: State) {
  offShift(s);
  s.visits.push({ id: "v-test", shiftId: s.shifts[0].id, caregiverId: CAREGIVER, date: todayOf(s), checkIn: new Date().toISOString() });
  return s;
}

const ids = { elder: ELDER, guardian: GUARDIAN, family: FAMILY } as const;

describe("permission matrix (CC-18/19)", () => {
  for (const [resource, acts] of Object.entries(MATRIX) as [Resource, Partial<Record<Action, string[]>>][]) {
    for (const [action, rules] of Object.entries(acts) as [Action, string[]][]) {
      for (const role of ["elder", "guardian", "family"] as const) {
        it(`${role} ${rules.includes(role) ? "can" : "cannot"} ${action} ${resource}`, () => {
          expect(can(seed(), ids[role], action, resource)).toBe(rules.includes(role));
        });
      }
      it(`professional caregiver ${action} ${resource} follows shift rules`, () => {
        const expectOn = rules.includes("pro") || rules.includes("pro@shift");
        const expectOff = rules.includes("pro");
        expect(can(onShift(seed()), CAREGIVER, action, resource)).toBe(expectOn);
        expect(can(offShift(seed()), CAREGIVER, action, resource)).toBe(expectOff);
      });
    }
  }

  it("unknown and removed people get nothing", () => {
    const s = seed();
    expect(can(s, "nobody", "read", "meds")).toBe(false);
    s.members.find((m) => m.id === FAMILY)!.status = "revoked";
    expect(can(s, FAMILY, "read", "meds")).toBe(false);
  });

  it("pausing sharing limits family and caregivers to emergencies (CC-81)", () => {
    const s = onShift(seed());
    s.settings.sharingPaused = true;
    expect(can(s, FAMILY, "read", "meds")).toBe(false);
    expect(can(s, CAREGIVER, "read", "notes")).toBe(false);
    expect(can(s, FAMILY, "respond", "sos")).toBe(true);
    expect(can(s, CAREGIVER, "read", "emergencyCard")).toBe(true);
    expect(can(s, GUARDIAN, "read", "meds")).toBe(true);
  });

  it("only the review team can review legal documents", () => {
    const s = seed();
    expect(can(s, "trust-safety", "review", "docs.legal")).toBe(true);
    expect(can(s, GUARDIAN, "review", "docs.legal")).toBe(false);
  });
});
