// CC-198: keeps the Browser tests workflow locked down. A later edit that goes back to a tag,
// lets checkout keep its token, drops Node 22 or cancels runs on main turns this test red.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW = readFileSync(resolve(__dirname, "../../.github/workflows/browser-tests.yml"), "utf8");
/** The workflow without its comment lines, so a commented-out setting can't satisfy a check. */
const CODE = WORKFLOW.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

describe("Browser tests workflow (CC-198)", () => {
  it("pins every outside action to a full commit SHA with its release in a comment", () => {
    const uses = [...CODE.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const [line, ref, rest] of uses) {
      expect(ref, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(rest.trim(), `${line} needs its release in a comment`).toMatch(/^# v\d+\.\d+\.\d+$/);
    }
  });

  it("keeps no credentials after checkout", () => {
    expect(CODE).toMatch(/uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+persist-credentials: false\n/);
  });

  it("keeps the token read-only and never runs pull-request code with secrets", () => {
    expect(CODE).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(CODE).not.toMatch(/write/);
    expect(CODE).not.toContain("pull_request_target");
    expect(CODE).not.toContain("secrets.");
  });

  it("uses Node 22 on a fixed runner image", () => {
    expect(CODE).toMatch(/node-version: 22\n/);
    expect(CODE).toMatch(/runs-on: ubuntu-24\.04\n/);
    expect(CODE).not.toContain("ubuntu-latest");
  });

  it("cancels an older run only for pull requests, so runs on main always finish", () => {
    expect(CODE).toMatch(/^concurrency:\n {2}group: browser-tests-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/m);
  });

  it("still runs the unit tests and all three browser suites with nothing skipped", () => {
    for (const step of ["run: npm test", "run: python tests/e2e/e2e.py", "run: python tests/e2e/everyday.py", "run: python tests/e2e/a11y.py"]) {
      expect(CODE).toContain(step);
    }
    expect(CODE).not.toMatch(/continue-on-error|if: false/);
  });
});
