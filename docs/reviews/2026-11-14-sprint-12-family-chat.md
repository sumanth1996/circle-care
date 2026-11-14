# Code review — Sprint 12, feature 3: Private family chat (CC-164, CC-165)

| | |
|---|---|
| Pull request | [#3](https://github.com/sumanth1996/circle-care/pull/3), `claude/project-thread-paxgop` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go for feature 3 and Figma design approved on 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | **APPROVED** (round 3) |

## Round 1 — CHANGES REQUESTED

The reviewer confirmed the permission core is sound: `can()` gates paid caregivers on `chat.pros`, pausing sharing removes family and caregivers, both removal paths and time-limit expiry call `leaveChat`, refusals are audited, only Maggie changes `elderChatOnHome`, lock-screen banners carry only the generic title, and no end-to-end encryption claim appears. Twelve findings:

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F3-1 | must | Typing in the talk sheet still saved the message as "By voice" | Only unedited words from speech recognition are marked voice; typing or editing clears it | UI change |
| F3-2 | must | Edit on the health check after a spoken message threw the words away (Maggie's view has no text box) | Edit reopens the talk-or-type sheet in typing mode with her words | UI change |
| F3-3 | should | An off-shift caregiver in the chat could pick "Save as a note", which was refused while the toast said it was saved | "Save as a note" only shows when the person can write notes; otherwise the sheet says so. The sheet also says who can read a note | UI change |
| F3-4 | should | The chat alert's `/app/chat` link went to Alerts or Home | The banner and the Alerts list open `/app/<you>/chat`, as they do for SOS | UI change |
| F3-5 | should | A caregiver who was added saw the whole family history | `chat.joinedAt` records when they joined; they see messages from then on, and it's cleared when they leave | *Review F3-5* |
| F3-6 | should | The health check missed "meds", "dosage", "BP", "1000 IU", "vitamin d", "atorvastatin20mg" and some conditions, and fired on "tablet", "kidney beans" and "units" | Wider list, medicine names matched without their strength, IU added, ambiguous words dropped | *Review F3-6* |
| F3-7 | should | Some buttons in Maggie's view were under 48px | "type instead" is 48px; People 52px; sheet buttons 56px | CSS change |
| F3-8 | should | Two more tests compared timestamps to the millisecond, and fake timers weren't restored on failure | `Date` is frozen in every everyday test and restored in `afterEach` | 8 clean runs in a row |
| F3-9 | should | Release notes still listed family chat as "coming next" | Only the evening recap is listed | Docs |
| F3-10 | should | Any recognition error (silence, a restart) switched Maggie to "voice isn't available"; old recognizers could still set state | Only blocked-microphone errors switch to typing; silence asks her to tap again; old handlers are detached before abort | UI change |
| F3-11 | optional | "type instead" turned the microphone on | It opens the sheet in typing mode | UI change |
| F3-12 | optional | Being switched off while the chat was open logged a "denied" entry she didn't cause; `leaveChat` had no direct test | The chat logs a read or a refusal once, when opened; `leaveChat` is exported and tested | *Review F3-12* |

## Round 2 — CHANGES REQUESTED

Ten of the twelve round 1 fixes confirmed (414 tests pass, typecheck clean). The F3-5 fix brought two regressions:

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F3-13 | must | `chat.joinedAt` is new, but saved demo data stayed at version 9, so data saved by the first build had no `joinedAt` and Sarah's app crashed | Saved demo data moves to version 10 (older data is replaced by the new seed) | Release notes updated |
| F3-14 | should | "Read by Ana" could show on a message from before Ana joined | Read marks count only for people who could see the message | UI change |
| F3-15 | optional | Health check: "Gave her 10 units" missed; "BP station", "stroke of luck" and a one-letter medicine name fired | Units count with a giving or taking verb; BP and stroke only in a health sense; strength stripped only when 3 letters remain | *Review F3-6* (extended) |
| F3-16 | optional | A new speech recognizer was built on every render | Support is checked once | UI change |
| F3-17 | optional | Tapping the microphone to stop lost the final words | It stops recognition and keeps the last result | UI change |
| F3-18 | optional | The Vitamin D check sat inside an `if` | It asserts the seed has Vitamin D3 | Test change |

## Round 3 — APPROVED

All six round 2 fixes confirmed. 414 of 414 tests passed on three full runs, and the typecheck is clean.

> Approved after three review rounds. The private family chat meets CC-164 and CC-165: paid caregivers get in only when Maggie or Sarah adds them, and see messages only from when they joined. Refusals are audited, and lock-screen alerts carry no message text. Voice messages are marked only when the words came from speech. All 18 review findings (F3-1 to F3-18) are fixed.

Left for later (optional, not blocking):
- The health check still flags a few harmless phrases, like "stroke the cat" and "take 2 units at the storage place". It never blocks a message, since Send anyway is always offered.
- The architecture wiki pages still list an older `STATE_VERSION` and don't describe `state.chat`. Both were already stale before this PR, so they're a wiki catch-up for after Sprint 12.

Not covered by unit tests: the chat screens themselves (the repo has no component test library, and this build container has no browser for the e2e suite).
