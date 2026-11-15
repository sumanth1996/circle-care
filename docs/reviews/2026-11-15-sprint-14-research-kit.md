# Code review — Sprint 14, CC-197: Update the research kit for the built features

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` ([PR #13](https://github.com/sumanth1996/circle-care/pull/13)) |
| Approver | **Lead Architect Agent** (independent AI review agent, checked against the prototype's screens) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-197 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | Round 1 and 2: changes requested · Round 3 pending |

## What changed

- The screener (`docs/research/01-recruiting-screener.md`) is draft v2. It says what is kept from screening, and the consent outline now says that no health details are asked for or recorded beyond what a participant chooses to share, how notes are stored, and when recordings, the name-to-number list and notes are deleted. It also explains the practice app: made-up people, a research phone, and a reset and browser-data clear after every session.
- The human steps before fieldwork now name recruiting, incentives, consent review, the safety protocol, agency approvals, the interpreter budget and the research phone.
- Each interview guide (02 elders, 03 caregivers, 04 guardians) is draft v2 with a second concept test of the features built since October:
  - Elders: *My day* check-ins, keeping them private, the family chat, and what Sarah sees in her evening recap and refill notes.
  - Caregivers: pills on hand and refills, joining the family chat and its health-detail check, and what they think of the check-ins and recap.
  - Guardians: the evening recap, a low supply, the 7-day check-ins and the family chat.
- New hypotheses: H-E7 to H-E10, H-C7 to H-C11 and H-G8 to H-G11, including whether people think **Request refill** contacts the pharmacy (it only records the request).
- Every guide has the research phone's microphone blocked for the prototype, so participants type in the chat, until CC-222 makes the chat's voice reply stay on the device.
- `src/__tests__/research-kit.test.ts` (11 tests) checks the draft markings, that each guide covers chat, check-ins, refills and the recap, that every label and presenter control quoted in the §6b/§7b concept tests exists in the app, that the guardian tasks match what the seeded recap and low-supply list really show, that the caregiver's everyday tasks come before T3 ends Ana's shift, the chat voice reminder against the code, the consent wording, the human steps, that there are no real contact details, and hypothesis numbering.

## Round 1: changes requested

| # | Finding | Fix |
|---|---|---|
| 1 | The caregiver's T3 hand-off ends Ana's shift, so §6b's refill and chat tasks would fail; the demo gives Ana no Sunday shift | §6b now runs straight after T2, with a *Reset demo* fallback, a T1 note for when Ana is already checked in, and Monday to Saturday sessions |
| 2 | The guardian T6 expected *A calm day*, but the seeded recap is never calm; Atorvastatin is already low | T6 expects *a look* or *One refill to sort out.*; T7 accepts either medicine |
| 3 | Elder T3 leaves *Pause sharing* on, which makes §6b's day private | Turn it off before §6b; T8 handles sharing kept off |
| 4 | Consent §5 didn't say what is asked, or cover the person cared for | It names the medicine count and type of difficulty, never conditions, and covers the person cared for |
| 5 | Session lengths and the incentive didn't fit the longer guides | Up to 60 or 70 minutes, with named tasks to drop, and the incentive line matches |
| 6 | Hypothesis thresholds counted people who skipped an optional task | Counted against those who did the task |
| 7 | "Explains it correctly" for **Request refill** was undefined | Defined, and the guides quote the confirmation the app shows |
| 8 | Telling people not to speak wasn't enough: one tap starts listening | The research phone blocks the microphone for the prototype site; the dose voice stays on-device |
| 9 | The voice-reminder test depended on the chat's wording | It now follows only whether the chat keeps speech on the device |
| 10 | "Nothing you tap stays" overstated what *Reset demo* clears | Guest profile, keyboard learning off, site data cleared, and the consent wording softened |
| 11 | Withdrawal and recordings weren't tied to what can really be deleted | Withdrawal runs until the name-to-number list is deleted; recordings keep the voice until deleted; transcription method named |
| 12–13 | Elder T6 didn't probe the note Sarah gets; T7 ruled out dictation | Both added |
| 14 | Tests checked labels, not behaviour; the record overclaimed | Three behaviour tests added against the seed; the label claim is scoped to §6b/§7b |
| 15–17 | Smaller accuracy fixes | Guardian meals note is in the alerts; "with breakfast"; Vitamin D3 and Ruth added |
| 18 | The checklist-format check could never fail | Removed |

## Round 2: changes requested (small fixes)

All four round 1 Musts were confirmed fixed against the code and the seed.

| # | Finding | Fix |
|---|---|---|
| 1 | The elder timings (§1 to §6 about 54 minutes, plus §6b and wrap-up) didn't fit "up to 60 minutes" | Elder sessions are up to 70 minutes like the others; the screener question and incentive match |
| 2 | The short-session drop lists removed the only test of a new feature (caregiver T7, guardian T9) | Drop older optional tasks instead: caregiver T4, guardian T5 and T4 |
| 3 | The "run §6b before T3" instruction sat below the T3 row | Moved to the §6 intro, and the T3 row says "run §6b first" |
| 4 | The dose-voice line was copied into guides whose §6 has no voice | Kept in the elder guide only |
| 5 | With the microphone blocked, *Answer with my voice* may still show | The elder guide says what tapping it shows, as expected behaviour |
| 6 | "First *My day* tap" was too narrow; *Reset demo* also resets text size | "Any tap", and set the text size again |
| 7 | The pharmacy-label check was loose; the shift test set checkOut by hand | The check matches the app's placeholder exactly; the test also checks that the hand-off action checks the caregiver out |

## Results

- `npm test`: 505 passed, 2 to-dos. Each new test was checked to fail when its rule is broken.
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: see the check on PR #13.
