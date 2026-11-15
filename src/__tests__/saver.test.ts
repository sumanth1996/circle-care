// CC-195: the demo store saves a change at once, keeps the newest save when saves finish out of order,
// saves again when the page is hidden or closed, and a quiet 15 second tick saves nothing.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createSaver, saveWhenPageGoes } from "../data/saver";
import { tick, evaluate } from "../data/store";
import { seed } from "../data/demo";

/** An encoder whose saves finish only when the test says so, in any order. */
function controlledEncoder() {
  const pending: { value: string; done: (s: string) => void }[] = [];
  const encode = (value: string) => new Promise<string>((done) => pending.push({ value, done }));
  const finish = (value: string) => {
    const i = pending.findIndex((p) => p.value === value);
    const [p] = pending.splice(i, 1);
    p.done(`enc(${p.value})`);
  };
  return { encode, finish };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("demo store saver (CC-195)", () => {
  it("writes a change as soon as it is encoded, with no timer", async () => {
    const stored: string[] = [];
    const saver = createSaver<string>((v) => `enc(${v})`, (s) => stored.push(s));
    await saver.save("switch off");
    expect(stored).toEqual(["enc(switch off)"]);
  });

  it("keeps the newest value when an older save finishes last", async () => {
    const stored: string[] = [];
    const { encode, finish } = controlledEncoder();
    const saver = createSaver<string>(encode, (s) => stored.push(s));
    const older = saver.save("on");
    const newer = saver.save("off");
    finish("off");
    finish("on");
    await Promise.all([older, newer]);
    expect(stored).toEqual(["enc(off)"]);
  });

  it("writes saves that finish in order, ending on the newest", async () => {
    const stored: string[] = [];
    const { encode, finish } = controlledEncoder();
    const saver = createSaver<string>(encode, (s) => stored.push(s));
    const a = saver.save("a");
    const b = saver.save("b");
    finish("a");
    await settle();
    finish("b");
    await Promise.all([a, b]);
    expect(stored).toEqual(["enc(a)", "enc(b)"]);
  });

  it("saves when the page is hidden or closed, but not when it comes back", () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    let flushes = 0;
    const stop = saveWhenPageGoes(() => { flushes++; }, win as unknown as Window, doc as unknown as Document);

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(flushes).toBe(1);

    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(flushes).toBe(1);

    win.dispatchEvent(new Event("pagehide"));
    expect(flushes).toBe(2);

    stop();
    win.dispatchEvent(new Event("pagehide"));
    expect(flushes).toBe(2);
  });

  it("saves the newest state when the page is hidden after a change", async () => {
    const stored: string[] = [];
    const saver = createSaver<string>((v) => `enc(${v})`, (s) => stored.push(s));
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    saveWhenPageGoes(() => { void saver.flush(); }, win as unknown as Window, doc as unknown as Document);
    await saver.changed("on");
    await saver.changed("off");
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(stored.at(-1)).toBe("enc(off)");
  });

  it("doesn't save the same state object twice", async () => {
    let encodes = 0;
    const saver = createSaver<object>((v) => { encodes++; return JSON.stringify(v); }, () => {});
    const state = { a: 1 };
    await saver.changed(state);
    await saver.changed(state);
    expect(encodes).toBe(1);
    await saver.changed({ a: 1 });
    expect(encodes).toBe(2);
  });

  it("drops saves under way and ignores new ones while the circle is wiped", async () => {
    const stored: string[] = [];
    const { encode, finish } = controlledEncoder();
    const saver = createSaver<string>(encode, (s) => stored.push(s));
    const inFlight = saver.save("old circle");
    saver.pause();
    const duringWipe = saver.save("old circle again");
    finish("old circle");
    await Promise.all([inFlight, duringWipe]);
    expect(stored).toEqual([]);
    saver.resume();
    const fresh = saver.save("fresh demo");
    finish("fresh demo");
    await fresh;
    expect(stored).toEqual(["enc(fresh demo)"]);
  });

  it("retries the newest save once when encoding fails", async () => {
    const stored: string[] = [];
    let calls = 0;
    const saver = createSaver<string>((v) => { if (calls++ === 0) throw new Error("busy"); return `enc(${v})`; }, (s) => stored.push(s));
    await saver.save("off");
    expect(stored).toEqual(["enc(off)"]);
    expect(calls).toBe(2);
  });

  it("gives up after one retry and reports the failure", async () => {
    const saver = createSaver<string>(() => { throw new Error("broken"); }, () => {});
    await expect(saver.save("off")).rejects.toThrow("broken");
  });
});

describe("rules engine tick (CC-195)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("keeps the same state on a tick where nothing changed, so it neither re-renders the data nor saves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T14:00:00-04:00"));
    const s = seed();
    evaluate(s);
    expect(tick(s)).toBe(s);
    let encodes = 0;
    const saver = createSaver<object>((v) => { encodes++; return JSON.stringify(v); }, () => {});
    await saver.changed(s);
    await saver.changed(tick(s));
    expect(encodes).toBe(1);
  });

  it("returns a new state when a tick's rules change something", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T14:00:00-04:00"));
    const s = seed();
    evaluate(s);
    s.clockOffsetMin += 24 * 60; // a day later, the time-based rules have new work
    const next = tick(s);
    expect(next).not.toBe(s);
    expect(JSON.stringify(next)).not.toBe(JSON.stringify(s));
  });
});
