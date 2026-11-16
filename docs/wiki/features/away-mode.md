# Away mode

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-21 · Someone in the family covers while Sarah is away |
| **Personas** | Sarah (sets dates, picks who covers, comes back), James (agrees to cover), Maggie (sees who to call and can ask for someone else) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> |
| **Related stories** | CC-229 Away dates and a backup · CC-230 Hand back · CC-231 Who's covering for Maggie |
| **Last updated** | 2026-11-16 (Sprint 20) |

</div>

## Overview

**What.** Sarah picks the days she's away and asks someone in the family to cover. Once they say yes and the first day comes, the alerts Sarah would get that their own role can see go to them, and they take her place in the SOS order. When the dates end, or Sarah taps **I'm back**, everything comes back to her with one summary.

**Why.** Today a holiday or a work trip means Sarah's phone keeps buzzing, or nobody is watching. Away mode makes the hand-off explicit and time-boxed.

**Business value.** It keeps the circle working when the main carer steps away, without widening anyone's access.

## User journey

1. Sarah opens **Away mode** in the menu, picks the first and last day, picks who covers (only family is offered) and taps **Ask James to cover**. Maggie is told who will look after her and until when.
2. James sees **Sarah asked you to cover** at the top of his Help board and answers **I'll cover** or **I can't**. If nobody has said yes the day before, Sarah is reminded to pick someone else.
3. From the first day, Sarah's home says **James is covering until Friday**. James gets the alerts his role can see, marked *Covering for Sarah*, and Sarah's one-off next steps due before the end date.
4. Maggie's home shows **James is covering for Sarah until Friday** in large type, with **Call James**, **Change** and **Read this to me**. **Change** asks Sarah to pick someone else. Maggie's call screen puts James first.
5. When the end date passes, or Sarah taps **I'm back**, alerts go to Sarah again. Any alert James hadn't opened moves to her. James gets a thank-you with a short summary, and Sarah sees **While you were away** on her home, open items first, until she taps **Got it**.

## Functional details & business rules

| Rule | Value |
|---|---|
| Who can cover | Active family members with their own sign-in; never a paid caregiver |
| Dates | First day today or later, up to 60 days; the end date can change while cover runs |
| Alerts that move | Missed doses, missed check-in, late caregiver, SOS steps and overdue call follow-ups, each only if the backup can already read that resource |
| Alerts that stay with Sarah | Approvals, security notices, the evening recap, the coming-home plan and Help board notices |
| SOS order | Sarah's place in the escalation chain is taken by the backup, de-duplicated |
| Hand back | End date passed or **I'm back**; before the first day **Cancel away dates** just tells the backup |
| Lock screen | Generic titles only: "Update from Circle Care", "You have a new request in Circle Care", "You have a reminder from Circle Care", "Circle Care needs your attention" |

## Permissions & privacy

`MATRIX.away` (read: elder, guardian, family; write: guardian). Only Sarah sets or ends away mode, only the person asked answers, and only Maggie asks for someone else; every refusal is audited. Away mode adds no read rights: settings, approvals and the Privacy Center stay with Sarah and Maggie. See footnote 10 of the [permission matrix](../../security/permission-matrix.md).

## Data captured

`Away` (`start, end, backupId, status, startedAt, endedAt, endedEarly, maggieAsked, summaryFor, summarySeenAt`) in `state.aways`, and `awayId`, `coverLink`, `movedToSarah` on the alerts it routed. Listed in the [data inventory](../../compliance/09-data-inventory.md). Setting, answering, starting and ending are in the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint20.test.ts` | Dates and backup rules, family only, answers, the day-before reminder, alert routing within role, SOS order, next steps, hand back on the end date and on I'm back, open alerts moving to Sarah, both summaries, generic titles, Maggie's Change, audit chain |
| E2E — `sprint20.py` | *Sarah sets dates* · *James accepts* · *Maggie sees who covers, calls James first, asks for someone else* · *Sarah comes back and clears her summary* · *James is thanked* · *Maggie's call shows Sarah first again* |
| Accessibility — `a11y.py` | Sarah's and James's Away mode screens |
