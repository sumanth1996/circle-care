# Code review — Sprint 14, CC-197: Update the research kit for the built features

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` ([PR #13](https://github.com/sumanth1996/circle-care/pull/13)) |
| Approver | **Lead Architect Agent** (independent AI review agent, checked against the prototype's screens) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-197 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | Round 1 pending |

## What changed

- The screener (`docs/research/01-recruiting-screener.md`) is draft v2. It says what is kept from screening, and the consent outline now says that no health details are asked for or recorded beyond what a participant chooses to share, how notes are stored, and when recordings, the name-to-number list and notes are deleted. It also explains the practice app: made-up people, a research phone, and a reset after every session.
- The human steps before fieldwork now name recruiting, incentives, consent review, the safety protocol, agency approvals, the interpreter budget and the research phone.
- Each interview guide (02 elders, 03 caregivers, 04 guardians) is draft v2 with a second concept test of the features built since October:
  - Elders: *My day* check-ins, keeping them private, the family chat, and what Sarah sees in her evening recap and refill notes.
  - Caregivers: pills on hand and refills, joining the family chat and its health-detail check, and what they think of the check-ins and recap.
  - Guardians: the evening recap, a low supply, the 7-day check-ins and the family chat.
- New hypotheses: H-E7 to H-E10, H-C7 to H-C11 and H-G8 to H-G11, including whether people think **Request refill** contacts the pharmacy (it only records the request).
- Every guide asks participants to type in the chat, not speak, until CC-222 makes the chat's voice reply stay on the device.
- `src/__tests__/research-kit.test.ts` (8 tests) checks the draft markings, that each guide covers chat, check-ins, refills and the recap, that every label and presenter control a guide quotes exists in the app, the chat voice reminder against the code, the consent wording, the human steps, that there are no real contact details, and hypothesis numbering.

## Results

- `npm test`: 502 passed, 2 to-dos. Each new test was checked to fail when its rule is broken.
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: see the check on PR #13.
