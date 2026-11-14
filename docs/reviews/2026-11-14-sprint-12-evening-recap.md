# Code review — Sprint 12, feature 4: Evening recap (CC-191)

| | |
|---|---|
| Pull request | [#4](https://github.com/sumanth1996/circle-care/pull/4), `claude/project-thread-paxgop` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go for feature 4 and Figma design approved on 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | Pending |

## What was built

- `recap()` in `src/data/everyday.ts` builds the summary; `recapOpen()` shows the card from 6 PM; `inQuietHours()` reads quiet hours that may run past midnight.
- `EveningRecap` in `src/components/guardianEveryday.tsx`, shown on `GuardianHome` from 6 PM.
- One `recap-<date>` alert for the guardian between 19:00 and 23:00, titled "Update from Circle Care" with the in-app text "Your evening recap is ready." Skipped when `settings.recapNotify` is off or quiet hours cover the time.
- `recapNotify` setting (guardian only, default on) under **Settings · Evening recap**. Saved demo data moves to version 11.
- Presenter control **Skip to 7 PM for the evening recap**.

## Checks before review

`npm test` 425 passed (11 new) before review · `npx tsc --noEmit -p .` clean · `npm run build` passed.

## Round 1 — CHANGES REQUESTED

The reviewer found no privacy leak or permission bypass. "Her day" goes through `sharedLogFor`, so unshared, paused and private days stay hidden. The alert is guardian-only, once a day and PHI-free. Only Sarah can change `recapNotify`, and version 11 drops older saved data. Twelve findings:

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F4-1 | must | A dose in the "due" state counted toward the total but not as taken or missed, so the card said "All confirmed" and could call the day calm | Due doses are listed on their own ("Due now: Metformin, 6:00 PM"), the headline says "1 dose is due now." and the day isn't calm | *F4-1* (18:10 and 20:50) |
| F4-2 | should | Skipped and refused doses were labelled "Not confirmed" | Separate "Skipped" and "Refused" lines | *F4-2* |
| F4-3 | should | The quiet-hours skip looked at the current minute, so quiet hours ending at 19:30 still sent the update at 19:35 | The skip is decided at 7 PM; 19:00 to 23:00 is only a catch-up for a late first open (`RECAP_LAST_CALL`) | *F4-3*, 11 PM test |
| F4-4 | should | The card said a refill was on the Calendar when none was | Only `calendarOn` is passed; otherwise "Not on the Calendar yet" | *F4-4* |
| F4-5 | should | "Missed" and "didn't check in" ignored the check-in window | Uses `checkinMissed`; shows "Not yet" while the window is open | *F4-5* |
| F4-6 | should | "See the week", the refill links and the chat chip were under 44px | `.recap-tap` gives them a 44px minimum height | CSS change |
| F4-7 | optional | Amber text only just met AA; the section was named by the headline alone | Darker amber `#9a5000`; the section is labelled by the kicker and the headline | CSS and markup |
| F4-8 | should | Missing tests | Due doses, paused medicine, paused sharing, calm and other headlines, plural refills, 11 PM, family refused, quiet hours ending after 7 PM, cancelled appointments and revoked caregivers | 12 new tests |
| F4-9 | should | Release notes called v0.6 released before the merge | "In progress" restored until the merge; docs match F4-3 | Docs |
| F4-10 | optional | Tomorrow's visit could come from a revoked caregiver | Only active members | *cancelled and revoked* test |
| F4-11 | optional | Empty days read "0 of 0" | "None today" and "No routines today" | UI change |
| F4-12 | optional | The presenter toast hard-coded "7:05 PM" | Uses `fmtTime("19:05")` | UI change |

Checks after round 1: `npm test` 437 passed · `npx tsc --noEmit -p .` clean · `npm run build` passed.

## Round 2 — CHANGES REQUESTED

F4-1, F4-2, F4-4, F4-5, F4-7 to F4-12 resolved; privacy and permissions still clean. Four findings:

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F4-13 | must | After F4-3, a late catch-up ignored the current time and could fire inside quiet hours (a first open at 22:30 with the default 22:00 to 07:00) | Skipped when quiet hours cover 7 PM or the current minute | *F4-13* (22:30 default; 21:00 with 20:00 to 07:00) |
| F4-14 | should | `.btn.sm` (34px) outranked `.recap-tap`, so the chat chip and Review medicines stayed small | `.btn.sm.recap-tap` gets the 44px minimum too | CSS change |
| F4-15 | should | A day read "A calm day for Maggie." while her check-in was still to come | Calm needs the check-in done; while her window is open the headline is "Maggie's check-in is still to come." | *F4-5* updated |
| F4-16 | optional | New headline copy and the due-dose case for Review medicines weren't in the docs | Guardian dashboard page and release notes list every headline and when Review medicines shows | Docs |

Checks after round 2: `npm test` 438 passed · `npx tsc --noEmit -p .` clean · `npm run build` passed.
