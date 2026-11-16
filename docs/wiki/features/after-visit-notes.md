# After-visit notes

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-18 · What the doctor said, and who does what next |
| **Personas** | Whoever went to the visit (writes), Maggie and Sarah (write too), the rest of the circle (reads), each person (gets their next steps) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> — the reminder is simulated in the browser |
| **Related stories** | CC-218 after-visit notes and next steps |
| **Last updated** | 2026-11-16 (Sprint 18) |

</div>

## Overview

**What.** After a visit, whoever went opens it and writes the answer under each question from the [visit questions](visit-questions.md) list, anything else the doctor said, and the **Next steps**. A next step with an owner and a day becomes a task for that person on that day.

**Why.** What the doctor said usually lives in one person's head. Writing it down where the circle can see it, with the follow-ups given to someone, closes the loop the question list opened.

**Business value.** It turns the visit into shared, assigned work, which is the core promise of the circle.

## User journey

1. Open the visit: **Visit notes** (or **Add visit notes**) on a past appointment in Sarah's calendar, **Notes** under **After the visit** on the visit questions page, or the link in the reminder.
2. The screen shows the visit, who went, each question with an answer box (*"What the doctor said"*), and **Anything else the doctor said**. **Save notes**.
3. **Next steps:** type the step, pick **Who** (*You, Maggie, Sarah, James, Ana*) and **When**, then **Add step**. A step that names a medicine, a diagnosis or a dose gets the health-detail hint first, with **Save anyway**.
4. The owner is told *"You have a new task in Circle Care"* and sees the step under **Your next steps** (Sarah's home, Ana's Today, James's Help board, Maggie's home) with **Done**.
5. Everyone else Maggie shares her appointments with reads the notes. Nobody else can change them.
6. If no notes are written two days after the visit, whoever went gets one reminder: *"You have a reminder from Circle Care"*.

## Functional details & business rules

| Rule | Value |
|---|---|
| Which visits | Doctor visits, labs and reviews that have ended. Pharmacy pickups take no notes |
| Who writes | Maggie, Sarah, or the person recorded as taking Maggie |
| Who reads | Anyone who can read appointments; Maggie's paused sharing hides them from family and caregivers |
| Questions in the notes | Everyone who can read the notes sees the questions with them, so whoever went can answer off shift. An item Maggie hid stays with her and Sarah |
| Answer / summary / step length | 1,000 / 2,000 / 120 characters |
| Next step day | Today or later. It shows on that day only for its owner, never in Maggie's daily routines |
| Finishing a step | Its owner, Sarah or Maggie. A finished step can't be removed |
| Reminder | Once, 48 hours after the visit ends, to whoever went (Sarah if nobody was recorded), only for visits in the last 7 days |
| Recent visits | Last 30 days, newest first |

## Permissions & privacy

`MATRIX.visitNotes`: read and write for elder, guardian, family and pro, then limited in `src/data/visitNotes.ts` to appointment access (reading) and to Maggie, Sarah or whoever went (writing). Refused writes are audited. Lock-screen titles are generic; the reminder's text names only the day.

## Data captured

`VisitNotes` (`answers, summary, by, at, updatedBy, updatedAt`) and `NextStep` (`id, text, owner, date, taskId, by, at`) on `Appointment.notes`, plus `Appointment.notesReminded`. Each next step is also a `CareTask` with `recurrence` once, a `date` and the `apptId`. Listed in the [data inventory](../../compliance/09-data-inventory.md) and the regulatory memo §2.1. Saving notes and adding, removing and finishing steps are written to the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint18.test.ts` | 14 tests: nothing before the visit, questions with answer space after it, only Maggie/Sarah/whoever went write (refusals audited), notes hidden while sharing is paused, hidden questions' answers, no notes for pickups, steps become one-off tasks and tell the owner, validation, who may finish, overdue and done steps, the one 2-day reminder with generic text, Sarah gets it when nobody went, no reminders on load, audit chain |
| E2E — `sprint18.py` | *Sarah writes the notes* · *adds next steps, one past the health hint* · *James sees his step, marks it done, reads but can't change the notes* · *Ana reads only* · *Maggie can change them* |
| Accessibility — `a11y.py` | The after-visit notes screen |

## Known limitations & production gaps

- Typed only. Voice visit notes are planned for Release 4.
- **In production (planned)** the reminder needs server scheduling and push.

## Related pages

[Visit questions](visit-questions.md) · [Care calendar](care-calendar.md) · [Medications & tasks](medications-and-tasks.md)
