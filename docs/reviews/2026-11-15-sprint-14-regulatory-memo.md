# Code review — Sprint 14, CC-196: Update the regulatory memo for counsel

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` ([PR #12](https://github.com/sumanth1996/circle-care/pull/12)) |
| Approver | **Lead Architect Agent** (independent AI review agent, checked against the data inventory) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-196 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | **APPROVED** (round 2, after one round of changes) |

## What changed

- The regulatory memo (`docs/compliance/08-regulatory-memo.md`) is now draft v2. It still says it is not legal advice and that no lawyer has reviewed it.
- §2 describes the server and Postgres accounts from Sprint 11, and the new §2.1 table covers each kind of data added since the October draft under the consumer and agency models.
- §4 adds the new promises to track, and flags one that isn't true today: the chat voice sheet says words are turned into text on the device, but the chat's voice reply doesn't ask for on-device recognition. Story CC-222 fixes the code or the wording.
- §5 adds state laws on SSNs, data security, biometrics and money transmission.
- The new §10 covers payments, SSNs and identity data: why they're collected, the controls in place, the gaps in the backlog, who moves the money, and paying from the elder's money.
- Counsel's questions grow from 13 to 25 (Q14 to Q25).
- `src/__tests__/regulatory-memo.test.ts` (7 tests) checks the draft markings, that every inventory row is in §2.1, the guardian-only rows, that the voice flag matches the code, question numbering, and the README's question count.

## Round 1 — CHANGES REQUESTED

The reviewer confirmed the product facts: guardian-only payments with up to 5 cards, Stripe not built yet (503), no ACH fee, a bank account needed for a complete guardian profile, the recap shown only on the guardian's Home, and refill requests that don't contact the pharmacy.

| # | Finding | Fix |
|---|---|---|
| 1 | Must: the chat voice sheet promises on-device speech, but the chat's voice reply doesn't set `processLocally` | Flagged in §4 as a deception risk (Q20), story CC-222 created, and a test fails if the flag and the code disagree |
| 2 | Should: voice replies were described as the elder's only | Every member has a mic button; the elder gets a large one |
| 3 | Should: Stripe tokenizing cards was stated as fact | Now "planned", with the development vault noted, and PCI scope added as Q23 |
| 4 | Should: state data-security laws and the guardian's duty to account for the elder's money were missing | §5 rows, §10 text, Q24 and Q25 |
| 5 | Should: the tests only compared row names | Tests for guardian-only rows, the voice flag, and the shape of each model cell |
| 6 | Nit: a bank account is required, and SSNs aren't verified | Both stated |
| 7 | Nit: the "not reviewed by a lawyer" check could be fooled | Wider claims check, with self-tests |
| 8 | Nit: README question count and the heading date | The README count is checked by a test; date fixed |

## Round 2 — APPROVED

All eight round 1 findings are closed, and nothing new blocks the merge. The reviewer also checked that the public wiki pages name no people. Three of its four nits were fixed before merging:

| # | Nit | Fix |
|---|---|---|
| 1 | Q20 still said "the elder's voice" | Now "a member's voice" |
| 2 | The §2.1 intro said every row matches the inventory, but voice replies and the account email and password don't | The intro names those two and where they come from |
| 3 | The voice test matched one exact sentence, so a reworded on-device promise would slip past | It now matches any "turned into text on this, the or your device" wording; CC-222 is tracked in the Notion backlog |
| 4 | SAQ A eligibility rules in PCI DSS 4.0 could be added to Q23 | Left for counsel under CC-8 |

## Results

- `npm test`: 494 passed, 2 to-dos. Each new memo test was checked to fail when its rule is broken.
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: see the check on PR #12.
