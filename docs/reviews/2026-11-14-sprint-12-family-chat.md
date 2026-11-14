# Code review — Sprint 12, feature 3: Private family chat (CC-164, CC-165)

| | |
|---|---|
| Pull request | [#3](https://github.com/sumanth1996/circle-care/pull/3), `claude/project-thread-paxgop` → `main` |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go for feature 3 and Figma design approved on 2026-11-14 |
| Date | 2026-11-14 |
| Final verdict | In review |

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

Not covered by unit tests: the chat screens themselves (the repo has no component test library, and this build container has no browser for the e2e suite).
