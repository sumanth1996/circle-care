// CC-221: CI, Replit, package.json and the README all name the same Node major, so the app
// is never developed or deployed on a Node version that CI doesn't test.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("One Node version everywhere (CC-221)", () => {
  const ci = read(".github/workflows/browser-tests.yml").match(/^\s*node-version:\s*["']?(\d+)/m)?.[1];

  it("CI names a Node major", () => {
    expect(ci).toBe("22");
  });

  it("Replit runs the same major as CI", () => {
    expect(read(".replit")).toMatch(new RegExp(`^modules = \\[[^\\]]*"nodejs-${ci}"`, "m"));
  });

  it("package.json requires at least the CI major", () => {
    const engines = JSON.parse(read("package.json")).engines?.node as string;
    expect(engines).toBe(`>=${ci}`);
  });

  it("the README and the system overview name the same major", () => {
    expect(read("README.md")).toContain(`Requires Node ${ci} or later`);
    const overview = read("docs/wiki/architecture/system-overview.md");
    expect(overview).toContain(`(Node ${ci}+)`);
    expect(overview).toContain(`(Node ${ci}, port 5000`);
    expect(overview).not.toMatch(/Node 20\b/);
  });
});
