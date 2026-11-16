# Help board

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-15 · Help requests the circle can pick up |
| **Personas** | Sarah (posts and manages requests), James and Ana (pick them up), Maggie (sees everything) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> — alerts and "first claim wins" are simulated in the browser |
| **Related stories** | CC-209 post a help request to the circle · CC-210 claim and finish a help request |
| **Last updated** | 2026-11-16 (Sprint 16) |

</div>

## Overview

**What.** Sarah posts the everyday help Maggie needs: **a ride, groceries, company, a visit or something else**, with a date, a time and an optional note. She picks who sees it. Anyone she picked taps **I'll do it**, and everyone sees who has it. When it's done it moves to **Done** and counts in **Who helped this week**.

**Why.** Family care runs on group texts that get lost, and the same person ends up doing everything. A shared board makes the asks visible and makes it easy for others to step in.

**Business value.** Sharing the load keeps the main caregiver going and gives the wider circle a reason to open the app every week.

## User journey

### Post a request (Sarah, CC-209)

1. Sarah opens **Help board** (guardian sidebar, or **More** for Ana) and taps **New request**.
2. She picks **What** (*A ride, Groceries, Company, A visit, Something else*). *Something else* needs a note.
3. **Tied to an appointment?** lists upcoming appointments. Picking one sets the date, and for a ride the time 30 minutes before. *"Shows as an appointment only. The doctor and the reason stay hidden from the circle."*
4. **Who can see it:** *Everyone in the circle*, *Family only* or *Choose people*. The line under it reads *"James will see it, and Maggie."*
5. **Post.** If the note names a medicine, a diagnosis or a dose, the same health-detail hint as family chat appears, with **Post anyway** and **Edit**.

### Pick it up (James, Ana, CC-210)

6. Each person picked gets *"New help request in Circle Care"*. James's home is the Help board.
7. **Open** cards show **I'll do it**. The first tap wins; anyone tapping at the same moment sees *"James already has this"*.
8. **Taken** cards show *"You have this"* with **Mark done** and **Can't anymore** (which reopens it, after a confirm).
9. An hour after the time, the person who has it is asked once **Did this happen?** with **Yes** and **Not yet**.
10. **Done** lists finished requests for 30 days. **Who helped this week** lists names A to Z with what each did. *"Nobody is ranked."*

## Functional details & business rules

| Rule | Value |
|---|---|
| Note length | 280 characters |
| Who can be picked | Active members whose role may read help requests, other than Maggie and Sarah. Maggie and Sarah always see every request |
| First claim wins | Each request carries a revision number. A claim from a screen showing an older revision fails and shows who has it |
| Unclaimed notice | Still open 24 hours before it's due, and posted more than 24 hours ahead: Sarah is told once, with **Post again** on the card or **I'll do it myself** |
| Did this happen? | Claimed and 60 minutes past its time: asked once. **Not yet** puts it away |
| Board retention | Open and taken stay; done stays 30 days after it's closed; cancelled leaves at once |
| History | Maggie and Sarah see every request, including cancelled and older ones |

## Permissions & privacy

`MATRIX.help` in `src/data/policy.ts`: read for elder, guardian, family and pro; write (post, post again, cancel) for the guardian; respond (claim, give back, finish) for guardian, family and pro. Only people in a request's audience see it.

| Viewer | Request tied to an appointment shows |
|---|---|
| Maggie, Sarah | *Ride for Cholesterol panel*, with the place |
| Someone with appointment access | *Ride to an appointment*. The place shows only to the person who has it |
| Someone without appointment access | *Appointment* and the time only, no note |

While Maggie has **paused sharing**, family and paid caregivers see no requests, can't claim and get no alerts. Sarah can still post; requests wait on the board until sharing is back on.

## Notifications

| Event | To | Lock-screen title | In the app |
|---|---|---|---|
| Posted / posted again | The people picked | New help request in Circle Care | *Sarah asked for help: Ride, Thu, Oct 22 at 9:00 AM.* |
| Claimed | Sarah | Update from Circle Care | *James has this: Ride, …* |
| Given back | Sarah | Update from Circle Care | *James can't do this anymore, so it's open again: …* |
| Finished | Sarah | Update from Circle Care | *James finished: …* |
| Still unclaimed | Sarah | Update from Circle Care | *No one has picked up ride, …. Post it again or do it yourself.* |
| Cancelled | Whoever had it | Update from Circle Care | *Sarah cancelled a help request you had: …* |
| Did this happen? | Whoever has it | Update from Circle Care | *Did this happen? …* |

No alert names an appointment's reason or clinic.

## Accessibility

Kind choice is a radio group, audience is a labelled button group, each card is an `article` named by its title, and *Did this happen?* is a labelled group. Pages are in the axe audit (`a11y.py`).

## Data captured

`HelpRequest` (`id, kind, note, date, time, appointmentId, audience, by, at, status, claimedBy, claimedAt, doneBy, closedAt, rev, remindedUnclaimed, askedDone, notYet, history`) and `HelpChange` (`at, by, change`). Classified in `src/data/classification.ts` and listed in the [data inventory](../../compliance/09-data-inventory.md). Posting, claiming, giving back, finishing and cancelling are written to the access log.

## Edge cases & error states

- Two claims on the same revision: the second fails and shows who has it.
- Cancelling a taken request tells the person who had it.
- Only the person who has it can mark it done or give it back.
- A request posted less than a day ahead never gets the unclaimed notice.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `help-board.test.ts` | 20 tests: alerts to the audience only, masked appointment view, health hint, unclaimed notice, cancel, paused sharing, 30-day board and history, audit chain, claim tells Sarah, first claim wins, give back, done and Who helped this week, Did this happen? once, demo seed |
| E2E — `help.py` | *Health hint before posting* · *Sarah posts a visit for family only* · *James gets the alert, takes it and marks it done* · *Sarah is told* · *Ana sees the ride as an appointment only, takes it and gives it back* |

## Known limitations & production gaps

- **In the prototype** alerts and "first claim wins" run in one browser. **In production (planned)** claims need a server transaction and real push delivery.
- Chat alerts still don't go to James.

## Related pages

[Care circle & access](care-circle-and-access.md) · [Alerts & notifications](alerts-and-notifications.md) · [Care calendar](care-calendar.md) · [Privacy Center](privacy-center.md)
