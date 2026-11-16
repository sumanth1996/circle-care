# Interview Guide — Legal Guardians and Healthcare POA Holders

Notion story: CC-4 Interview guide: legal guardians · CC-197 concept tests of the built features
Status: DRAFT v2, updated 2026-11-15 (CC-197). Not yet piloted or used. No interviews have taken place.

> Participants come through the CC-1 screener. Do not ask to see legal documents. Do not ask for the elder's name or diagnoses. Session up to 70 minutes (if time is short, drop T5 and T4); many guardians work full time, so offer evenings and weekends.

## Goals

1. Understand how the guardian knows, day to day, whether the elder is OK.
2. Measure the **workload**: calls, texts, apps, time off work, coordination with caregivers and family.
3. Understand how they **verify** that care actually happened (doses, visits) and how much they trust what they hear.
4. Understand decision-making: what they approve, how they involve the elder, and where they feel the tension between protecting and respecting autonomy.
5. Learn what proving legal authority has been like (with hospitals, pharmacies, agencies).
6. React to prototype tasks: today at a glance, approvals, SOS response, and the weekly digest.
7. React to the everyday features built since October: the evening recap, refill alerts, Maggie's daily check-ins and the family chat.

## Interviewer reminders

- Guardians often carry guilt and stress. Be warm; allow pauses. Do not offer advice.
- Ask about the last week, specific events.
- If they mention a crisis that is ongoing, check they're OK to continue.
- If they describe neglect, abuse, exploitation or an unsafe situation, pause and follow the [safety protocol](10-fieldwork-plan.md#5-safety-protocol-for-disclosures-of-harm-draft-needs-review).
- Run the concept tests on the research phone, never the participant's. After the session, tap *Reset demo* in the presenter sheet so nothing carries over to the next person.
- Chat voice: before the session, block the microphone for the prototype site in the research phone's browser (screener §9), so the chat opens its typing box instead of listening. In Chrome and most browsers the chat's voice reply sends speech to an online service, though the screen says it stays on the device (CC-222), and one tap starts it listening to the whole room. Ask what they expect happens to their words if they spoke. Remove this line once CC-222 is done.
- The demo's medicine names (Metformin, Lisinopril, Vitamin D3, Atorvastatin) belong to the made-up Maggie and are fine in prompts. Never note them as the participant's.

## 1. Warm-up (5 min)

- Tell me a bit about yourself and the person you care for (relationship, no names).
- How did you become their POA / guardian?
- Who else is involved in their care?

## 2. Knowing they're OK (10 min)

- How did you know yesterday that they were OK? Walk me through it.
- How many times in a typical day do you call, text or check something?
- Tell me about the last time you *didn't* know and worried. What did you do?
- What are you most afraid of missing?

## 3. Workload (8 min) — core

- What tools do you use to coordinate? (group texts, calendar, notebook, agency portal, spreadsheet)
- How much time per week goes to coordinating care? Any time off work?
- Who do you have to chase for information?
- What falls through the cracks?

## 4. Verification and trust (8 min) — core

- How do you know a medicine was actually taken? A visit actually happened?
- Has there been a time you found out something hadn't been done? How did you find out, and how long later?
- What proof would be enough without making the caregiver feel watched?
- How do you want to hear about a missed dose — immediately, after a delay, only if the caregiver doesn't fix it?

## 5. Decisions and autonomy (10 min) — core

- What kinds of decisions do you make for them? Which do they still make?
- Tell me about a recent decision. How did you involve them?
- Has there been a disagreement between what you thought was safe and what they wanted? What happened?
- If they wanted to stop sharing information with family or the aide for a while, how would you feel? Should that apply to you?
- Should they be told about every decision you make? Why or why not?

## 6. Proving authority (4 min)

- When have you had to show your POA or guardianship papers? How did that go?
- How long would you accept waiting for an app to verify your documents before you get guardian access?

## 7. Concept test — prototype tasks (12 min)

Use `/#/app` → Sarah. Use presenter controls to set up scenarios before each task (e.g., *Simulate a missed dose*).

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T1 Today at a glance | "It's 11am. Is Mom OK today?" | Time to answer; which signals they trust | Answers correctly in under 30 seconds |
| T2 Missed dose | (After *Simulate a missed dose*) "Something needs your attention." | Finds the flag; understands escalation order (caregiver first) | Identifies the issue and a next action |
| T3 Approval | "Ana has asked for a change. Decide." | Reads detail; wants to ask Mom first?; notices the elder is notified | Approves or declines with a note |
| T4 SOS response | (After Maggie presses SOS) "Respond." | Finds "I'm on my way"; expectations about calling 911 | Acknowledges SOS |
| T5 Weekly digest | "Your brother wants a summary of the week." | Would they forward it? Is anything missing or too much? | Explains what's in it |

After each: "1–5, how easy?" and "Would this replace something you do today? What?"

## 7b. Concept test — everyday care built since October (10 min)

Same phone, still as Sarah. Use the presenter controls named in each task.

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T6 Evening recap | (After *Skip to 7 PM for the evening recap*; the card already shows after 6 PM) "It's evening. How did Mom's day go?" | Reads the headline first? With the demo data it isn't a calm day: expect *a look* at a dose or *One refill to sort out.* Does the headline match what they then find? Finds **See the week**; reaction to the 7 PM update and the switch to turn it off | Sums up the day correctly in own words |
| T7 Running low | (After *Simulate low Metformin supply*) "Something about Mom's medicines needs sorting." | Finds it under *Needs your attention* (Atorvastatin is already low in the demo, so two medicines show); taps **Request refill**; the app then says *asked Fog City Pharmacy for a refill*: do they read that as the app having told the pharmacy? (It only records that Sarah asked.) Notices the Calendar refill entry | Requests a refill for either medicine and says roughly when it runs out |
| T8 How she's been feeling | "How has Mom been feeling this week?" Then, after *Simulate 2 days with no meals logged*: "What do you make of this?" | Finds *Daily check-ins · 7 days* under Health; reaction to Mom deciding whether it's shared; finds the gentle note about meals in the alerts (it links to Health) | Finds the week view and says what they'd do about the note |
| T9 Family chat | "Tell James that Mom's Lisinopril went up to 20 mg." (Typed; see the reminder on chat voice.) Then: "Would you add Ana to this chat?" | Reaction to the health-detail check: **Save as a note**, **Send anyway** or **Edit**; finds **People**; who they'd add and why | Makes a choice on the check and finds where to add Ana |

After each: "1–5, how easy?" and "Would this replace something you do today? What?"

## 8. Wrap-up (3 min)

- What would stop you from inviting the whole family and the caregiver into an app like this?
- What would you pay, if anything? Who pays today for care tools?
- Follow-up OK? Confirm incentive.

## Note-taking template

```
Participant ID:          Date:          POA / court guardian:        Distance:
Others involved (roles):
Daily check behavior (count/estimate):
Tools used today:            Coordination time per week (their estimate):
Last "didn't know" moment (summary):
Verification methods today:
Autonomy tension example (summary, de-identified):
Authority-proof experience:
Quotes (verbatim, de-identified):
Task results:  T1 __/5 (secs __)  T2 __/5  T3 __/5  T4 __/5  T5 __/5
Everyday care:  T6 __/5  T7 __/5  T8 __/5  T9 __/5   Expected the pharmacy to be told? Y/N
Willingness to pay / who pays:
Surprises / contradicts a hypothesis:
```

## Hypotheses to validate (not findings)

| ID | Hypothesis | Validated if | Invalidated if |
|---|---|---|---|
| H-G1 | Guardians check on the elder 3+ times a day by phone or text. | Median ≥3 across 5+ | Median ≤1 |
| H-G2 | Guardians discover missed care hours or days later, not in the moment. | 3+ of 5 describe a late discovery | Most say they find out immediately |
| H-G3 | Guardians prefer escalation that gives the caregiver a chance to fix it first (CC-42 timers: caregiver at 30 min, guardian at 60 min). | 3+ of 5 | Most want immediate guardian alerts |
| H-G4 | Guardians accept a 1–2 business-day document review before guardian permissions apply. | 3+ of 5 | Most reject any wait |
| H-G5 | Guardians are willing for the elder to see every decision made about her care. | 3+ of 5 | Most want some decisions hidden (record which and why) |
| H-G6 | A weekly digest would reduce sibling/family update calls. | 3+ of 5 | Most say family would still call |
| H-G7 | "Today at a glance" answers "is Mom OK?" in under 30 seconds. | T1 success for 4+ of 5 | 2 or fewer |
| H-G8 | The evening recap answers "how was her day?" without opening other screens. | T6 success for 4+ of 5 | 2 or fewer |
| H-G9 | Guardians understand that **Request refill** records the request and doesn't contact the pharmacy. Correct means: "it notes that I asked the pharmacy myself; Circle Care doesn't contact it." | 3+ of 5 explain it correctly after T7 | Most expect the app to have told the pharmacy (the label or the confirmation needs to change) |
| H-G10 | Guardians accept that Mom decides whether they see her daily check-ins. | 3+ of 5 | Most want to see them whatever she chooses |
| H-G11 | The health-detail check in the chat feels helpful, not in the way. | Most of those who did T9 (3+ of 5 if all did) | Most find it gets in the way |
