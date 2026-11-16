# Coming Home

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-16 · A short plan for the first days after a hospital stay |
| **Personas** | Sarah (makes the plan), James and Ana (get items as help requests), Maggie (sees the plan) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> — reminders are simulated in the browser |
| **Related stories** | CC-213 Coming Home plan · CC-214 first follow-up visit reminder |
| **Last updated** | 2026-11-16 (Sprint 17) |

</div>

## Overview

**What.** When Maggie is coming home from hospital, Sarah taps **Maggie's coming home**, picks the day and gets four items she can change: **Pick up medicines**, **Book a follow-up visit**, **Get the home ready** and **Stay the first night**. She gives each to someone, and it lands on that person's Help board.

**Why.** The days after a hospital stay are when things slip: a prescription not collected, a follow-up never booked. A short shared plan makes each job someone's.

**Business value.** Readmissions are expensive and frightening. A plan that gets the follow-up visit booked is the most useful thing the circle can do in that week.

## User journey

1. Sarah opens **Coming home** (guardian sidebar) and taps **Maggie's coming home**. The sheet asks *"When is Maggie coming home?"*, two days from today by default.
2. The plan shows the day and *"There's no place here for why Maggie was in hospital. Each person sees only the item you give them."*
3. Each item has **Who has it** (*No one yet, Me, James, Ana*) and a pencil to rename or remove it. **Add an item** gets the health-detail hint before saving.
4. Giving an item to James posts it as a help request for the whole day, seen only by James. He gets *"New help request in Circle Care"*. The item reads *"Given to James, waiting for a yes"*, then *"James has this"*, then *"James did this"*.
5. **First follow-up visit** (CC-214) reads *"Booked: Diabetes follow-up, Fri, Oct 23"* once a doctor visit is on the calendar inside the window (7, 14, 21 or 30 days). Until then: *"Not booked yet. It should be by …"* with **Add it to the calendar**.

## Functional details & business rules

| Rule | Value |
|---|---|
| One active plan | Starting again changes the day of the active plan |
| Item name | 120 characters, health-detail hint before saving |
| Reassigning | Cancels the earlier person's request |
| Unassigned items | The day before (or the day of) coming home, Sarah is told once: *"2 items in Maggie's coming-home plan have no one yet."* |
| Follow-up reminder | Daily from 9:00 AM until a follow-up is booked or the window ends, never in Sarah's quiet hours. Title *"You have a reminder from Circle Care"* |
| Archive | 30 days after the coming-home day it moves to **Past plans**, read only |

## Permissions & privacy

`MATRIX.plan`: read for elder and guardian, write for the guardian. Everyone else sees only the help request for the item given to them, under the item's name. There is no field for a reason, diagnosis or ward.

## Data captured

`ComingHome` (`id, date, by, at, items, followUpDays, remindedUnassigned, followUpReminded, archived`) and `PlanItem` (`id, kind, title, assignee, helpId`). Item names are free text listed in the [data inventory](../../compliance/09-data-inventory.md) and the regulatory memo §2.1. Starting, changing and giving items are written to the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint17.test.ts` | Four starting items, no reason field, rename/add/remove, giving an item makes a help request for that person only, reassigning cancels, state labels, unassigned alert once, follow-up found in the window, daily 9 AM reminder outside quiet hours, stops once booked, archive after 30 days |
| E2E — `sprint17.py` | *Sarah starts a plan, gives Pick up medicines to James, the follow-up shows as booked, James sees only his item* |

## Known limitations & production gaps

- **In production (planned)** reminders need server scheduling and push.
- The plan doesn't yet read hospital discharge papers; that would need the clinical advisor's review.

## Related pages

[Help board](help-board.md) · [Care calendar](care-calendar.md) · [Alerts & notifications](alerts-and-notifications.md)
