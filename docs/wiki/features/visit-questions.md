# Visit questions

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-17 · A shared list of questions for Maggie's next doctor visit |
| **Personas** | Sarah (orders and prints), Maggie (adds, hides), James and Ana on shift (add) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> |
| **Related stories** | CC-217 shared question list for a visit |
| **Last updated** | 2026-11-16 (Sprint 17) |

</div>

## Overview

**What.** Each upcoming visit has a list: **Questions for the doctor**. Anyone who can see Maggie's visits adds a question or something they noticed, and everyone sees who added what. Sarah sets the order and prints one page in large type to take in.

**Why.** Things noticed during the week are forgotten by the appointment. A shared list collects them in one place.

**Business value.** Better-prepared visits are a clear, everyday reason for the whole circle to use the app.

## User journey

1. Open **Visit questions** (guardian sidebar, caregiver **More**, family **Questions**, Maggie's home link **Questions for the doctor**), or **Questions (n)** under an appointment in the calendar.
2. Pick the **Visit**. Until someone changes the list, the appointment's prep note shows as the first item, like *"Bring the glucose log."*
3. Type in **Add a question or something you noticed** and tap **Add**. A medicine, diagnosis or dose brings the health-detail hint with **Add anyway**.
4. Maggie can **Hide** an item: *"Only Maggie and Sarah see this."* Sarah uses **Move up** and **Move down**. The author or Sarah can remove an item.
5. **Print** opens one page with Sarah's order. Items Maggie hid are left off unless Sarah turns on **Include items Maggie hid**.

## Functional details & business rules

| Rule | Value |
|---|---|
| Question length | 280 characters |
| Who sees the list | Needs both questions and appointments read. Ana only while on shift |
| Hidden items | Seen only by Maggie and Sarah, and can't be removed by others |
| Print | Sarah and Maggie |

## Permissions & privacy

`MATRIX.questions`: read and write for elder, guardian, family and pro on shift. Paused sharing hides it from family and pro.

## Data captured

`VisitQuestion` (`id, by, at, text, hidden`) on `Appointment.questions`. Listed in the [data inventory](../../compliance/09-data-inventory.md) and the regulatory memo §2.1. Adding, hiding, moving and removing are written to the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint17.test.ts` | Prep note first, add with author, hide for Maggie and Sarah only, Sarah's order, remove rules, print with and without hidden items, Ana on shift only, audit |
| E2E — `sprint17.py` | *Sarah adds a question past the health hint, James adds one, Maggie hides it, James no longer sees it, Sarah prints with and without it* |

## Related pages

[Care calendar](care-calendar.md) · [Privacy Center](privacy-center.md) · [Help board](help-board.md)
