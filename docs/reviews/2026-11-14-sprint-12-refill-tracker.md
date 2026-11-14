# Code review — Sprint 12, feature 1: Refill tracker and low-supply alerts (CC-120, CC-121)

| | |
|---|---|
| Branch | `feature/sprint-12-refill-tracker` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), design approved 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | **APPROVED** (round 4, after three rounds of changes) |

## Round 1 — CHANGES REQUESTED

The reviewer confirmed these were sound: repeated rule runs give one alert and one Calendar entry per bottle, requesting a refill stops repeats, a new bottle closes the old entry, the refill date is never in the past, skipped and refused doses don't use a pill, version-6 saved state is replaced instead of crashing, lock-screen titles stay generic, and refused writes are audited and change nothing.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 1 | Approving an older change request rolled the pill count back to the bottle at the time of the request | `withCurrentSupply()` keeps today's supply when an approved change is applied | *approving an older change request keeps today's pill count* |
| 2 | The screens said a refill was added to the Calendar on the planned day even when an existing refill covered it | `scheduledRefill()`; screens show the entry that is really on the Calendar (`calendarOn`) | *an existing refill already on the Calendar is reused* |
| 3 | Days left changed with the time of day, so the Calendar date depended on when the rules first ran | Today's unmarked doses are set aside first; run-out is the last day with every dose covered | *gives the same run-out day in the morning and after the evening dose* |
| 4 | Pills per dose was always 1 | `unitsPerDose()` reads the dose text ("2 tablets" uses 2) | *a 2-tablet dose uses 2 pills* |
| 5 | Off-shift caregivers could read pill counts | `supply.read` is `pro@shift`, like `meds` | added to the caregiver permission test; matrix test covers every cell |
| 6 | A refused change still showed a success message | Request refill and New bottle show only when `useCan("write", "supply")` | UI check |
| 7 | Two counts saved in the same minute left no Calendar entry | Entry id uses the full count time | *two counts saved in the same minute still leave a refill on the Calendar* |
| 8 | (unconfirmed) Pausing a medicine left its automatic refill scheduled | The rules cancel automatic entries for paused or removed medicines | *pausing a medicine cancels its automatic refill entry* |

## Round 2 — CHANGES REQUESTED

The seven confirmed fixes were verified. Two new findings:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 9 | Pause then resume left no Calendar entry, while the screens still showed a date | A paused entry is brought back with the new date; screens say *Not on the Calendar yet* when nothing is scheduled | *resuming a paused medicine puts its refill back on the Calendar* |
| 10 | "1/2 tablet" read as 1, and editing the dose changed what past doses used | Fractions read; past doses use the amount saved with the count; `rebaseSupply()` starts a fresh count when the dose changes | *reads half tablets* · *changing the dose mid-bottle keeps what past doses used* |

## Round 3 — CHANGES REQUESTED

Both round 2 fixes verified. Two regressions:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 11 | A refill entry the guardian cancelled came back on the next rule run | Only entries Circle Care cancelled for a pause (`autoCancelled`) are brought back | *a refill entry the guardian cancelled stays cancelled* |
| 12 | Editing the dose counted as a new bottle: a second alert and a second entry | `bottleId`, changed only by a new bottle, names the alert and the entry; saved state without it falls back to the count time | *editing the dose mid-bottle doesn't send a second alert or add a second entry* |

Also: ½, ¼ and ¾ are read as fractions.

## Round 4 — APPROVED

All fixes verified with the reviewer's probes. TypeScript compiles, 344 tests pass, production build OK.

## Carried forward (not blocking)

- Raising the dose mid-bottle leaves an existing automatic refill entry on its old date; it should move earlier when the new date comes first.

- Refill requests are recorded in Circle Care, not sent to a pharmacy (pharmacy integration is on the Release 2 roadmap).
- Saved demo data from version 6 is replaced with the new seed; a real build would migrate it.
