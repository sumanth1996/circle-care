// CC-196: keeps the regulatory memo draft (docs/compliance/08-regulatory-memo.md) in step with the
// data inventory (CC-9) and honest about what it is: a draft of working assumptions, not legal advice.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MEMO = readFileSync(resolve(ROOT, "docs/compliance/08-regulatory-memo.md"), "utf8");
const INVENTORY = readFileSync(resolve(ROOT, "docs/compliance/09-data-inventory.md"), "utf8");
const THREATS = readFileSync(resolve(ROOT, "docs/security/10-threat-model.md"), "utf8");
const README = readFileSync(resolve(ROOT, "docs/README.md"), "utf8");
const CHAT = readFileSync(resolve(ROOT, "src/components/chat.tsx"), "utf8");

/** The text from a heading line up to the next heading of the same or a higher level. */
function section(doc: string, heading: string) {
  const start = doc.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`Missing heading: ${heading}`);
  const level = heading.match(/^#+/)![0].length;
  const rest = doc.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Body rows of the first table in some text, as trimmed cells. */
function tableRows(text: string) {
  const lines = text.split("\n").filter((l) => l.startsWith("|"));
  return lines.slice(2).map((l) => l.replace(/^\||\|$/g, "").split(" | ").map((c) => c.trim()));
}

/** The data type a row names, without code and the part in brackets: `Daily check-ins (`DailyLog`…)` → `Daily check-ins`. */
const dataName = (cell: string) => cell.replace(/\s*\(.*$/, "").replace(/\*\*/g, "").trim();

const NEW_DATA = tableRows(section(MEMO, "### 2.1 Data added since the October draft"));
const QUESTIONS = tableRows(section(MEMO, "## 11. Open questions for counsel"));

describe("regulatory memo draft (CC-196)", () => {
  it("is still marked as a draft of working assumptions, not legal advice, with the update date", () => {
    const status = MEMO.split("\n").find((l) => l.startsWith("Status:"))!;
    expect(status).toMatch(/DRAFT v\d+ for counsel review, updated \d{4}-\d{2}-\d{2} — not legal advice/);
    expect(status).toContain("No lawyer has reviewed it");
    expect(status).toContain("Every conclusion below is a working assumption");
    const claims = /(reviewed|approved|confirmed|signed off) by (counsel|a lawyer|an attorney|legal)|(counsel|attorney|(?<!No )lawyer)s? (has|have) (reviewed|approved|confirmed|signed off)|lawyer[- ]approved|legal review (is )?(complete|done|passed)/i;
    expect(MEMO).not.toMatch(claims);
    // The pattern itself catches the wordings it is meant to.
    for (const claim of ["confirmed by counsel", "Lawyer approved", "a lawyer has reviewed this", "legal review complete"]) expect(claim).toMatch(claims);
  });

  it("covers every data type the inventory lists for accounts, payments, chat and check-ins", () => {
    const covered = NEW_DATA.map((r) => dataName(r[0]));
    for (const heading of ["## SSNs, bank accounts, cards and profile photos", "## Chat, check-ins, supply counts and the evening recap"]) {
      const names = tableRows(section(INVENTORY, heading)).map((r) => dataName(r[0]));
      expect(names.length).toBeGreaterThan(3);
      for (const name of names) expect(covered, `${name} is in the data inventory but not in memo §2.1`).toContain(name);
    }
  });

  it("says for each new data type how it applies to both business models, with a working assumption", () => {
    expect(NEW_DATA.length).toBeGreaterThanOrEqual(9);
    for (const row of NEW_DATA) {
      expect(row, row.join(" | ")).toHaveLength(5);
      const [name, consumer, agency, assumption, questions] = row;
      // Each model says how, not just whether: "Applies" alone isn't enough.
      expect(consumer, `${name}: consumer model`).toMatch(/^(Applies|Not)\S*[;.,]? \S+/);
      expect(agency, `${name}: agency model`).toMatch(/^(Applies|Not)\S*[;.,]? \S+/);
      expect(assumption.length, `${name}: working assumption`).toBeGreaterThan(20);
      expect(questions, `${name}: questions`).toMatch(/^(—|Q\d+(, Q\d+)*)$/);
    }
  });

  it("says who can add what, as the data inventory does", () => {
    // Where the inventory says only the legal guardian can write a data type, the memo row must say so too.
    const inventory = tableRows(section(INVENTORY, "## SSNs, bank accounts, cards and profile photos"));
    const guardianOnly = inventory.filter((r) => /legal guardian only/i.test(r[3])).map((r) => dataName(r[0]));
    expect(guardianOnly).toEqual(expect.arrayContaining(["Bank account", "Card"]));
    for (const name of guardianOnly) {
      const row = NEW_DATA.find((r) => dataName(r[0]) === name)!;
      expect(row[1], `${name} in memo §2.1`).toMatch(/only the legal guardian/i);
    }
  });

  it("flags the chat's on-device voice wording as untrue for as long as the code makes it so", () => {
    const promises = section(MEMO, "## 4. FTC Act §5 and the FTC Health Breach Notification Rule (HBNR)");
    const says = /turned into text on (this|the|your) device/i.test(CHAT);
    const keepsOnDevice = /processLocally\s*=\s*true/.test(CHAT);
    const flagged = /A promise that isn't true today: the chat's voice sheet/.test(promises);
    expect(flagged, "memo §4 must flag the chat's voice promise exactly while it is untrue (CC-222)").toBe(says && !keepsOnDevice);
  });

  it("numbers its questions for counsel in order and defines every one it refers to", () => {
    const numbers = QUESTIONS.map((r) => r[0]);
    expect(numbers).toEqual(numbers.map((_, i) => `Q${i + 1}`));
    const defined = new Set(numbers);
    for (const [ref] of MEMO.matchAll(/\bQ\d+\b/g)) expect(defined, `${ref} is referred to but not in §11`).toContain(ref);
    // Every new data type with a question points at one; the new questions are all used somewhere.
    // Every question added in v2 (Q14 on) is linked to a data type in §2.1.
    for (const q of numbers.slice(13)) {
      expect(NEW_DATA.some((r) => r[4].split(", ").includes(q)), `${q} is not linked to a data type in §2.1`).toBe(true);
    }
    // The docs index asks counsel to answer them all.
    expect(README).toContain(`answer Q1–Q${numbers.length}`);
  });

  it("links the backlog gaps it names to stories that the threat model also tracks", () => {
    const gaps = MEMO.split("\n").find((l) => l.startsWith("- **Gaps already in the backlog**"))!;
    const stories = [...gaps.matchAll(/CC-\d+/g)].map((m) => m[0]).filter((s) => s !== "CC-10");
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) expect(THREATS, `${story} is not in the threat model`).toContain(story);
  });
});
