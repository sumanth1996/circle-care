// CC-222: the family chat's voice reply listens only on the device, like the dose check-in (CC-73).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { voiceSupport } from "../lib/voice";

const CHAT = readFileSync(resolve(__dirname, "../components/chat.tsx"), "utf8");
const g = globalThis as unknown as { window?: unknown };

function fakeBrowser(available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>) {
  class Rec {}
  if (available) Object.assign(Rec, { available });
  g.window = { SpeechRecognition: Rec };
}
afterEach(() => { delete g.window; });

describe("On-device check (CC-73, CC-222)", () => {
  it("is on-device only when the browser says on-device recognition is available", async () => {
    let asked: unknown;
    fakeBrowser(async (o) => { asked = o; return "available"; });
    expect(await voiceSupport("en-US")).toBe("on-device");
    expect(asked).toEqual({ langs: ["en-US"], processLocally: true });
  });

  it("treats a language pack still to download, or any other answer, as not on-device", async () => {
    for (const answer of ["downloadable", "downloading", "unavailable"]) {
      fakeBrowser(async () => answer);
      expect(await voiceSupport()).toBe("cloud-only");
    }
  });

  it("treats a browser that can't say, or an error, as not on-device", async () => {
    fakeBrowser();
    expect(await voiceSupport()).toBe("cloud-only");
    fakeBrowser(async () => { throw new Error("boom"); });
    expect(await voiceSupport()).toBe("cloud-only");
  });

  it("finds no voice at all without speech recognition", async () => {
    g.window = {};
    expect(await voiceSupport()).toBe("none");
  });
});

describe("Family chat voice reply (CC-222)", () => {
  it("asks the browser to listen on the device on every recognition it starts", () => {
    const start = CHAT.slice(CHAT.indexOf("const start = () =>"), CHAT.indexOf("const typeInstead"));
    expect(start).toMatch(/r\.processLocally\s*=\s*true/);
    expect(start.indexOf("processLocally")).toBeLessThan(start.indexOf("r.start()"));
  });

  it("starts listening only after the on-device check says yes, and otherwise opens for typing", () => {
    expect(CHAT).toMatch(/voiceSupport\("en-US"\)\.then/);
    expect(CHAT).toMatch(/const ok = s === "on-device";/);
    expect(CHAT).toMatch(/if \(ok\) start\(\);\s*else \{ setMode\("type"\); setNote\(NOT_ON_DEVICE\); \}/);
    // The microphone can't be tapped, and Talk instead isn't offered, until the check has said yes.
    expect(CHAT).toMatch(/disabled=\{onDevice !== "yes"\}/);
    expect(CHAT).toMatch(/onDevice === "yes" && <button.*Talk instead<\/button>/);
  });
});
