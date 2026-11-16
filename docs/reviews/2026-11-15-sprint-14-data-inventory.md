# Code review — Sprint 14, CC-9: Data inventory and classification

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start Sprint 14 with CC-9 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | **APPROVED** (round 3, after two rounds of changes) |

## What changed

- Every field of the demo state and every column of the Postgres schema has a data class in `src/data/classification.ts`: PHI, PII, sensitive financial or identity, or operational.
- A unit test fails, naming the field, when a field has no class, a classified field no longer exists, or the [data inventory](../compliance/09-data-inventory.md) lists a field under a different class than the code. It checks three sources: the types in `src/data/types.ts`, the live demo data, and the database catalog after the migrations run.
- The inventory was rewritten from the code: where data lives, how SSNs, bank accounts, cards and photos are protected, which everyday features can hold health details, field tables, retention and open decisions.
- The Privacy Center no longer says the access log holds no health details. It records who opened or changed what, and what can be a medicine or a document, so it is protected as health information.
- No screen layout changed, so no Figma design was needed.

## Decisions

- **The access logs are not operational.** The circle's log names medicines, documents and appointments, so it is PHI. The server's audit detail keeps SSN, bank and card last fours, so it is sensitive.
- **Who and when go with the record.** In a record that holds PHI, the member and the time are PHI too.
- **Readable ids are PHI.** Demo ids embed what they are about (`med-lisinopril`, `t-bath`, `s-ana`). Production should use opaque ids; that is listed under the inventory's human actions.
- **Unrelated test fix.** Three rules-engine tests failed after midnight UTC because "70 minutes ago" wrapped into today. They now pin the demo clock to noon. The real gap behind it, a late dose missed before midnight is never escalated, is filed as CC-199 with two to-do tests.

## Round 1 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| 1 | `AuditEvent.resource` was operational, but it names medicines and documents; Privacy Center said the log holds no health details | Tagged PHI; copy corrected |
| 2 | `audit_events.detail` was operational, but it holds SSN, bank and card last fours | Tagged sensitive; listed where SSNs, banks and cards are stored |
| 3 | The SQL parser skipped quoted names, `UNLOGGED`, `ADD` without `COLUMN`, renames and more | Replaced: the test runs the migrations on in-memory Postgres and reads the columns from the database |
| 4–5 | The type reader skipped `extends`, generics, object type aliases, and objects inside unions or generics | Reader handles them, and refuses any shape it can't read |
| 6–17 | Inventory wording: routes, bank replacement, the vault, photo metadata, vault metadata, sessions, fingerprints, recap inputs, medicine ids, reviewer text | Corrected against the code; the midnight gap filed as CC-199 |
| 18–19 | Inconsistent tags, unclassified masked views, duplicate inventory rows | One rule per kind of field, checked by a test; both views classified; duplicates refused |

## Round 2 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| 1 | The reader still lost fields after a function type, a comma, a trailing `&` or a `//` inside a string | One tokenizing pass; arrows aren't brackets; commas split members; a per-body count of fields; and a second check that walks the live demo data |
| 2 | The declaration count could never catch anything | Removed |
| 3 | Materialized views and other schemas were invisible | The test reads Postgres's own catalog for every kind of table and view in every schema |
| 4 | Appointment, task, approval and bottle ids are readable but were operational | Tagged PHI |
| 5–7 | PHI handling line, four other pages still saying the log holds no health values, "never stored in full" | Reworded to match the code |
| 8–11 | Rule wording, lock-out wording, Privacy Center retention in the demo, helpers in a test file | Fixed |

## Round 3 — APPROVED

No findings above a nit. Fixed before merge: shift ids tagged PHI, schema-qualified names readable in the inventory, and a clearer Privacy Center sentence. Left as they fail loudly rather than pass: two import forms and a union split over several lines are refused by the reader.

## Checks

- `npm test`: 9 files, all pass, plus 2 to-dos for CC-199
- `npm run typecheck` and `mkdocs build --strict`: clean
- Browser tests in CI: pass
