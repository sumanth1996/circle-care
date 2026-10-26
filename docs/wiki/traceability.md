# Traceability matrix

Links each feature page to its Notion user stories (`CC-n`), the code that implements them and the tests that cover them. Story IDs were **derived from code comments** (`grep -rn "CC-[0-9]" src`) on 2026-10-19, plus test names and the four approved additions listed in the repository README. Story titles live in Notion; where a story number appears only inside a range comment (e.g. "CC-94 – CC-98") it is shown in *italics*.

Test abbreviations: **U** = unit test file in `src/__tests__/`, **E** = e2e scenario number from [Quality & testing](architecture/quality-and-testing.md#e2e-scenarios), **A** = axe-core accessibility screen.

## By feature page

| Feature page | Stories | Code | Tests |
|---|---|---|---|
| [F-01 Website & onboarding](features/website-and-onboarding.md) | CC-11, CC-12, CC-13, CC-14, CC-15, CC-17, CC-22, CC-75 | `pages/Landing.tsx`, `pages/site/*`, `components/Site.tsx`, `pages/Welcome.tsx`, `pages/SignIn.tsx`, `pages/elder/Consent.tsx`, `pages/Invite.tsx`, `components/Extras.tsx` (WelcomeTour), `components/AppShell.tsx` (lock) | E1, E2, E3, E4, E21, E28 · A: 6 site pages + `/app` |
| [F-02 Elder experience](features/elder-experience.md) | CC-14, CC-39, CC-40, CC-48, CC-52, CC-65, CC-68, CC-69, CC-70, CC-71, CC-72, CC-73 | `pages/elder/ElderHome.tsx`, `ElderNext.tsx`, `ElderCall.tsx`, `ElderDecisions.tsx`, `ElderSettings.tsx`, `lib/voice.ts`, `components/ui.tsx` (useSpeech, Avatar contrast) | U rules, health · E5, E9, E22 · A: 4 elder screens |
| [F-03 SOS & emergency](features/sos-and-emergency.md) | CC-46, CC-47, CC-48, CC-49, CC-50, CC-52, CC-53 | `pages/elder/ElderSos.tsx`, `pages/shared/SosResponder.tsx`, `pages/shared/EmergencyCard.tsx`, `data/store.tsx` (sosStart/Acknowledge/Resolve, evaluate), `pages/guardian/Circle.tsx` (order) | U rules (CC-52), policy · E5, E6, E22 |
| [F-04 Medications & tasks](features/medications-and-tasks.md) | CC-36, CC-37, CC-38, CC-39, CC-40, CC-41, CC-42, CC-43, CC-44, CC-45, CC-64 | `pages/guardian/Medications.tsx`, `pages/caregiver/CaregiverToday.tsx`, `pages/elder/ElderNext.tsx`, `data/selectors.ts` (dosesFor, doseThresholds, tasksFor), `data/store.tsx` (recordDose, verifyDose, saveMed, requestMedChange, completeTask, evaluate) | U rules, policy · E7, E8, E9 · A: meds, caregiver, elder/next |
| [F-05 Caregiver shifts & hand-offs](features/caregiver-shifts-and-handoffs.md) | CC-38, CC-54, CC-55, CC-56, CC-57, CC-58, CC-59, CC-60, CC-82 | `pages/caregiver/CaregiverToday.tsx`, `CaregiverHandoff.tsx`, `CaregiverSchedule.tsx`, `pages/guardian/Schedule.tsx`, `data/selectors.ts` (lateCheckins, coverageGaps), `data/policy.ts` (onShift) | U policy · E7, E10, E11, E12 · A: caregiver |
| [F-06 Guardian dashboard & approvals](features/guardian-dashboard-and-approvals.md) | CC-14, CC-42, CC-50, CC-52, CC-59, CC-61, CC-62, CC-63, CC-64, CC-65, CC-83 | `pages/guardian/GuardianHome.tsx`, `Approvals.tsx`, `Feed.tsx`, `Digest.tsx`, `GuardianSettings.tsx`, `data/selectors.ts` (feed, northStar, adherenceByDay, checkinStreak) | U rules (CC-64), policy · E3, E9, E14, E18, E21 · A: guardian home, approvals, digest, settings |
| [F-07 Health insights](features/health-insights.md) | CC-84, CC-85, CC-86, CC-87, CC-88, CC-89, *CC-90*, CC-91, CC-92, CC-93 | `pages/guardian/Health.tsx`, `lib/health.ts`, `components/charts.tsx`, `data/store.tsx` (evaluate vitals, setHealthSharing, simulate), `data/policy.ts` (vitals) | U health (21) · E24, E25, E26 · A: health |
| [F-08 Care calendar](features/care-calendar.md) | CC-94, *CC-95*, CC-96, *CC-97*, CC-98 | `pages/guardian/Calendar.tsx`, `data/types.ts` (Appointment), `data/demo.ts` (appointmentsSeed), `data/store.tsx` (saveAppointment, setAppointmentStatus) | U health (appointments) · E27 · A: calendar |
| [F-09 Care circle & access](features/care-circle-and-access.md) | CC-15, CC-16, CC-17, CC-18, CC-19, CC-20, CC-21, CC-23, CC-24, CC-25, CC-48 | `pages/guardian/Circle.tsx`, `pages/internal/Review.tsx`, `pages/Invite.tsx`, `data/policy.ts`, `data/store.tsx` (invite, revoke, reviewDoc, evaluate expiry) | U policy (183), rules (CC-25) · E13, E15, E16 · A: circle, review |
| [F-10 Notes & documents](features/notes-and-documents.md) | CC-19, CC-23, CC-66, CC-67 | `pages/shared/Notes.tsx`, `lib/secureStorage.ts` (inspectUpload, putFile, getFile), `components/Extras.tsx` (AccessGuard), `styles.css` (watermark) | U policy · E8, E11, E15, E29 · A: notes |
| [F-11 Privacy Center](features/privacy-center.md) | CC-20, CC-21, CC-22, CC-26, CC-27, CC-28, CC-29, CC-32, CC-33, CC-81, CC-87 | `pages/shared/PrivacyCenter.tsx`, `data/audit.ts`, `lib/sha256.ts`, `lib/secureStorage.ts` (encrypt/decryptWithPassphrase, wipeDevice), `components/Extras.tsx` (PrivacyShield) | U audit, sha256, policy (CC-81) · E12, E19, E20, E26, E28, E29 · A: elder & guardian privacy |
| [F-12 Alerts & notifications](features/alerts-and-notifications.md) | CC-25, CC-31, CC-35, CC-39, CC-42, CC-50, CC-52, CC-57, CC-63, CC-64, CC-86 | `data/store.tsx` (evaluate, pushAlert), `pages/shared/Alerts.tsx`, `components/AppShell.tsx` (banners), `data/types.ts` (Alert) | U rules (7), health · E7, E17, E18, E25 |
| [F-13 Pilot & feedback](features/pilot-and-feedback.md) | CC-74, CC-75, CC-76, CC-77, CC-80 | `pages/site/Pilot.tsx`, `lib/pilot.ts`, `components/Extras.tsx` (NpsCard), `pages/internal/PilotDashboard.tsx`, `components/PersonaSheet.tsx` | E1, E23 (and presenter controls in E7, E17, E18, E25) · A: pilot, `/app/pilot` |
| [Security & privacy](architecture/security-and-privacy.md) | CC-18, CC-19, CC-26 – CC-33, CC-35, CC-78 | `data/policy.ts`, `data/audit.ts`, `lib/secureStorage.ts`, `vite.config.ts` (CSP) | U policy, audit, sha256 · E19, E20 |

## By story

| Story | Feature page(s) | Code references |
|---|---|---|
| CC-1 – CC-10 | [Research & Compliance](research-and-compliance.md) (working docs) | `pages/site/WhoItsFor.tsx` cites CC-2, CC-3, CC-4 |
| CC-11 | F-01 | `SignIn.tsx`, `Welcome.tsx` |
| CC-12, CC-13 | F-01 | `SignIn.tsx` (comment "CC-11/12/13") |
| CC-14 | F-01, F-02, F-06 | `AppShell.tsx`, `types.ts`, `GuardianSettings.tsx` |
| CC-15 | F-01, F-09 | `Welcome.tsx`, `Circle.tsx` |
| CC-16 | F-09 | `Circle.tsx` (comment "CC-15/16") |
| CC-17 | F-01, F-09 | `Invite.tsx` |
| CC-18 | F-09, Security | `policy.ts`, `Circle.tsx`, `policy.test.ts`; doc `security/permission-matrix.md` |
| CC-19 | F-09, F-10, Security | `policy.ts`, `store.tsx`, `Extras.tsx`, `types.ts` |
| CC-20, CC-21 | F-09, F-11 | `PrivacyCenter.tsx` |
| CC-22 | F-01, F-11 | `store.tsx`, `Consent.tsx` |
| CC-23 | F-09, F-10 | `types.ts`, `Notes.tsx` |
| CC-24 | F-09 | `store.tsx`, `types.ts`, `Circle.tsx`, `Review.tsx` |
| CC-25 | F-09, F-12 | `store.tsx`, `types.ts`, `Circle.tsx`, `rules.test.ts` |
| CC-26 | F-11, Security | `secureStorage.ts`, `store.tsx`, `Extras.tsx`, `styles.css` |
| CC-27 | F-11, Security | `store.tsx`, `secureStorage.ts` |
| CC-28 | F-11, Security | `audit.ts`, `types.ts`, `audit.test.ts` |
| CC-29 | F-11 | `PrivacyCenter.tsx` |
| CC-30 | Research & Compliance | doc `compliance/30-vendor-baa-register.md` |
| CC-31 | F-12 | `types.ts`, `Alerts.tsx` |
| CC-32 | F-11, Security | `secureStorage.ts`, `PrivacyCenter.tsx` |
| CC-33 | F-11, Security | `store.tsx`, `secureStorage.ts` |
| CC-34 | Research & Compliance | doc `security/34-incident-response-runbook.md` |
| CC-35 | F-12, Security | `store.tsx`, `rules.test.ts` |
| CC-36, CC-37, CC-44 | F-04 | `Medications.tsx` |
| CC-38 | F-04, F-05 | `CaregiverToday.tsx` |
| CC-39 | F-02, F-04, F-12 | `store.tsx`, `ElderNext.tsx` |
| CC-40 | F-02, F-04 | `ElderNext.tsx` |
| CC-41 | F-04 | `types.ts`, `CaregiverToday.tsx` |
| CC-42 | F-04, F-06, F-12 | `store.tsx`, `GuardianSettings.tsx` |
| CC-43 | F-04 | `store.tsx`, `Medications.tsx` |
| CC-45 | F-04 | `CaregiverToday.tsx` |
| CC-46, CC-47 | F-03 | `ElderSos.tsx` |
| CC-48 | F-02, F-03, F-09 | `store.tsx`, `Circle.tsx` |
| CC-49 | F-03 | `SosResponder.tsx` |
| CC-50 | F-03, F-06, F-12 | `GuardianSettings.tsx` |
| CC-52 | F-02, F-03, F-06, F-12 | `store.tsx`, `GuardianSettings.tsx`, `rules.test.ts` |
| CC-53 | F-03 | `EmergencyCard.tsx` |
| CC-54, CC-60 | F-05 | `Schedule.tsx` |
| CC-55 | F-05 | `CaregiverSchedule.tsx` |
| CC-56 | F-05 | `CaregiverToday.tsx` |
| CC-57 | F-05, F-12 | `store.tsx`, `Schedule.tsx` |
| CC-58 | F-05 | `CaregiverHandoff.tsx` |
| CC-59 | F-05, F-06 | `CaregiverToday.tsx`, `GuardianHome.tsx` |
| CC-61 | F-06 | `GuardianHome.tsx` |
| CC-62 | F-06 | `Feed.tsx` |
| CC-63 | F-06, F-12 | `GuardianSettings.tsx` |
| CC-64 | F-04, F-06, F-12 | `store.tsx`, `Approvals.tsx`, `rules.test.ts` |
| CC-65 | F-02, F-06 | `ElderDecisions.tsx` |
| CC-66 | F-10 | `Notes.tsx` |
| CC-67 | F-10 | `types.ts`, `secureStorage.ts`, `Notes.tsx`, `styles.css` |
| CC-68, CC-69, CC-70 | F-02 | `ElderHome.tsx`, `ElderCall.tsx`, `ElderSettings.tsx` |
| CC-71, CC-72 | F-02 | `ui.tsx`, `styles.css` |
| CC-73 | F-02 | `voice.ts`, `ElderNext.tsx` |
| CC-74 | F-13 | `pilot.ts`, `site/Pilot.tsx`; doc `pilot/74-pilot-plan.md` |
| CC-75 | F-01, F-13 | `Extras.tsx`, `types.ts` |
| CC-76 | F-13 | `Extras.tsx`, `pilot.ts`, `styles.css` |
| CC-77 | F-13 | `PilotDashboard.tsx` |
| CC-78 | Security | `vite.config.ts`; doc `security/78-security-test-plan.md` |
| CC-79 | Research & Compliance | doc `compliance/79-hipaa-security-risk-analysis.md` |
| CC-80 | F-13 | `PersonaSheet.tsx` ("Approved feature: Persona switcher demo mode") |
| CC-81 | F-11 | `policy.ts`, `PrivacyCenter.tsx` ("Approved feature: Privacy Center"), `policy.test.ts` |
| CC-82 | F-05 | `CaregiverHandoff.tsx` ("Smart hand-off summary") |
| CC-83 | F-06 | `Digest.tsx` ("Weekly family digest") |
| CC-84 – CC-93 | F-07 | `health.ts`, `Health.tsx`, `store.tsx`, `policy.ts`, `types.ts`, `GuardianHome.tsx`, `health.test.ts` |
| CC-94 – CC-98 | F-08 | `Calendar.tsx`, `types.ts`, `store.tsx`, `GuardianHome.tsx`, `calendar.css` |

!!! note "Stories without code references"
    CC-51 does not appear in code or docs comments; CC-90, CC-95 and CC-97 appear only inside range comments. Check their status in Notion.

## Related pages

- [Features](features/index.md)
- [Quality & testing](architecture/quality-and-testing.md)
- [Research & Compliance](research-and-compliance.md)
