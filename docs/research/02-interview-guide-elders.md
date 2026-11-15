# Interview Guide — Elders

Notion story: CC-2 Interview guide: elders · CC-197 concept tests of the built features
Status: DRAFT v2, updated 2026-11-15 (CC-197). Not yet piloted or used. No interviews have taken place.

> Participants come through the CC-1 screener. Only interview people who can give their own consent. Session length up to 70 minutes: §1 to §6 take about 54, §6b 10 and the wrap-up 3. Offer breaks. If the session reaches 55 minutes before §6b, or the person tires, move §6b to the 15-minute follow-up.

## Goals

1. Understand a typical day: what help arrives, from whom, and how the person feels about it.
2. Learn how medicines are managed today and where it goes wrong.
3. Understand what **independence, dignity and control** mean to this person in concrete terms — what they would and would not want others to know.
4. Learn what they do when something goes wrong (a fall, feeling unwell, a missed visit).
5. React to three prototype tasks: the three-button home, confirming a dose, and the Privacy Center.
6. React to the everyday features built since October: the *My day* check-ins, the family chat, and what Sarah sees in her evening recap and refill alerts.

## Interviewer reminders

- Sit at eye level, face the person, speak clearly but do not talk down. Use their preferred name.
- Ask about **past behavior**, not hypotheticals ("Tell me about the last time…").
- Do not correct or teach. If they struggle with the prototype, that is data.
- If they mention a diagnosis or medicine name, do not write it down; note "[condition]" / "[med]".
- If they disclose risk of harm (neglect, abuse, an unsafe situation), pause the interview and follow the safety protocol agreed with the research lead **before** fieldwork starts (human action: write this protocol).
- Run the concept tests on the research phone, never the participant's. After the session, tap *Reset demo* in the presenter sheet so nothing carries over to the next person.
- Chat voice: before the session, block the microphone for the prototype site in the research phone's browser (screener §9), so the chat opens its typing box instead of listening. In Chrome and most browsers the chat's voice reply sends speech to an online service, though the screen says it stays on the device (CC-222), and one tap starts it listening to the whole room. Ask what they expect happens to their words if they spoke. Remove this line once CC-222 is done.
- The dose voice in §6 T2 runs only on the device, so it is safe. Where the browser can't do that, tapping *Answer with my voice* says voice answers aren't available on this device; with the microphone blocked, tapping it shows *Voice isn't working right now. Please tap a button instead.* Both are expected: note them under T2's "tries voice?".
- The demo's medicine names (Metformin, Lisinopril, Vitamin D3, Atorvastatin) belong to the made-up Maggie and are fine in prompts. Never note them as the participant's.

## 1. Warm-up (5 min)

- Thank you for having me. How long have you lived here?
- What does a good day look like for you?
- Who are the people you see or talk to most in a week?

## 2. Daily life and help (10 min)

- Walk me through yesterday from when you woke up.
- Who helps you with anything? What do they help with?
- How did that help start? Whose idea was it?
- What do you still do entirely on your own that matters to you?
- Is there anything people help with that you'd rather do yourself?

## 3. Medicines (8 min)

- How do you keep track of your medicines today? (pill box, alarm, someone reminds you)
- Tell me about the last time a dose was missed or taken twice. What happened? Who found out?
- When someone reminds you about medicine, how does it feel? Does it depend on who reminds you?
- If you decide to skip a dose on purpose, who should know? Who should not?

## 4. Independence, dignity and control (12 min) — core

- When your daughter/son or a caregiver checks on you, how does that feel?
- Has anyone ever known something about you that you wish they hadn't? How did they find out?
- If you could decide exactly who sees what — medicines, notes from the aide, your appointments — how would you split it?
- Is there anything you'd want **only** your [guardian/daughter] to see, and not the aide? Anything the other way around?
- If you could switch off everyone's view for a while, would you ever use that? When?
- Has anyone ever made a decision about your care without asking you? Tell me about it.
- What would make you feel "checked up on" versus "looked after"?

*Probe:* "You said ___. Can you tell me more about that?" / "What made that feel that way?"

## 5. When something goes wrong (7 min)

- Tell me about the last time you needed help quickly. What did you do?
- Do you have a button, pendant or phone setting for emergencies? Do you wear/use it? Why or why not?
- Who do you want called first? Does that change at night?
- How do you feel about a daily "I'm OK" tap each morning? (Ask *after* exploring how people check on them today.)

## 6. Concept test — prototype tasks (12 min)

Use the prototype at `/#/app` → Maggie, on a phone held by the participant. Set text size to their preference first. Read each task aloud; do not demonstrate.

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T1 Three-button home | "This is a phone app. What do you think you can do here?" | Does the person read all three buttons? Do they fear pressing SOS by accident? | Names at least 2 of the 3 actions without help |
| T2 Confirm a dose | "It's time for your morning tablet. Show me how you'd tell the app you took it." Then: "Now imagine you decided not to take it." | Finds "What's next"; finds taken/skipped/refused; reaction to the word "refused"; tries voice? | Records "taken" and a non-taken status unaided |
| T3 Privacy Center | "You'd like to see who can look at your information." Then: "Now you want a break from sharing." | Understands the list of people; reaction to the access log; finds Pause sharing; understands SOS still works | Finds the list and pause switch; explains in own words what pause does |
| T4 Hold SOS (optional) | "Show me what you'd do if you fell and needed help." | Is the 2-second hold discoverable? Is the 10-second cancel reassuring or stressful? | Starts SOS and cancels unaided |

After each task: "On a scale of 1 to 5, how easy was that?" and "What would you change?"

Close the concept test with: "Who in your life would you want in a circle like this? Who would you leave out?"

Before §6b, turn *Pause sharing* back off: T3 leaves it on. Any *My day* tap while sharing is paused makes that day private, so T5's footer and T8's *Her day* would show it as private. If that happens, tap *Reset demo*, sign in as Maggie again and set their text size again.

## 6b. Concept test — everyday care built since October (10 min)

Same phone, still as Maggie. For T8, switch to Sarah in the presenter sheet (*Demo mode*), so her screens show what the participant just did, then hand the phone back. If they turned check-in sharing off in T6, ask whether to turn it back on before T8. If they keep it off, *Her day* shows as private, and their reaction to that is part of the test.

| Task | Prompt | Watch for | Success = |
|---|---|---|---|
| T5 My day | "This card is for how your day is going. Show me how you'd say you feel good and had two glasses of water." Then: "You've had breakfast too." | Finds the card under the three big buttons; expects a Submit button; reads the line saying Sarah can see this; un-ticks by mistake? | Records a feeling, water and a meal unaided |
| T6 Keep it to yourself | "Say you'd rather Sarah didn't see how you feel for a while." | Finds *Share daily check-ins with Sarah* in My privacy. Then probe: "Sarah gets a note when you change this. How do you feel about that?" | Finds the switch and explains in own words what Sarah would see |
| T7 Family chat | "Send Sarah a message asking her to visit on Sunday." (The microphone is blocked; if typing is hard for them, type what they dictate.) | Finds the chat tile and *Open chat*; reads who can see the chat; expects the aide to see it?; what they expect the microphone to do | Finds the chat, gets the message sent (typed or dictated), and names who can read it |
| T8 What Sarah sees (optional) | As Sarah, after *Skip to 7 PM for the evening recap* (the card already shows after 6 PM): "Each evening Sarah sees this about your day. She and the aide also get a note when your pills are running low." | What feels fine, what feels like too much; notices *Her day* shows only what they share; reaction to the refill note | Says, in their own words, what they'd keep and what they'd change |

After each task: "On a scale of 1 to 5, how easy was that?" For T8 ask instead: "How do you feel about Sarah seeing this?"

## 7. Wrap-up (3 min)

- Is there anything about getting help at home that I should have asked and didn't?
- Would you be open to a 15-minute follow-up?
- Confirm incentive delivery. Thank them.

## Note-taking template

```
Participant ID:          Date:          Mode:          Interviewer / Note-taker:
Living situation (general):
Help received (who/what/how often):
Medicine routine (no names):
Quotes (verbatim, de-identified):
  - "…"
Independence/dignity moments:
Control preferences (who should / should not see what):
Emergency behavior today:
Task results:  T1 __/5  T2 __/5  T3 __/5  T4 __/5   Notes:
Everyday care:  T5 __/5  T6 __/5  T7 __/5  T8 (feeling, quote):
What they'd keep from Sarah's recap:
Surprises / contradicts a hypothesis:
Follow-up? Y/N
```

## Hypotheses to validate (not findings)

| ID | Hypothesis | Validated if | Invalidated if |
|---|---|---|---|
| H-E1 | Elders accept reminders more readily when they come from a device than from a family member. | 4+ of 6 express this unprompted or when asked about the last reminder | Most prefer a person's reminder |
| H-E2 | Elders want a say in who sees health details, and would split visibility differently for paid caregivers vs. family. | 4+ of 6 describe a split | Most say "everyone can see everything" |
| H-E3 | A "pause sharing" control would be valued even if rarely used. | 3+ of 6 name a situation they'd use it | Most see it as confusing or pointless |
| H-E4 | Elders want the choice to skip or refuse a dose recorded without being nagged. | 4+ of 6 | Most want any non-taken dose escalated |
| H-E5 | Emergency pendants are often not worn; a phone-based SOS with cancel is acceptable. | 3+ of 6 report not wearing or not having one and accept the phone flow | Most reject phone-based SOS |
| H-E6 | Three large actions are understood without training. | T1 success for 5+ of 6 | T1 success for 3 or fewer |
| H-E7 | A one-tap *My day* card with no Submit button is used without help, and some elders would use it on their own. | T5 success for most of those who did T5 (5+ of 6 if all did), and half or more say they'd use it some days | T5 success for half or fewer, or most say they'd never use it |
| H-E8 | Elders want to decide, day by day, whether Sarah sees how they feel. | Half or more of those who did T6 name a time they'd keep it private | Most say Sarah should always or never see it |
| H-E9 | Elders would use a family chat for short messages instead of some calls. | Half or more of those who did T7 | Most say they'd rather call |
| H-E10 | Elders accept Sarah's evening recap and refill notes when they show only what the elder shares. | Two-thirds or more of those who saw T8 are comfortable with it | Most want the recap off or didn't expect Sarah to see it |
