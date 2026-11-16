# Confident at home

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-22 · Quiet days, memory aids and scam help |
| **Personas** | Maggie (rests, reads notes, asks "Is this a scam?", learns a tip a week), Sarah (writes notes, answers scam checks), James (writes notes), Ana (reads notes on shift) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> |
| **Related stories** | CC-129 Quiet days · CC-138 Family writes a memory aid · CC-139 Memory aids shown and read aloud · CC-132 Report a possible scam · CC-133 Guardian responds · CC-134 Weekly scam-awareness tip |
| **Last updated** | 2026-11-16 (Sprint 22) |

</div>

## Overview

**What.** Three small things that help Maggie feel in charge at home. She can say she's resting or away so a missed check-in doesn't alarm anyone. Her family can leave short notes on her home ("Your keys are in the blue bowl"), shown large and read aloud once. And when a call, text or visitor feels wrong, one tap tells Sarah, who works through a checklist and tells Maggie she's safe. A weekly tip teaches the common tricks.

**Why.** Older adults lose more money to scams than any other group, and a missed check-in on a lazy Sunday shouldn't trigger a worried call. Families also repeat the same reminders by phone every day.

**Business value.** Fewer false alarms, a reason to open Circle Care every day, and a concrete safety story families can explain to each other.

## User journey

1. Maggie taps **Resting today** or **Away until…** (up to 14 days) on her home. Sarah's home shows **Maggie is resting today** or **Maggie is away until Fri, Dec 11** instead of a missed check-in alert. **I'm back** turns check-ins on again from her next window, and both show in the activity history.
2. Sarah or James opens **Memory aids** and writes a note of up to 140 characters, always on Maggie's home or once at a date and time, with an optional photo. A note that looks like a PIN, door code or password is refused.
3. Maggie's home shows the note large, reads it aloud once, and offers **Read again** and **Got it**. The writer sees **Seen at 3:02 PM**. With more than 3 always notes, **More notes** shows the next 3. Maggie can turn any note off in **Settings**.
4. Maggie taps **Is this a scam?**, picks Phone call, Text message, Email, Someone at the door or Payment request, and can add a short note or photo. She sees **Don't send money or share codes. Sarah has been told.** with **Call Sarah**. With no guardian, she's told to hang up and call someone she trusts.
5. Sarah gets an urgent in-app alert (even in quiet hours), opens the report, taps **Call Maggie**, works through the checklist (call the bank, freeze the card, change shared codes, report it to the FTC or the state attorney general) and taps **Mark resolved**. Maggie sees **Sarah checked this. You're safe.** or Sarah's note.
6. From Monday 8 AM in Maggie's time zone, her home shows one tip with a made-up example. **Got it** moves the progress on ("1 of 12 tips"); **Not now** brings it back the next day, at most twice.

## Functional details & business rules

| Rule | Value |
|---|---|
| Quiet days pause | Missed check-in prompt, Sarah's missed check-in alert, 7 PM nothing-logged reminder, no-meals note |
| Never paused | Medicine reminders and escalations, SOS, late-caregiver alerts |
| Away limit | Today up to 14 days ahead; no reason asked or kept |
| Note length | 140 characters; refused if it looks like a PIN, door code or password |
| Rotation | 3 always notes at a time; once notes show from their time until the end of that day |
| Read aloud | Once, the first time a note shows; silent when read-aloud is off |
| Scam alert | Generic title; detail names only the kind of contact, never the note |
| Scam photo | Kept on the device, encrypted; deleted 30 days after the report is resolved |
| Tips | 12, written for Circle Care, with invented names and numbers; no real company named as a scammer |

## Permissions & privacy

`MATRIX.quietDays` (read: elder, guardian, family; write: elder). `MATRIX.memoryAids` (read: elder, guardian, family, caregiver on shift; write: guardian, family). `MATRIX.scams` (read: elder, guardian; write: elder; respond: guardian). `MATRIX.tips` (elder only). The scam note and photo never reach family or caregivers and are never written to the access log. See footnotes 11 to 13 of the [permission matrix](../../security/permission-matrix.md).

## Data captured

`QuietDay` in `state.quietDays`, `MemoryAid` in `state.memoryAids`, `ScamReport` in `state.scams`, `ScamTips` in `state.scamTips`, and photo ids waiting to be deleted in `state.filesToDelete`. Photos are square, re-encoded (which strips their location data) and stored encrypted on the device. Listed in the [data inventory](../../compliance/09-data-inventory.md).

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint22.test.ts` | What quiet days pause and never pause, the 14-day limit, I'm back from the next window, the activity history; note length, code detection, writer-only edits, Maggie-only switch-off, caregiver read-only on shift, once and always timing, read aloud once, rotation; scam alert and its wording, quiet hours, no guardian, nothing in the audit log, shared checklist, resolve with and without a note, 30-day photo deletion; tip timing, Not now twice, Got it progress, 12 tips with no real company |
| E2E — `sprint22.py` | *Resting today and Away until for Sarah* · *A door-code note is refused* · *Ana reads only* · *Read aloud once, Read again, Got it, Seen at* · *Turn a note off; read-aloud off is silent* · *Is this a scam? with Call Sarah* · *Sarah's alert without the note* · *Checklist and Mark resolved* · *Weekly tip, Not now, Got it* |
| Accessibility — `a11y.py`, `sprint22.py` | Scam check, memory aids for Sarah, James and Ana; axe, 44 px targets and 200% zoom on Maggie's cards |
