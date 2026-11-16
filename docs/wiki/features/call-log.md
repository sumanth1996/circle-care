# Call log

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-19 · Calls with insurers, pharmacies and agencies, so nobody has to call twice |
| **Personas** | Sarah and Maggie (write), the rest of the circle (reads what Maggie allows), each step's owner (gets a task) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> — reminders are simulated in the browser |
| **Related stories** | CC-226 log a call · CC-227 next step becomes a task · CC-228 filter by organization |
| **Last updated** | 2026-11-16 (Sprint 19) |

</div>

## Overview

**What.** Sarah or Maggie writes down each call about Maggie's care: the organization, the day, who they spoke with, what was agreed, the reference number and the next step. Everyone in the circle who can see the log sees who was called, when, and the next step. What was said stays with Maggie and Sarah unless Maggie shares her **Insurance and admin details**.

**Why.** Calls to insurers and pharmacies are long, repeat themselves and live in one person's notebook. A shared log with a reference number means the next person who calls starts where the last one stopped.

**Business value.** It takes on the admin work that wears family caregivers down, without spreading Maggie's insurance details further than she wants.

## User journey

1. **Call log** in the menu (Sarah, James, Ana), or **Calls about my care** on Maggie's home.
2. **Log a call** (Maggie: **Write down a call**): Organization, Date of the call, Spoke with, What they agreed, Reference number and an optional Next step with **Who** and **By when**. **Save call**. Text that names a medicine, a diagnosis or a dose gets the health-detail hint first, with **Save anyway**.
3. In the list, a reference shows its last 4 only. Maggie and Sarah tap **Show** to see it in full; each reveal is in the access history.
4. A next step becomes a task for its owner on that day, with *"You have a new task in Circle Care"*, a reminder the day before and **From the call log** under **Your next steps**. If it's past its day, Sarah hears once after 8 AM.
5. **Filter by organization** narrows the log, by typing or by tapping an organization. *"No calls with this organization yet"* when nothing matches.
6. In her Privacy Center, Maggie picks who else sees **Insurance and admin details**.

## Functional details & business rules

| Rule | Value |
|---|---|
| Who writes | Maggie and Sarah. Anyone else is refused and the refusal audited |
| Who reads | Maggie, Sarah, James, and Ana during her shift. Paused sharing hides it from family and caregivers |
| Insurance and admin details | Who was spoken with and what was agreed. Only Maggie, Sarah and the people Maggie picks (`settings.adminTo`) |
| Reference numbers | Shown as the last 4; only Maggie and Sarah can show one in full |
| Lengths | Organization and contact 80, outcome 1,000, reference 40, step 120 characters |
| Dates | A call can't be in the future; a step is today or later |
| Next step task | Titled "Organization: step", never the reference number. A done step stays as it was when the call changes |
| Alerts | Generic lock-screen titles; one reminder the day before; one overdue notice to Sarah |

## Permissions & privacy

`MATRIX.calls` (read: elder, guardian, family, pro on shift; write: elder, guardian), `calls.admin` (with `settings.adminTo` for family and caregivers) and `calls.ref` (elder, guardian). Logic in `src/data/callLog.ts`.

## Data captured

`CallEntry` (`org, date, contact, outcome, ref, nextStep, by, at, updatedBy, updatedAt`) and `CallStep` (`text, owner, date, taskId`) in `state.calls`, `CareTask.callId`, and `Settings.adminTo`. Listed in the [data inventory](../../compliance/09-data-inventory.md) and the regulatory memo §2.1. Adding, changing, removing a call and revealing a reference are in the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint19.test.ts` | Who writes and reads, admin details only by Maggie's choice, masked and revealed references, validation, steps become tasks and tell the owner, reminders and overdue notice, done steps kept, filters, paused sharing, audit |
| E2E — `sprint19.py` | *Sarah logs a call* · *filters by organization* · *James gets the step and sees only who, when and the step* · *Ana on shift sees no admin details* · *Maggie shares admin details with James* |
| Accessibility — `a11y.py` | Sarah's and Maggie's call log |
