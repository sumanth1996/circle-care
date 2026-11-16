// CC-197: keeps the research kit (docs/research/01 to 04) honest and in step with the prototype it tests:
// a draft with no real people, concept tests of the features built since October whose screen labels
// exist in the app, a consent outline that says how notes are kept and deleted, and the human steps left.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { seed, CAREGIVER } from "../data/demo";
import { recap, lowSupply } from "../data/everyday";
import { can } from "../data/policy";
import { todayOf } from "../data/selectors";
import { toMin, minutesOfDay } from "../lib/time";
import type { State } from "../data/types";

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

// The demo seeds the pharmacy, so a guide may quote a confirmation with it filled in.
const PHARMACIES = [...new Set(seed().meds.map((m) => m.supply?.pharmacy).filter((p): p is string => !!p))];
/** A label is on screen if the app has it, or has the text around a seeded pharmacy name. */
const onScreen = (label: string) => {
  if (APP.includes(label)) return true;
  const p = PHARMACIES.find((x) => label.includes(x));
  if (!p) return false;
  // The words either side of the pharmacy must sit either side of the app's {…pharmacy…} placeholder.
  const esc = (t: string) => t.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [before, after] = label.split(p);
  return new RegExp(`${esc(before)}\\s*\\{[^}]*pharmacy[^}]*\\}\\s*${esc(after)}`).test(APP);
};

// The demo clock is moved within a frozen day, as in everyday.test.ts.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 10, 17, 12, 0)); });
afterEach(() => { vi.useRealTimers(); });
const setTime = (s: State, t: string) => { s.clockOffsetMin = toMin(t) - minutesOfDay(new Date()); return s; };

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
      for (const label of quoted) expect(onScreen(label), `${name} quotes "${label}"`).toBe(true);
    }
  });

  it("keeps participants off the chat microphone exactly while the chat's voice promise is untrue (CC-222)", () => {
    const keepsOnDevice = /processLocally\s*=\s*true/.test(CHAT);
    for (const [name, doc] of Object.entries(GUIDES)) {
      const reminder = /^- Chat voice: .*block the microphone.*\(CC-222\)/m.test(doc);
      expect(reminder, `${name}: chat voice reminder`).toBe(!keepsOnDevice);
    }
    // The screener's research-phone setup is what the reminder points to.
    expect(section(SCREENER, /^## 9\. Human actions before starting/)).toMatch(/microphone blocked for the prototype site/);
  });

  it("says in the consent outline how notes are stored and deleted, and that no health details are asked for", () => {
    const consent = section(SCREENER, /^## 5\. Consent form outline/);
    expect(consent).toMatch(/record no health details beyond what you choose to tell us/);
    expect(consent).toMatch(/encrypted folder that only the research team can open/);
    expect(consent).toMatch(/Recordings within 30 days of transcription/);
    expect(consent).toMatch(/De-identified notes within 12 months/);
    expect(consent).toMatch(/made-up people/);
    expect(consent).toMatch(/reset the practice app and clear the phone's browser data/);
    expect(consent).toMatch(/never which conditions you have or what your medicines are/);
    expect(consent).toMatch(/any time until the name-to-number list is deleted/);
    expect(section(SCREENER, /^## 7\. De-identification rules/)).toContain("*Reset demo*");
  });

  it("names the human steps still needed", () => {
    const steps = section(SCREENER, /^## 9\. Human actions before starting/).split("\n").filter((l) => l.startsWith("- [ ]"));
    for (const need of [/^- \[ \] Recruiting:/, /^- \[ \] Incentives:/, /^- \[ \] Consent review:/, /^- \[ \] Safety protocol:/]) {
      expect(steps.some((s) => need.test(s)), String(need)).toBe(true);
    }
  });

  it("tells the guardian what the seeded evening recap really says (Review R1-2)", () => {
    const s = setTime(seed(), "19:05");
    const r = recap(s);
    expect(r.calm).toBe(false);
    const t6 = everyday(GUIDES.guardian).split("\n").find((l) => l.startsWith("| T6 "))!;
    expect(t6).not.toMatch(/trusts \*A calm day/);
    expect(t6).toMatch(/isn't a calm day/);
  });

  it("names every medicine the demo already shows as low (Review R1-2)", () => {
    const low = lowSupply(seed()).map((l) => l.med.name);
    expect(low.length).toBeGreaterThan(0);
    const t7 = everyday(GUIDES.guardian).split("\n").find((l) => l.startsWith("| T7 "))!;
    for (const name of low) expect(t7, name).toContain(name);
  });

  it("runs the caregiver's everyday tasks before T3 ends Ana's shift (Review R1-1)", () => {
    const s = setTime(seed(), "10:00");
    expect(can(s, CAREGIVER, "write", "supply")).toBe(true);
    const visit = s.visits.find((v) => v.caregiverId === CAREGIVER && v.date === todayOf(s) && v.checkIn && !v.checkOut);
    expect(visit, "the seed checks Ana in on a weekday morning").toBeDefined();
    // T3's Send hand-off and check out runs submitHandoff, which checks the caregiver out.
    expect(read("src/data/store.tsx")).toMatch(/submitHandoff:[\s\S]{0,300}?v\.checkOut = clock\(s\)/);
    visit!.checkOut = new Date().toISOString();
    expect(can(s, CAREGIVER, "write", "supply")).toBe(false);
    expect(GUIDES.caregiver).toMatch(/\*\*Run §6b straight after T2, before T3\.\*\*/);
    expect(everyday(GUIDES.caregiver)).toMatch(/before T3/);
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

// Sprint 15: the prep kit for CC-1 to CC-5 (outreach, ID-only tracker, fieldwork plan, synthesis kit).
// It is agent work that a person then runs, so it must stay a draft with no real people in it, agree with
// the screener's quotas and the guides' hypotheses, and keep its dates on the real calendar.
const PREP = {
  outreach: read("docs/research/08-outreach-kit.md"),
  fieldwork: read("docs/research/10-fieldwork-plan.md"),
  synthesis: read("docs/research/11-synthesis-kit.md"),
};
const TRACKER = read("docs/research/09-recruiting-tracker.csv").trim().split("\n").map((l) => l.split(","));

describe("Sprint 15 research prep kit (CC-1 to CC-5)", () => {
  it("is a dated draft that names its stories and says nothing has happened yet", () => {
    for (const [name, doc] of Object.entries(PREP)) {
      expect(doc.split("\n").find((l) => l.startsWith("Notion stor")), name).toMatch(/CC-[1-5]\b/);
      const status = doc.split("\n").find((l) => l.startsWith("Status:"))!;
      expect(status, name).toMatch(/^Status: DRAFT, \d{4}-\d{2}-\d{2}\./);
      expect(status, name).toMatch(/No one has been contacted|No sessions are booked|No interview has taken place/);
    }
  });

  it("holds no real contact details, in the docs or the tracker", () => {
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
    const phone = /\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/;
    const tracker = TRACKER.map((r) => r.join(",")).join("\n");
    for (const [name, doc] of Object.entries({ ...PREP, tracker })) {
      expect(doc, name).not.toMatch(email);
      expect(doc, name).not.toMatch(phone);
      // Short dial numbers (988, 311 and the like) belong on the research lead's printed card, not here.
      for (const [, n] of doc.matchAll(/\b(?:call|dial|text|ring)\s+(\d{3,})\b/gi)) expect(n, name).toBe("911");
      expect(doc, name).not.toMatch(/\b(?:211|311|411|511|611|711|811|988)\b/);
    }
  });

  it("ships the tracker as a blank, ID-only template with an ID for every stretch-quota place", () => {
    const [header, ...rows] = TRACKER;
    expect(header[0]).toBe("ID");
    // The repository is public: it holds the blank template, and the filled copy lives in the encrypted folder.
    for (const r of rows) expect(r.slice(2).every((c) => c === ""), `${r[0]} is blank`).toBe(true);
    expect(SCREENER).toMatch(/Never fill it in inside the repository/);
    for (const col of header) expect(col, "no column for who someone is").not.toMatch(/name|phone|email|address|contact|birth/i);
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([header.length]));
    expect(new Set(rows.map((r) => r[0])).size).toBe(rows.length);
    const quotas = section(SCREENER, /^## 2\. Quotas/);
    const stretch = (seg: RegExp) => Number(quotas.split("\n").find((l) => seg.test(l))!.split("|")[3].trim());
    for (const [prefix, segment, row] of [
      ["E", "Elder", /^\| Elders/],
      ["C", "Caregiver", /^\| Professional caregivers/],
      ["G", "Guardian", /^\| Legal guardians/],
      ["F", "Family helper", /^\| Family helpers/],
    ] as const) {
      const ids = rows.filter((r) => r[0].startsWith(prefix));
      expect(ids.length, segment).toBe(stretch(row));
      for (const r of ids) expect(r[1], r[0]).toBe(segment);
      expect(ids.map((r) => Number(r[0].slice(1))), segment).toEqual(ids.map((_, i) => i + 1));
    }
  });

  it("puts each weekday on the right date, inside the recruiting window or Sprint 15", () => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let checked = 0;
    for (const [name, doc] of Object.entries(PREP)) {
      for (const [, day, mon, date] of doc.matchAll(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Nov|Dec) (\d{1,2})\b/g)) {
        const d = new Date(2026, MONTHS.indexOf(mon), Number(date));
        expect(DAYS[d.getDay()], `${name}: ${day} ${mon} ${date}`).toBe(day);
        expect(d >= new Date(2026, 10, 16) && d <= new Date(2026, 11, 27), `${name}: ${mon} ${date}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("points the scorecard at every hypothesis the guides list, judged by the guides' own thresholds", () => {
    expect(PREP.synthesis).toMatch(/its own \*Validated if\* and \*Invalidated if\* columns/);
    for (const doc of Object.values(GUIDES)) expect(doc).toMatch(/\| ID \| Hypothesis \| Validated if \| Invalidated if \|/);
    for (const [prefix, doc] of [["H-E", GUIDES.elder], ["H-C", GUIDES.caregiver], ["H-G", GUIDES.guardian]] as const) {
      const last = Math.max(...[...doc.matchAll(new RegExp(`^\\| ${prefix}(\\d+) \\|`, "gm"))].map((m) => Number(m[1])));
      expect(PREP.synthesis, prefix).toContain(`${prefix}1 to ${prefix}${last}`);
    }
  });

  it("has a safety protocol that blocks fieldwork until reviewed and keeps disclosures out of the notes", () => {
    const protocol = section(PREP.fieldwork, /^## 5\. Safety protocol/);
    expect(protocol).toMatch(/no interviews run/i);
    expect(protocol).toMatch(/call 911/);
    expect(protocol).toMatch(/never in the notes, the tracker or the repository/);
    expect(protocol).toMatch(/reaches the moderator's own area/);
    expect(protocol).toMatch(/anyone who suspects elder abuse must report/);
    // Participants are told up front that a disclosure of danger may be shared.
    expect(section(SCREENER, /^## 5\. Consent form outline/)).toMatch(/we may need to share that to keep them safe/);
    for (const doc of Object.values(GUIDES)) expect(doc).toMatch(/\]\(10-fieldwork-plan\.md#5-safety-protocol/);
    expect(protocol).toMatch(/receive the incentive either way/);
    expect(SCREENER).toMatch(/\[fieldwork plan\]\(10-fieldwork-plan\.md#5-safety-protocol/);
  });

  it("lets agents work only from notes that are already de-identified", () => {
    const rules = section(PREP.synthesis, /^## 1\. What agents may receive/);
    expect(rules).toMatch(/participant ID only/);
    expect(rules).toMatch(/\[condition\].*\[med\]/);
    expect(rules).toMatch(/no recording/);
    const rolling = section(PREP.synthesis, /^## 2\. Rolling check/);
    expect(rolling, "the safety flag stays in the research lead's log").not.toMatch(/\| Safety/i);
    expect(section(PREP.fieldwork, /^## 1\. Roles/)).toMatch(/never see recordings, names, contact details or the safety log/);
  });
});

// Sprint 15 leftovers: a practice round built from published research while no one may be contacted.
// It must never pass for real research: every participant is labelled synthetic, no hypothesis gets a
// verdict, every source is a public https page, and CC-2 to CC-5 stay open in what it says is left.
const PRACTICE = read("docs/research/12-practice-round.md");

describe("Sprint 15 practice round (synthetic)", () => {
  it("says up front that no real person took part and nothing is a finding", () => {
    expect(PRACTICE.split("\n").find((l) => l.startsWith("Notion stor"))).toMatch(/CC-2.*CC-3.*CC-4.*CC-5/);
    const status = PRACTICE.split("\n").find((l) => l.startsWith("Status:"))!;
    expect(status).toMatch(/^Status: PRACTICE ROUND, SYNTHETIC, \d{4}-\d{2}-\d{2}\./);
    expect(status).toMatch(/No real person was interviewed/);
    expect(status).toMatch(/Nothing here is a finding/);
  });

  it("labels every practice participant synthetic, keeps them apart from real IDs, and runs no concept test", () => {
    const rows = PRACTICE.split("\n").filter((l) => /^\| PR-/.test(l));
    expect(rows.length).toBe(18);
    for (const r of rows) expect(r, r.slice(0, 10)).toMatch(/^\| PR-[ECG]\d \| SYNTHETIC \|/);
    for (const seg of ["E", "C", "G"]) expect(rows.filter((r) => r.startsWith(`| PR-${seg}`)).length, seg).toBe(6);
    expect(PRACTICE.match(/^Concept tasks T1 to T\d: not run\.$/gm)?.length).toBe(3);
    expect(PRACTICE).not.toMatch(/\bT\d \d\/5\b/);
  });

  it("gives every guide hypothesis a row and marks none of them tested", () => {
    const table = section(PRACTICE, /^## Hypotheses: what desk research says/);
    const rows = [...table.matchAll(/^\| (H-[ECG]\d+) \| ([^|]+) \|/gm)];
    const listed = new Set(rows.map((m) => m[1]));
    for (const doc of Object.values(GUIDES)) {
      for (const [, id] of doc.matchAll(/^\| (H-[ECG]\d+) \|/gm)) expect(listed.has(id), id).toBe(true);
    }
    for (const [, id, verdict] of rows) expect(verdict.trim(), id).toBe("not tested");
    expect(PRACTICE).not.toMatch(/\|\s*(supported|not supported|mixed)\s*\|/i);
  });

  it("cites only public https sources, and holds no contact details", () => {
    const links = [...PRACTICE.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const l of links) expect(l).toMatch(/^https:\/\//);
    expect(PRACTICE).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(PRACTICE).not.toMatch(/\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/);
    expect(PRACTICE).not.toMatch(/\b(?:211|311|411|511|611|711|811|988)\b/);
  });

  it("leaves CC-2 to CC-5 open on real interviews, and the journey maps still hypotheses", () => {
    const left = section(PRACTICE, /^## What closes CC-2 to CC-5/);
    for (const id of ["CC-2", "CC-3", "CC-4", "CC-5"]) expect(left, id).toContain(`| ${id} `);
    expect(left).toMatch(/needs real people/);
    const maps = read("docs/research/05-journey-maps.md");
    expect(maps).toMatch(/^Status: HYPOTHESIS JOURNEYS/m);
    expect(maps).toMatch(/\[practice round\]\(12-practice-round\.md#sources\)/);
    expect(PREP.synthesis).toMatch(/\[practice round\]\(12-practice-round\.md\)/);
  });

  it("checks the guide timings it reports against the guides themselves", () => {
    const minutes = (doc: string) => [...doc.matchAll(/^## \d+b?\. .*\((\d+) min\)/gm)].reduce((n, m) => n + Number(m[1]), 0);
    expect(minutes(GUIDES.guardian)).toBe(70);
    expect(70 - minutes(GUIDES.elder)).toBe(3);
    expect(70 - minutes(GUIDES.caregiver)).toBe(2);
    expect(PRACTICE).toMatch(/The elder and caregiver guides leave 3 and 2 minutes/);
  });
});
