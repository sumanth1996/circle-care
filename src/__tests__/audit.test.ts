import { describe, it, expect } from "vitest";
import { chain, append, verifyChain, GENESIS } from "../data/audit";

const raw = (i: number) => ({ id: `a${i}`, at: `2026-10-0${i}T10:00:00.000Z`, actorId: "m-ana", action: "viewed" as const, resource: `thing ${i}` });

describe("tamper-evident audit log (CC-28)", () => {
  it("links each entry to the previous one", () => {
    const log = chain([raw(1), raw(2), raw(3)]);
    expect(log[0].prev).toBe(GENESIS);
    expect(log[1].prev).toBe(log[0].hash);
    expect(verifyChain(log)).toEqual({ ok: true, count: 3 });
  });
  it("append keeps the chain valid", () => {
    const log = chain([raw(1)]);
    append(log, raw(2));
    expect(verifyChain(log).ok).toBe(true);
  });
  it("detects an edited entry", () => {
    const log = chain([raw(1), raw(2), raw(3)]);
    log[1] = { ...log[1], resource: "something else" };
    expect(verifyChain(log)).toEqual({ ok: false, count: 3, brokenAt: 1 });
  });
  it("detects a deleted entry", () => {
    const log = chain([raw(1), raw(2), raw(3)]);
    log.splice(1, 1);
    expect(verifyChain(log)).toMatchObject({ ok: false, brokenAt: 1 });
  });
  it("detects reordering", () => {
    const log = chain([raw(1), raw(2), raw(3)]);
    [log[1], log[2]] = [log[2], log[1]];
    expect(verifyChain(log).ok).toBe(false);
  });
});
