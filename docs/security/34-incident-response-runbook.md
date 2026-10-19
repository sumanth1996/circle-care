# Incident Response Runbook

Notion story: CC-34 Incident response runbook
Status: DRAFT — not adopted, roles not assigned, tabletop exercise **not yet run**. Notification timelines must be confirmed with counsel; this is not legal advice.

## 1. What counts as an incident

Any event that may have exposed, altered, or made unavailable circle data, or that stops safety features (SOS, escalation, dose reminders) from working. When unsure, open an incident — closing one is cheap.

## 2. Severity levels

| Sev | Definition | Examples | Response start | Updates |
|---|---|---|---|---|
| **SEV-1** | Confirmed or likely PHI exposure across circles, or safety features down for many circles | Database exposed; SOS delivery failing platform-wide; leaked export from many accounts | Immediately, 24/7 | Every 30 min internally |
| **SEV-2** | PHI exposure limited to one circle, or a safety feature degraded | Lost caregiver phone with an unlocked session; suspicious access confirmed; SMS provider outage with push working | Within 1 hour | Every 2 hours |
| **SEV-3** | Security weakness without known exposure | Vulnerability report; misconfigured log found with no PHI | Within 1 business day | Daily |
| **SEV-4** | Questions, false alarms | Suspicious-access alert that the guardian confirms was expected | Within 2 business days | On close |

## 3. Roles (names TBD)

| Role | Responsibility | Primary | Backup |
|---|---|---|---|
| Incident Commander (IC) | Owns the incident, decides severity, assigns work, declares closed | TBD | TBD |
| Security lead | Investigation, containment, evidence | TBD | TBD |
| Engineering lead | Fixes, rollbacks, restores | TBD | TBD |
| Privacy/compliance officer | Breach assessment, notification decisions with counsel | TBD | TBD |
| Communications lead | Messages to circles, partners, media | TBD | TBD |
| Scribe | Timeline log (UTC timestamps), decisions, evidence locations | TBD | TBD |
| Counsel (external) | Legal advice on notification | TBD | — |

## 4. First-hour checklist

- [ ] Open an incident channel and doc; record start time (UTC) and who reported it.
- [ ] Assign IC and scribe.
- [ ] Set initial severity (can change).
- [ ] **Safety first:** are SOS and escalation still working? If not, tell affected guardians by another channel to check on the elder directly.
- [ ] Preserve evidence: snapshot logs, do not delete or rotate anything yet unless containment requires it; export audit chain and run `verifyChain` equivalent.
- [ ] Contain (see scenarios).
- [ ] Identify affected circles, data elements (use CC-9), and time window.
- [ ] Notify privacy officer; if PHI may be involved, start the breach assessment clock (discovery date matters).
- [ ] Decide next update time.

## 5. Scenario playbooks

### 5.1 Lost or stolen caregiver phone

1. Caregiver or guardian reports it (in-app or support).
2. Guardian (or support, verified) uses **Sign out everywhere** for that member (CC-27). In the prototype this signs out all personas and alerts the guardian; in production it must revoke every server session and push token.
3. If the phone was unlocked or the session lock was not triggered (default 15 min for caregivers, CC-14), treat as possible exposure: check the audit log for views from that member after the loss time.
4. Consider temporarily revoking the member (Care circle → remove) and re-inviting on a new device.
5. Device data is encrypted with a non-extractable key (CC-26) — note in the assessment, but don't assume it ends the analysis.
6. Severity: SEV-2 if views after loss; SEV-3 if none.

### 5.2 Suspicious access alert

Trigger: rules engine alert — a member opened 8+ parts of the record in 5 minutes or had 3+ denials in 10 minutes (CC-35).

1. Guardian receives "Circle Care security notice" with in-app detail.
2. Guardian confirms with the elder whether the access was expected.
3. If not expected: remove the member's access, then contact support.
4. Support reviews the audit log for that member; verify chain integrity.
5. Assess whether the member is an account takeover (spoofing) or a legitimate member over-reaching (possible elder abuse concern — escalate per policy; see CC-8 Q12).

### 5.3 Leaked export file

1. Exports are passphrase-encrypted (PBKDF2-SHA256 250k → AES-256-GCM, CC-32). Determine whether the passphrase was also exposed.
2. Identify the export event in the audit log (`exported`), who exported and when.
3. If the passphrase was exposed or the file was weakly protected: SEV-2, breach assessment.
4. Advise the circle; consider changing whatever the export revealed that can be changed (e.g., emergency contacts) — health history cannot be "rotated".

### 5.4 Vendor breach

1. Vendor notifies us (BAA terms in CC-30) or we learn from news.
2. Determine what data the vendor held per the register. If the vendor was PHI-free by design (push, analytics), **verify** with logs that no PHI reached them.
3. Rotate credentials/keys shared with the vendor.
4. Obtain vendor's incident report, scope, timeline.
5. Breach assessment for our notification duties.

### 5.5 SOS or escalation delivery failure

1. Switch to fallback channel (SMS fallback exists in the design, `via: "sms-fallback"`).
2. Notify affected guardians to check on elders directly.
3. SEV-1 if platform-wide.

## 6. Breach notification — confirm with counsel

**Which rule applies depends on CC-8 (business associate vs. consumer app). Timelines below are general understanding and must be confirmed with counsel for every incident.**

| Regime | Who is notified | Timeline (general understanding) |
|---|---|---|
| HIPAA — as a business associate | The covered entity (e.g., the agency) | Without unreasonable delay, no later than 60 days from discovery; BAA may set shorter |
| HIPAA — covered entity duties (the agency's) | Individuals; HHS; media if more than 500 residents of a state or jurisdiction | Individuals: no later than 60 days. HHS: within 60 days if 500+; annual log if fewer. Media: within 60 days if 500+ in a state |
| FTC Health Breach Notification Rule (consumer mode) | Individuals, FTC, media if 500+ residents of a state | Confirm current timelines with counsel |
| State breach laws | Residents, sometimes attorneys general | Vary by state; some shorter than 60 days |

A HIPAA breach is presumed unless a documented risk assessment shows a low probability of compromise (nature of data, who received it, whether it was actually viewed, mitigation). Document the assessment either way.

## 7. Communication templates (drafts)

**To affected circle (guardian and elder):**
> Subject: Important information about your Circle Care account
>
> On [date], we learned that [plain description]. The information involved may include [categories, no values]. We have [what we did]. You can [steps: review your access log, remove members, contact us]. We're sorry. Contact us at [contact] with any questions.

Plain language, large type, read-aloud friendly. Never include PHI in the notice email itself. Offer a phone call for elders.

**To a partner agency (BA notice):**
> We are notifying you under our Business Associate Agreement of an incident discovered on [date] affecting [n] of your clients. Scope: [...]. Containment: [...]. We will provide a full report by [date].

**Internal status update:** time, severity, what we know, what we don't, actions, next update.

## 8. After the incident

- Post-incident review within 5 business days, blameless format.
- Update this runbook, CC-10 threat model and CC-79 risk analysis.
- Keep incident records at least 6 years (aligned with audit retention — confirm).

## 9. Tabletop exercise script (status: not yet run)

Duration 60–90 min. Participants: everyone in §3. Facilitator reads injects; participants say what they'd do and who they'd tell.

| Time | Inject | Expected discussion |
|---|---|---|
| 0:00 | A caregiver texts support: "Lost my phone on the bus last night." | Severity? Who verifies the caller? Sign out everywhere |
| 0:10 | Audit log shows 9 record views from that caregiver at 23:40 — after the shift ended | Wait — pro@shift should block off-shift reads. Why did it succeed? (Policy bug or check-in never closed?) Severity up |
| 0:25 | One of the views was the emergency card (always shared) and one was a discharge summary | Data elements involved (CC-9); breach risk assessment |
| 0:40 | The agency is a covered entity; this circle is under its BAA | Who notifies whom, and by when |
| 0:55 | A local reporter emails asking about "a Circle Care data leak" | Comms lead, holding statement, counsel |
| 1:10 | Wrap-up | Gaps found, owners, runbook updates |

Record: date run, attendees, gaps, actions. **Not yet run — schedule after roles are assigned.**
