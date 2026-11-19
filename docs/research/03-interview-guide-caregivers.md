# Interview Guide — Professional Caregivers

Notion story: CC-3 Interview guide: professional caregivers · CC-197 concept tests of the built features
Status: DRAFT v3, updated 2026-11-16 (CC-197). Not yet used with real participants. No interviews have taken place. v3 fixes the gaps the practice round found and adds the family-helper part; a POC round with dummy profiles ran against it ([13](13-poc-research-round.md)).

> Participants come through the CC-1 screener. Family helpers (unpaid relatives who do hands-on care) use this guide too, with the [family-helper part](#family-helpers-in-place-of-2-to-4) in place of §2 to §4. If the caregiver works for an agency and the agency required approval, confirm written approval is on file. Never ask for client names. Session length up to 70 minutes: the sections add up to 66, which leaves about 4 for consent at the start (fieldwork plan §4 step 1). Schedule around shifts and offer evenings. T4 is optional; if time is short, drop it. Run sessions Monday to Saturday, when the demo gives Ana a shift.

## Goals

1. Understand a real shift end to end: arrival, tasks, medicines, documentation, leaving.
2. Measure the **workload** of documentation and communication today (tools, duplicate entry, time spent).
3. Understand how caregivers **prove** work was done (verification) and how they feel about being checked.
4. Understand hand-offs between caregivers and to family/guardians.
5. React to three prototype tasks: shift check-in, giving a dose, and end-of-shift hand-off.
6. React to the everyday features built since October: pills on hand and refills, the family chat, and what the family sees from Maggie's check-ins and Sarah's evening recap.

## Interviewer reminders

- Caregivers may worry this is an evaluation. Say clearly: "We are not checking your work, and your employer will not see what you say."
- Ask about the last shift, not shifts in general.
- No client names, no medicine names, no addresses. Use "[client]", "[med]".
- Respect language preference; offer an interpreter if needed (budget TBD).
- If they describe neglect, abuse or an unsafe situation, for themselves or a client, pause and follow the [safety protocol](10-fieldwork-plan.md#5-safety-protocol-for-disclosures-of-harm-draft-needs-review).
- Run the concept tests on the research phone, never the participant's. After the session, tap *Reset demo* in the presenter sheet so nothing carries over to the next person.
- The demo's medicine names (Metformin, Lisinopril, Vitamin D3, Atorvastatin) belong to the made-up Maggie and are fine in prompts. Never note them as the participant's.

## 1. Warm-up (5 min)

- How long have you been a caregiver? What got you into it?
- What kind of clients do you usually work with?
- What's the best part of the job? The hardest?

## 2. The last shift (12 min)

- Walk me through your last shift from when you arrived at the door.
- How did you know what you needed to do that day?
- What did you write down or record? Where? When — during or after?
- Did anything not go to plan? What did you do, and who did you tell?
- How did you leave things for the next person?

## 3. Workload and tools (10 min) — core

- How many apps, forms or notebooks do you use for one client? Show me if you can (without client details).
- About how many minutes per shift go to writing things down or texting family?
- Is any of that unpaid time (before/after the shift)?
- What do you enter more than once?
- Which messages from family are useful? Which take time without helping?
- If you could get rid of one documentation task, what would it be?

*Probe on numbers:* "Roughly — 5 minutes? 30?" Record their estimate, not ours.

## 4. Verification and trust (10 min) — core

- How does your agency or the family know you arrived on time? (EVV, GPS app, sign-in sheet, text)
- How do you feel about location check-in at the door?
- Has a family ever doubted that something was done? What happened?
- What would make you feel protected rather than watched?
- Who should see your notes? Should some notes go only to the guardian?
- How do you feel about only seeing the client's care plan while you're on shift?

## 5. Medicines (6 min)

- What exactly do you do with medicines — remind, hand over, open containers, administer?
- What happens when the client refuses a dose?
- When a medicine changes, how do you find out? Has that ever gone wrong?

## 6. Concept test — prototype tasks (10 min)

Use `/#/app` → Ana on a phone. Read each task aloud. The demo checks Ana in at 8 AM on its own; if she is already on shift, T1 becomes "Show me how you'd know you're on shift."

**Run §6b straight after T2, before T3.** T3's **Send hand-off and check out** ends Ana's shift, which hides *Pills on hand* and the refill buttons and turns off **Save as a note**, and she can't check in again that day. If T3 has already happened, tap *Reset demo*, sign in as Ana again and re-add her to the chat.

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T1 Check in | "You just arrived at Maggie's. Start your shift." | Finds check-in; reaction to plan unlocking only on shift; manual-reason flow | Checks in unaided |
| T2 Give a dose | "Maggie's morning medicine is due. Record that she took it." Then: "She says no to the evening one." | Order of doses; high-priority callout; recording a refusal | Records taken + refused |
| T3 Hand-off (run §6b first) | "Your shift is over. Leave things for the next person." | Reads the auto-drafted summary; edits or accepts; trust in the draft | Sends hand-off; says whether they'd trust the draft |
| T4 Shift swap (optional) | "You can't make Thursday. Ask someone to cover." | Expects the guardian to approve? | Finds the flow |

After each: "1–5, how easy?" and "Would this save you time or add time compared to today?"

## 6b. Concept test — everyday care built since October (10 min)

Same phone, still as Ana, on shift from T1 and before T3. Before T6, switch to Sarah in the presenter sheet (*Demo mode*), open **Chat**, then **People**, switch Ana on, and switch back to Ana. The demo keeps its data on this phone only, so a second phone wouldn't add her.

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T5 Pills on hand | "One of Maggie's medicines is running low. Which one, and what would you do?" Then: "A new bottle of 30 just arrived." | Finds *Pills on hand* on Today; taps **I asked the pharmacy**; the app then says *asked Fog City Pharmacy for a refill* and *Circle Care doesn't contact pharmacies.*: do they still read it as the app having told the pharmacy? (It only records that Ana asked. The label was reworded in Sprint 25, CC-236, after the dummy POC round.) Finds **New bottle** | Names the low medicine, requests a refill and records the new bottle |
| T6 Family chat | "Let the family know Maggie enjoyed her walk today." Then: "Tell them she took her Metformin 500 mg with breakfast." (Typed; see the reminder on chat voice.) | Reaction to being added by the family; the health-detail check on the second message: **Save as a note**, **Send anyway** or **Edit**; sees only messages from after joining | Sends the first message and makes a choice on the check |
| T7 Check-ins and the recap (concept) | "Maggie can log how she feels, her water and meals, and only Sarah sees it, when Maggie shares. Sarah also gets an evening recap of Maggie's day at 7 PM." | Do they want to see Maggie's check-ins? Why? Would the recap change the texts and calls they get from Sarah? | Not scored; record the answers |

After T5 and T6: "1–5, how easy?" and "Would this save you time or add time compared to today?"

## 7. Wrap-up (3 min)

- What would make you *not* want to use an app like this?
- Would your agency allow it? Who decides?
- Follow-up OK? Confirm incentive.

## Family helpers (in place of §2 to §4)

For a family helper, run §1, then these questions in place of §2 to §4 (the same 32 minutes), then §5 to §7. Before §6, say that Ana in the demo is a paid aide, so they'll be doing her part. Ask about time off work, never about money amounts.

- Walk me through the last time you helped [elder] with a hands-on task: medicines, an injection, a dressing, lifting or a transfer.
- Who showed you how to do it? (a nurse, the aide, a pharmacist, a video, nobody.) How sure were you the first time?
- Is there a task you do that nobody showed you? What would have helped?
- What do you do that the paid aide also does? How do the two of you know who did what today?
- Has a task ever been done twice, or missed, because each of you thought the other had it? What happened?
- When a medicine or the care plan changes, how do you hear? Who tells the aide?
- About how many hours a week do you help? Do you also work? Have you taken time off for it?

## Note-taking template

```
Participant ID:          Date:          Agency / private / both:
Clients per week:        Tools used today:
Documentation time per shift (their estimate):     Unpaid portion:
Duplicate entry examples:
Verification method today:          Feelings about it (quote):
Hand-off method today:
Medicine involvement:
Who showed them each hands-on task (role, never a name):
Family helper only: tasks shared with the aide, and how they know who did what:
Quotes (verbatim, de-identified):
Task results:  T1 __/5  T2 __/5  T3 __/5  T4 __/5   Time saved/added (their view):
Everyday care:  T5 __/5  T6 __/5   Expected the pharmacy to be told? Y/N
T7 answers (check-ins, recap and texts from family):
Surprises / contradicts a hypothesis:
```

## Hypotheses to validate (not findings)

| ID | Hypothesis | Validated if | Invalidated if |
|---|---|---|---|
| H-C1 | Caregivers spend 15+ minutes per shift on documentation and family updates, some of it unpaid. | Median self-estimate ≥15 min across 6+ | Median under 10 min |
| H-C2 | Caregivers re-enter the same information in 2+ places (agency app, family texts, paper). | 4+ of 6 | 2 or fewer |
| H-C3 | Door check-in is acceptable when framed as protection against disputes. | 4+ of 6 accept it | Most see it as surveillance |
| H-C4 | An auto-drafted hand-off would be trusted after review and save time. | 4+ of 6 would send with minor edits | Most would rewrite from scratch |
| H-C5 | Shift-limited access to the care plan is acceptable to caregivers. | 4+ of 6 | Most say they need off-shift access (record why) |
| H-C6 | Agency software already covers EVV, so Circle Care must coexist rather than replace it. | Agency caregivers describe mandatory EVV tools | Few use EVV |
| H-C7 | Caregivers would record pill counts and request refills in the app if it saves a call or a text. | 4+ of 6 complete T5 and say they'd use it | Most say it adds work |
| H-C8 | Caregivers understand that **I asked the pharmacy** records the request and doesn't contact the pharmacy. Correct means: "it notes that I asked the pharmacy myself; Circle Care doesn't contact it." | 4+ of 6 explain it correctly after T5 | Most expect the app to have told the pharmacy (the Sprint 25 wording needs another change) |
| H-C9 | Caregivers accept joining the family chat only when the family adds them. | 4+ of 6 | Most expect to be in it from the start, or not at all |
| H-C10 | The health-detail check in the chat feels helpful, not like being policed. | 4+ of 6 | Most find it intrusive |
| H-C11 | Sarah's evening recap would cut the check-up texts caregivers get from family. | Half or more of those asked T7 expect fewer | Most expect no change |
| H-C12 | Family helpers do at least one hands-on medical task that nobody showed them how to do. | Both family helpers name one | Neither does |
| H-C13 | When a family helper and a paid aide share tasks, some get done twice or missed because nobody records who did what. | Both family helpers describe a doubled or missed task | Neither does |
