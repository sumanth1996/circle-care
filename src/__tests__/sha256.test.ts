import { test, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256 } from "../lib/sha256";
test("matches node", () => {
  for (const m of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "héllo ✓ 🫶".repeat(9)])
    expect(sha256(m)).toBe(createHash("sha256").update(m).digest("hex"));
});
