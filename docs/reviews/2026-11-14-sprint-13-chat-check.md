# Code review — Sprint 13, CC-192: Fewer false alarms from the family chat health check

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to build Sprint 13 given 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | **APPROVED** (round 5, after four rounds of changes) |

## What changed

The family chat warns before a message with health details goes to the group. In Sprint 12 the check matched single words, so everyday phrases like "Stroke the cat" or "A dose of sunshine" brought up the warning.

- `phiHint()` now blanks out known everyday phrases (`EVERYDAY_SENSES`) before it looks for health words. Anything not on that list still warns, so the check stays strict by default.
- Each everyday phrase is spelled out word for word, with no free gaps, so it can't swallow a health word next to it.
- "Stroke" still warns by default. Only its everyday senses are let through ("stroke the cat", "brush strokes", "a stroke of luck").
- The star sign is matched on the original capitals ("Mom is a Cancer, birthday in July").
- Curly apostrophes are read like straight ones.
- No screen changed, so no Figma design was needed.

## Measured on a fixed test set

40 everyday messages, 40 messages with health details, and 43 mixed messages where a health detail sits next to an everyday phrase. All are part of `src/__tests__/everyday.test.ts`.

| | Before (main at 5576da5) | After |
|---|---|---|
| Everyday messages that warned | 25 of 40 | **0 of 40** |
| Health messages that warned | 40 of 40 | **40 of 40** |
| Mixed messages that warned | 43 of 43 | **43 of 43** |

Acceptance criteria: every health message still warns, and no more than 2 of 40 everyday messages warn.

## Decisions

- **Heart rate stays strict.** "My phone's heart rate app" still warns. A heart rate is health data whoever it belongs to, so a warning there is cheap and a miss is not. The story's refinement notes listed it as a false alarm; that note is corrected.
- **Warn by default, with a list of exceptions.** A missed health detail costs more than an extra warning, so only phrases we've checked are let through. "The best medicine for her cough", "5 ml of cough syrup" and "a cancer survivor" still warn.
- **Unrelated test fix.** *gives the next dose when everything so far is confirmed* failed after 9 PM because the demo data logs doses up to the real time. The test now drops logs after its own 19:30 clock.

## Round 1 — CHANGES REQUESTED

The reviewer confirmed these were sound: the global patterns reset between messages, curly apostrophes are read correctly, "a dose of sunshine and her dose of lisinopril" still warns, and the recap test fix passes at any time of day (checked at seven clock times). Every finding below was confirmed by running the check: each message sent with no warning, where main warned.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 1 | The car and device patterns had free word gaps that swallowed health words ("In the car her cancer diagnosis came up") | Only "diagnose the car" as a direct object, or "the car needs a diagnostic"; the reverse pattern is gone | *still warns when a health detail sits next to an everyday phrase* (4 cases) |
| 2 | The ml pattern let liquid doses through ("Give her 5 ml with juice") | Needs a cooking verb and "ml of" an ingredient ("add 250 ml of milk") | same test (4 cases) |
| 3 | "Prescribed course" let "prescribed course of prednisone" through | Only "prescribed reading" (not reading glasses) and "prescribed route" | same test (2 cases) |
| 4 | The star-sign patterns let real cancer messages through ("Is weight loss a cancer sign?") | "Cancer sign" removed; the star sign needs a capital C, a person and a birthday word | same test (2 cases) |
| 5 | Narrowing "stroke" to a few lead words lost real messages ("My stroke was three years ago", "Possible stroke") | "Stroke" warns by default again; only named everyday senses are let through | same test (6 cases) |
| 6 | "History test results", "dog surgery" without 's, and "Tylenol is the best medicine" got through | "History" dropped; pets need 's; the idiom needs laughter, love, music, sleep or time | same test (3 cases) |
| 7 | The test set never put an everyday phrase next to a health word | Added the 24-message mixed set | same test |

## Round 2 — CHANGES REQUESTED

All 19 round 1 examples were verified to warn, and all 40 everyday messages stay silent. Three new gaps, each confirmed by running the check:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 8 | "Test results for school" let medical tests through ("Her TB test result for school is positive") | Only the exact message "test results from Lily's school are in" is let through | mixed set (4 cases) |
| 9 | "Key stroke", "back stroke" and "in 2 strokes" let real stroke messages through | Those removed; counted strokes only in "paint it with 2 strokes" | mixed set (4 cases) |
| 10 | A cooking verb let medicine in liquid through ("Crush the tablet and stir in 5 ml of water") | The cooking amount is let through only when the message names no person and no medicine | mixed set (2 cases) |
| 11 | (minor) "remission", "biopsy" and "prescribed reading lenses" sent with no warning | Added as health words; reading lenses, specs and spectacles warn | mixed set (2 cases) |

## Round 3 — CHANGES REQUESTED

All round 2 examples were verified to warn, and the everyday cases stay silent. Two small gaps, both messages that warned on main:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 12 | The school phrase was checked only at the start ("Test results from Lily's school are in: positive for covid") | Anchored at both ends, so anything after it is still checked | mixed set (2 cases) |
| 13 | Cooking amounts still let some medicine through ("Add 5 ml of water to the antibiotic powder") | The amount must end the message or go into a dish, and medicine words such as syrup, drops, powder and give block it | mixed set (3 cases) |

Not blocking, for later: "Add 250 ml of milk for Grandma's soup" warns, which fits the design. Covid, strep, antibiotic and scan are not health words yet; that gap was already on main.

## Round 4 — CHANGES REQUESTED

All round 3 examples were verified to warn, and the everyday cases stay silent.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 14 | A comma after a cooking amount let a medicine named after it through ("Add 60 ml of water, then the amoxicillin") | The amount must end the message or go "to the recipe, bowl, pan" and the like | mixed set (2 cases) |

## Round 5 — APPROVED

Both round 4 examples warn, and so do versions with a semicolon or a dash. "Add 250 ml of milk to the recipe" and "Add 30 ml of olive oil" stay silent with or without a full stop. The everyday, health and mixed sets and the full suite (444 tests) pass. Nothing found in any round still gets through where main warned.

**Follow-up, not blocking:** covid, strep, antibiotic, pharmacy and scan are not health words yet. That gap was already on main before CC-192.
