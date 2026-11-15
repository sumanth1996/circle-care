# Code review — Sprint 14, CC-195: Keep a change made just before the tab closes

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` ([PR #11](https://github.com/sumanth1996/circle-care/pull/11)) |
| Approver | **Lead Architect Agent** (independent AI review agent, encrypted storage) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-195 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | **APPROVED** (round 3, after two rounds of changes) |

## What changed

- The demo store starts an encrypted save as soon as the state changes (`src/data/saver.ts`), instead of after a 250 ms timer. Saves can finish out of order, so a save only writes when nothing newer is stored.
- The latest state is saved again when the page is hidden or closed (`pagehide` and `visibilitychange`).
- The 15 second rules tick keeps the same state object when nothing changed, so it doesn't save. A separate beat still re-renders screens that show the time.
- Closing the circle (CC-33) pauses saving, drops any save under way and forgets the last state while the data and key are wiped, so nothing from the old circle can be written back.
- The device key starts loading when the app opens, without blocking start-up. A failed key load isn't cached, and the wipe clears the cached key again once the key is deleted.
- If encoding the newest save fails, it is retried once.
- `src/__tests__/saver.test.ts` (12 tests) and the evening recap browser step (reload straight away, and hide then reload) cover this.

## Round 1 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| 1 | Must: a save under way during Close circle could write the wiped circle back | Saving pauses during the wipe and saves from before it are dropped |
| 2 | Must: keeping the same state on a quiet tick stopped time-based screens re-rendering | A beat counter re-renders them every 15 seconds |
| 3 | Should: waiting for the device key could block start-up if IndexedDB hangs | The key load starts without waiting, and a failed load isn't cached |
| 4 | Should: one failed encode left the latest change unsaved | The newest save retries once |
| 5 | Should: test gaps | Tests for wipe, retry, hide, and the tick; hook-level rendering is not unit tested, since there is no DOM test environment |
| 6 | Should: the browser step waited a fixed time | It now reloads straight away, then hides and reloads |
| 7–8 | Nits: security docs, and the unused `saveEncrypted` | Threat model C2-I2 and the data inventory updated; `saveEncrypted` removed |

## Round 2 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| 1 | Must: `save()` still kept the last state while paused, so a page hide just after the wipe could save the old circle | `pause()` forgets the last state and a paused save keeps nothing; new test for pause, save, resume, hide |
| 2 | Should: a key load during the wipe could cache the old key | The wipe clears the cached key again after deleting it |
| 3 | Should: the hide-then-reload step doesn't prove the hide save by itself | Step relabelled "nothing is lost when it is hidden first" |
| 4 | Nit: the system overview said the key loads before the first save | Reworded |

The reviewer confirmed the pause and resume order in Close circle is right, and that the beat can't cause a save or a loop.

## Round 3 — APPROVED

All four round 2 fixes close their findings, and nothing new was found in this change. One older edge, outside this story, remains: a care document uploaded while the circle is being closed could leave an unreadable file behind.

## Results

- `npm test`: 487 passed, 2 to-dos.
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: see the check on PR #11.
