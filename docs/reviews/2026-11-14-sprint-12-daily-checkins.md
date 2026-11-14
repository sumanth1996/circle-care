# Code review — Sprint 12, feature 2: One-tap daily check-ins (CC-142, CC-143)

| | |
|---|---|
| Branch | `feature/sprint-12-daily-checkins` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), design approved 2026-11-14, go for feature 2 on 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | *in review* |

## Round 1 — CHANGES REQUESTED

The reviewer confirmed tests and typecheck pass, writes are elder-only and refusals are audited, and lock-screen titles stay generic. Twelve findings:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| 1 | Turning check-in sharing on while all sharing was paused told Sarah she could see check-ins again | The notice says *"Maggie will share her daily check-ins with you once she resumes sharing."* | *F2-1* |
| 2 | Sharing worked backwards: entries logged while private became visible once sharing was turned on | A day started while not sharing (or while paused) is marked `private` and stays private all day; Sarah sees it as blank. Privacy-safe default, open to the PO's review. | *F2-2* (three tests) |
| 3 | A day with no record counted as "no meals", so someone who never uses the feature got Sarah a note every day, the first just after midnight | The note needs at least one meal logged in the five days before, ignores private days, and waits until 9 AM. Default chosen for the PO's review. | *F2-3* (three tests) |
| 4 | Privacy Center said *"Only Sarah can see them"* with a *Shared* badge while all sharing was paused | Text and badge follow the permission check; badge reads *Paused* | UI change |
| 5 | Sarah's *State of mind* said *"No feeling added today"* when check-ins simply weren't shared | Says *"Check-ins aren't shared"* or *"Maggie kept today private"* | covered by `sharedFeeling` tests |
| 6 | The 7-day grid used `role="table"` without row wrappers | Each row is wrapped in `role="row"` (`display: contents`); the corner is a hidden column header; bars and dots are hidden from screen readers in favour of the cell labels | UI change |
| 7 | The encrypted export left out daily check-ins | Added; a guardian's export includes only shared, non-private days | UI change |
| 8 | Viewing check-ins wasn't written to the access log | *"viewed daily check-ins"* from Health and the dashboard (once per 10 minutes) | UI change |
| 9 | Water sent an absolute value from the last render, so quick taps could lose a glass | Buttons send `waterBy: ±1`, added to what's saved | *F2-9* |
| 10 | Older check-in faces used different labels from the new faces | Older faces map onto the same six feelings | *F2-10* |
| 11 | Face labels and the privacy line were small on the elder screen | Raised to 0.85× the text size; the privacy line uses the darker ink | CSS change |
| 12 | Missing tests | Added: reminder at exactly 7:00, sharing turned on while paused, private-day entries, mood fallback, caregiver and family reads while paused | 11 new tests |

Not covered by unit tests: the exact on-screen wording in each sharing state (the repo has no component test library; the browser e2e suite can't run in this build container).

## Round 2 — CHANGES REQUESTED

Round 1 fixes confirmed (tests and typecheck pass). Two should-fix findings, both following from the round 1 privacy defaults, and three optional ones:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| F2-11 | A day Maggie never touched carries no `private` mark, so after turning sharing off and on again Sarah could get *"hasn't logged meals for 2 days"* about days she wasn't allowed to see | `settings.dailyLog.sharedSince` records when Sarah last gained access (sharing turned on, or resumed after a pause). The note needs both days to be fully shared since then. | *F2-11* (two tests) |
| F2-12 | On a private day the dashboard tile showed *"0 glasses · 0 of 3 meals"* as fact, while Health said *"Maggie kept today private"*, which hinted she had logged something | A private day comes back marked `private` with no counts. Tile: *"Daily check-in not shared today"*. State of mind: *"Not shared today"*. The 7-day grid shows a dash and leaves private days out of the averages. | *F2-12* |
| 3 | `display: contents` on the grid's rows can drop them from the accessibility tree in older Safari | Carried forward: newer Safari is fine; a real table layout is noted for the accessibility pass | — |
| 4 | *Simulate 2 days with no meals* did nothing before 9 AM | The demo moves the clock to 9:00 when it's earlier | demo only |
| 5 | Missing tests for finding 1 and on-screen wording | Finding 1 tests added; wording stays manual (see below) | — |

## Round 3 — CHANGES REQUESTED

F2-11, F2-12 and the demo clock confirmed. One finding:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| F2-13 | The general `settings` action let a guardian write `dailyLog` (and `vitals.shareWithGuardian`, already on main), turning Maggie's sharing on with no audit entry or notice | Settings logic moved to `applySettings` (shared by the store and tests). Any patch with `dailyLog`, or one that changes `vitals.shareWithGuardian`, is refused and audited for everyone; sharing changes go only through the elder-only `setDailySharing` and `setHealthSharing`. Sarah's own vitals thresholds still save. | *F2-13*; the resume-after-pause test now goes through `applySettings` |

## Round 4 — CHANGES REQUESTED

F2-13 confirmed. One finding:

| # | Finding | Fix | Regression test |
|---|---|---|---|
| F2-14 | *Pause sharing* is on the elder list, but a guardian patch fell through to the general settings permission, so Sarah could undo Maggie's pause (already on main) | `applySettings` refuses and audits any `sharingPaused` change from anyone but Maggie, before the general check | *F2-13* extended |

Carried forward as its own ticket: the emergency card can be written through `applySettings` by the guardian; check it against Maggie's approval of card changes.
