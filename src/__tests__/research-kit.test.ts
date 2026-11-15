// CC-197: keeps the research kit (docs/research/01 to 04) honest and in step with the prototype it tests:
// a draft with no real people, concept tests of the features built since October whose screen labels
// exist in the app, a consent outline that says how notes are kept and deleted, and the human steps left.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const SCREENER = read("docs/research/01-recruiting-screener.md");
const GUIDES = {
  elder: read("docs/research/02-interview-guide-elders.md"),
  caregiver: read("docs/research/03-interview-guide-caregivers.md"),
  guardian: read("docs/research/04-interview-guide-guardians.md"),
};
const KIT = { screener: SCREENER, ...GUIDES };
const CHAT = read("src/components/chat.tsx");

/** All app source, so a label quoted in a guide can be checked against the screens. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : sources(p);
    return /\.tsx?$/.test(n) ? [readFileSync(p, "utf8")] : [];
  });
}
const APP = sources(resolve(ROOT, "src")).join("\n");

/** The text from a heading line up to the next heading of the same or a higher level. */
function section(doc: string, heading: RegExp) {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`Missing heading: ${heading}`);
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}} `).test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}
const everyday = (doc: string) => section(doc, /^## \d+b\. Concept test — everyday care built since October/);

describe("research kit (CC-197)", () => {
  it("is still a draft, updated for CC-197, and says no research has happened", () => {
    for (const [name, doc] of Object.entries(KIT)) {
      expect(doc.split("\n").find((l) => l.startsWith("Notion story:")), name).toContain("CC-197");
      const status = doc.split("\n").find((l) => l.startsWith("Status:"))!;
      expect(status, name).toMatch(/DRAFT v\d+.*updated \d{4}-\d{2}-\d{2} \(CC-197\)/);
      expect(status, name).toMatch(/No (participants have been recruited|interviews have taken place)/);
    }
  });

  it("gives each guide a concept test of chat, check-ins, refills and the evening recap", () => {
    for (const [name, doc] of Object.entries(GUIDES)) {
      const text = everyday(doc).toLowerCase();
      for (const feature of ["chat", "check-in", "refill", "evening recap"]) expect(text, `${name}: ${feature}`).toContain(feature);
      const tasks = text.split("\n").filter((l) => /^\| t\d+ /.test(l));
      expect(tasks.length, name).toBeGreaterThanOrEqual(3);
      // Each task row has the four columns: task, prompt, watch for, success.
      for (const t of tasks) expect(t.split(" | ").length, t).toBe(4);
    }
  });

  it("quotes only screen labels and presenter controls that exist in the app", () => {
    for (const [name, doc] of Object.entries(GUIDES)) {
      const quoted = [...everyday(doc).matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*/g)].map((m) => m[1] ?? m[2]);
      expect(quoted.length, name).toBeGreaterThan(3);
      for (const label of quoted) expect(APP.includes(label), `${name} quotes "${label}"`).toBe(true);
    }
  });

  it("keeps participants off the chat microphone exactly while the chat's voice promise is untrue (CC-222)", () => {
    const says = /turned into text on (this|the|your) device/i.test(CHAT);
    const keepsOnDevice = /processLocally\s*=\s*true/.test(CHAT);
    for (const [name, doc] of Object.entries(GUIDES)) {
      const reminder = /^- Chat voice: .*don't let them speak into it.*\(CC-222\)/m.test(doc);
      expect(reminder, `${name}: chat voice reminder`).toBe(says && !keepsOnDevice);
    }
  });

  it("says in the consent outline how notes are stored and deleted, and that no health details are asked for", () => {
    const consent = section(SCREENER, /^## 5\. Consent form outline/);
    expect(consent).toMatch(/record no health details beyond what you choose to tell us/);
    expect(consent).toMatch(/encrypted folder that only the research team can open/);
    expect(consent).toMatch(/Recordings within 30 days of transcription/);
    expect(consent).toMatch(/De-identified notes within 12 months/);
    expect(consent).toMatch(/made-up people/);
    expect(consent).toMatch(/reset it after every session/);
    expect(section(SCREENER, /^## 7\. De-identification rules/)).toContain("*Reset demo*");
  });

  it("names the human steps still needed", () => {
    const steps = section(SCREENER, /^## 9\. Human actions before starting/).split("\n").filter((l) => l.startsWith("- [ ]"));
    for (const need of [/^- \[ \] Recruiting:/, /^- \[ \] Incentives:/, /^- \[ \] Consent review:/, /^- \[ \] Safety protocol:/]) {
      expect(steps.some((s) => need.test(s)), String(need)).toBe(true);
    }
    expect(steps.every((s) => s.startsWith("- [ ] "))).toBe(true);
  });

  it("holds no real contact details", () => {
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
    const phone = /\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/;
    expect(email.test("ana@example.com") && phone.test("(415) 555-0100")).toBe(true);
    for (const [name, doc] of Object.entries(KIT)) {
      expect(doc, name).not.toMatch(email);
      expect(doc, name).not.toMatch(phone);
    }
  });

  it("numbers each guide's hypotheses in order, with no gaps", () => {
    for (const [name, doc] of Object.entries(GUIDES)) {
      const ids = [...doc.matchAll(/^\| (H-[ECG])(\d+) \|/gm)];
      expect(ids.length, name).toBeGreaterThan(0);
      expect(new Set(ids.map((m) => m[1])).size, name).toBe(1);
      expect(ids.map((m) => Number(m[2])), name).toEqual(ids.map((_, i) => i + 1));
    }
  });
});
