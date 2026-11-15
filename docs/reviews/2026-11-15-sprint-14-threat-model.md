# Code review — Sprint 14, CC-10: Threat model of the architecture as built

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-10 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | **APPROVED** (round 2, after one round of changes) |

## What changed

- The [threat model](../security/10-threat-model.md) was rewritten against the code on `main`. The October draft described a planned system with no backend. The new one covers ten components, from the web app to the Replit workspace, with 57 STRIDE threats.
- Each threat names the code behind its control, its status (In place, Partial, Demo only or Missing), its impact and likelihood, the risk that follows from them, an owner and, where one exists, a story.
- A unit test keeps the model honest as the code changes. It fails when a referenced file is gone or the named code survives only in a comment, when a row is malformed or missing, when a risk doesn't follow from its ratings, when a control names no file, or when a High risk that isn't in place has no story in the High risks table.
- Six High risks have backlog stories: CC-200 (server sign-in second step), CC-201 (end every session), CC-202 (care data and permission checks on the server), CC-203 (verify the database certificate), CC-204 (shared rate limits) and CC-205 (deliver safety alerts from the server).
- Stale claims in other pages were corrected: the server now sends the CSP and anti-framing headers, an accounts server exists, and a few data-changing actions are still unguarded.
- No screen layout changed, so no Figma design was needed.

## Decisions

- **Rated for a production launch.** Today's data is fictional or test-only, so every risk is rated for what the gap would cost with real people.
- **Risk follows from two ratings.** Impact and likelihood are scored 3, 2 or 1 and multiplied: 6 or more is High, 3 or 4 is Medium. This made three browser-only gaps High (off-shift browsing, the inactivity lock, export), all under CC-202.
- **Alert delivery is in scope.** Real push and SMS providers aren't built, but an alert that never leaves the elder's device is the biggest availability risk, so it has its own story (CC-205).
- **The public wiki publishes this model.** Whether security documents stay public is left to the PO (C9-I1).
- **Still needs people.** The model is agent-written and agent-reviewed. It still needs an engineer with security experience and the security officer (CC-79).

## Round 1 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| M1 | Only one availability threat; a lost safety alert was rated High impact but had no row | Added C2-D1 (alerts stay on the device, High, CC-205), C2-D2, C3-D1, C3-D2 and C10-D1; scope says alert delivery is in |
| M2 | C4-S3 said there is no way to end every session, but the SSN-change lockout does, and the row listed working controls | C4-S3 is Partial and names the lockout as the only such path |
| M3 | C7-I1 "In place" overclaimed: `--full-names` reads the base tables, there is no auditor role, mode 600 only applies to new files | Partial, with each limit stated |
| M4 | The diagram showed the vault passing tokens to the payment routes | Redrawn: browser to vault, token back to the browser, browser to payment routes, vault to database; static files, third parties, workspace and operators added |
| S5 | The test could pass with a wrong doc: comment matches, loose counts, rows naming no code, a phrase test that the Owner column satisfied | Exact row count, malformed rows fail, references must be outside comments, every existing control names a file, the warning box itself is asserted |
| S6 | The Story column mixed fix, origin and test stories, and CC-201 was given to threats its title didn't cover | Column defined; misused stories removed and those threats listed as Medium with no story |
| S7 | Three ratings broke the rating rule, and no rating could be checked | Impact and Likelihood columns; the test checks every risk |
| S8 | SSN lookup and SSN squatting were missing | C3-I3 and C3-D1 |
| S9 | The Replit workspace dev server is public | C10-I3, and C10-I4 for who can read the Replit Secrets |
| S10 | Other pages still said there is no backend, that every action is guarded, or that anti-framing is backlog | Corrected in seven pages and the `vite.config.ts` comment |
| N11–21 | Evidence and wording in eleven rows; story summaries in the High risks table | All addressed |

## Round 2 — APPROVED

Approved with one Should and a few nits, all fixed before merge:

| # | Finding | Fix |
|---|---|---|
| S1 | C3-I3's likelihood was Low although no password or rate limit stands in the way | Medium, so High; added to CC-204 in the High risks table |
| N2 | C3-S1 cited only the SSN control | Missing |
| N3 | C10-I3 said only test data is accepted | Only test SSNs, bank accounts and cards |
| N4 | CC-205's summary didn't cover a storage reset | Summary now matches its criteria |
| N5 | C6-I2 cited test token names, not the in-process vault | Cites the vault being mounted in `server/app.ts` |
| N6 | Diagram: keys went only to the static files; "1." labels can render as a list | Edge points at the host; labels read "Step 1:" |
| N7 | One reference matched two lines; the High risks table's status wasn't checked | Distinct reference; the test now checks each listed threat's status and that only High, not-in-place threats are listed |
| N8 | The two CSP lists live separately | Listed as a Medium with no story yet (C1-I1) |

## Results

- `npm test`: 469 passed, 2 to-dos (doses and check-ins that cross midnight, CC-199).
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: passed.
