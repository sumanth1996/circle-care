# Security & privacy

This page explains the security and privacy controls that are **real code in the prototype**, how they work, and what a production system still needs. Detailed working documents: [threat model (CC-10)](../../security/10-threat-model.md), [permission matrix (CC-18)](../../security/permission-matrix.md), [security test plan (CC-78)](../../security/78-security-test-plan.md), [incident response runbook (CC-34)](../../security/34-incident-response-runbook.md), [HIPAA risk analysis (CC-79)](../../compliance/79-hipaa-security-risk-analysis.md).

!!! warning "Prototype, not a compliant system"
    The prototype demonstrates privacy-by-design with fictional data in one browser. It has not been security-reviewed or penetration-tested, has no backend, and must not be used with real health information.

## Control summary

| Control | In the prototype | In production (planned) | Story |
|---|---|---|---|
| Encryption at rest | AES-256-GCM in the browser; non-extractable key in IndexedDB | Server-side encryption with managed, rotated keys (KMS); device encryption in native apps | CC-26 |
| Encryption in transit | N/A (no network calls) | TLS 1.2+ everywhere; certificate pinning in native apps | CC-26 |
| Authentication | Simulated password + 6-digit MFA, 5-attempt lockout, simulated biometrics | Real MFA / passkeys, server rate limiting, device binding | CC-11 – 13 |
| Session management | Inactivity lock (15 min; elder optional), sign out everywhere (local) | Server sessions with revocation, push-token revocation | CC-14, CC-27 |
| Authorisation | One matrix, one `can()` check on every data-changing action | Identical policy enforced in the API | CC-18, CC-19 |
| Audit | SHA-256 hash-chained log with integrity check | Server-side append-only log, externally anchored, 6-year retention | CC-28, CC-29 |
| Anomaly detection | Bulk-view and repeated-denial alerts | Tuned detection, security-team escalation | CC-35 |
| Notifications | PHI-free titles | Same, enforced in the notification service | CC-31 |
| Documents | Content-type check, 10 MB limit, encryption, watermarked viewer | Server-side malware scan, encrypted object storage | CC-67 |
| Export | Passphrase-encrypted file (PBKDF2 → AES-GCM) | Same, plus re-authentication | CC-32 |
| Deletion | Wipe state, files and key on this device | Deletion across services and backups (purged within 35 days) | CC-33 |
| Screen privacy | App-switcher privacy shield | Native secure-screen flags | CC-26 |
| Browser hardening | CSP `<meta>` tag on production builds; `no-referrer` | CSP and `frame-ancestors` as HTTP headers; HSTS | CC-78 |
| Voice | On-device recognition only; nothing stored | Same | CC-73 |
| Research data | Kept apart from care data; health words scrubbed | Separate store, retention policy | CC-76, CC-77 |

## Encryption at rest

`src/lib/secureStorage.ts` (CC-26, CC-27):

1. On first use the app generates an **AES-GCM 256-bit key** with `crypto.subtle.generateKey(…, extractable = false, ["encrypt", "decrypt"])` and stores the `CryptoKey` object in IndexedDB (`circle-care-keys`). Because it is **non-extractable**, no JavaScript — including the app's own — can read or export the raw key bytes.
2. Every save serialises the state to JSON and encrypts it with a **fresh random 12-byte IV**. The result is stored as `enc:v1:<base64 iv>:<base64 ciphertext>` in `localStorage["circle-care-demo"]`.
3. Loading decrypts with the same key. GCM authentication means a modified ciphertext or a missing key fails closed: the app starts a fresh demo instead of reading tampered data.
4. Documents are encrypted the same way in IndexedDB `circle-care-files`.
5. If Web Crypto or IndexedDB is unavailable, the prototype falls back to plain `localStorage` (demo convenience only).

The e2e test *CC-26 data at rest in the browser is encrypted* checks that the stored value starts with `enc:v1:` and does not contain "Maggie".

!!! info "Threat-model note"
    Browser-side encryption protects data from casual inspection of storage, backups and other origins. It does **not** protect against malicious code running in the page itself, which is why the CSP and a minimal dependency footprint matter.

## Tamper-evident audit log

`src/data/audit.ts` and `src/lib/sha256.ts` (CC-28):

```text
hash(entry) = SHA-256( JSON.stringify([id, at, actorId, action, resource, prev]) )
prev(first) = "000…0" (64 zeros)
prev(n)     = hash(n − 1)
```

- `verifyChain()` walks the log and reports the first entry whose `prev` or `hash` does not match — catching **edits, deletions and reordering**. The Privacy Center shows *"Access log is intact — All N entries check out"* or *"Entry N of M doesn't match its seal."*
- Entries store identifiers and resource names only, never health values.
- `RETENTION_YEARS = 6` documents the intended retention.
- SHA-256 is implemented in pure JavaScript so the chain can be computed synchronously; a unit test compares it with Node's `crypto` for edge-case inputs.

**Limitation:** an attacker who controls the device can rewrite the whole chain consistently. Production anchors the chain externally (e.g. periodic hashes to a separate write-once store).

## Permission model {#permission-model}

`src/data/policy.ts` (CC-18, CC-19) defines a **role × resource × action** matrix and a single check:

```ts
can(state, actorId, action, resource): boolean
```

| Concept | Rule |
|---|---|
| Roles | `elder`, `guardian`, `family`, `pro`, plus `reviewer` for the internal actor `trust-safety` |
| Active members only | Pending or revoked members, and unknown ids, get nothing |
| `pro@shift` | A professional caregiver matches only while checked in today and not checked out — **minimum necessary** |
| `ALWAYS_SHARED` | `sos`, `emergencyCard`, `circle` stay available to family and pros when the elder pauses sharing |
| Health readings | The guardian's `vitals: read` also requires `settings.vitals.shareWithGuardian` |
| Enforcement | Every data-changing store action calls `guard()`; refusals change nothing and write a `denied` audit entry. Read access in the UI uses `AccessGuard` / `useCan`, which call the same `can()` |

### Summary matrix

R read · W write · P propose · A approve · I invite · X revoke · E export · D delete · V review · S respond

| Resource | Elder | Guardian | Family | Pro on shift | Pro off shift |
|---|---|---|---|---|---|
| `meds` | R W | R W | R P | R P | — |
| `doses`, `notes` | R W | R W | R W | R W | — |
| `tasks` | R W | R W | R W P | R W P | — |
| `notes.private` | — | R W | W | W | — |
| `docs` | R | R W | R W | R W | — |
| `docs.legal` | R | R W | — | — | — (reviewer: V) |
| `approvals` | R | R A | P | P | P |
| `handoffs` | — | R | R | R W | R |
| `vitals` | R | R\* W | — | — | — |
| `appointments` | R | R W | R | R | R |
| `circle` | R I X | R I X | R | R | R |
| `schedule` | R | R W | R P | R P | R P |
| `history` | R | R | R | — | — |
| `digest`, `audit` | R | R | — | — | — |
| `settings` | R (own fields W) | R W | — | — | — |
| `emergencyCard` | R W | R P | R | R | R |
| `sos` | R W | R S | R S | R S | R S |
| `data` | E D | E D | — | — | — |

\* only while Maggie shares readings. The full table with explanations and open design questions is the [Permission matrix](../../security/permission-matrix.md) (it predates the `handoffs`, `vitals` and `appointments` rows above, which are taken from the current code).

## Content Security Policy

`vite.config.ts` injects into production builds only:

```text
default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://images.unsplash.com;
frame-src blob:; worker-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'
```

plus `<meta name="referrer" content="no-referrer">`. A `<meta>` CSP cannot set `frame-ancestors`, so **clickjacking protection needs an HTTP header from the host** (production backlog, CC-78).

## Privacy shield and session lock

- **Privacy shield** (`PrivacyShield` in `Extras.tsx`): when the page becomes hidden (`visibilitychange`, `pagehide`), a blank cover with the logo replaces the screen so the app-switcher snapshot shows no health data.
- **Session lock** (`AppShell`): after `sessionLockMin` minutes without pointer, key, scroll or touch activity (default 15 for caregiver and guardian; elder off by default, 5 or 15 by choice) a lock screen covers the app: *"We lock the app after 15 minutes without activity so others can't see Maggie's information."*

## Export encryption

`encryptWithPassphrase()` (CC-32): passphrase → **PBKDF2-SHA-256, 250,000 iterations, random 16-byte salt** → AES-256-GCM key → encrypt with a random 12-byte IV. The `.ccexport` file is JSON:

```json
{ "format": "circle-care-export", "v": 1, "kdf": "PBKDF2-SHA256-250000",
  "cipher": "AES-256-GCM", "salt": "…", "iv": "…", "data": "…" }
```

Passphrases must be at least 8 characters and are never stored; *"We can't recover it for you."* The e2e test checks that a downloaded file contains `AES-256-GCM` and does not contain *Lisinopril*.

## Deletion

**Close this circle** (`closeCircle`, CC-33) requires `data: delete` (elder or guardian) and a typed `DELETE`. It removes the stored state, deletes the device key (making any remaining ciphertext unreadable), clears the encrypted file store, records a deletion timestamp, and reseeds the demo. **Sign out everywhere** (CC-27) signs every persona out and notifies the guardian.

## PHI-free notifications

Every alert has a generic `title` (what the lock screen shows) and a separate `detail` shown only inside the unlocked app. Titles in use: *You have a reminder from Circle Care*, *Circle Care needs your attention*, *Emergency alert from Circle Care*, *Circle Care security notice*, *Circle Care health notice*, and similar. The weekly digest email shows only counts. See [Alerts & notifications](../features/alerts-and-notifications.md#lock-screen-titles-in-use).

## Anomaly detection

| Signal | Threshold | Action |
|---|---|---|
| Bulk record viewing | ≥ 8 *viewed* entries by one non-elder actor within 5 minutes | Guardian security notice |
| Repeated refusals | ≥ 3 *denied* entries by one actor within 10 minutes | Guardian security notice |

## HIPAA posture

Circle Care is **designed to** the HIPAA Privacy, Security and Breach Notification Rules. Whether HIPAA applies depends on the business model:

| Model | Likely regime |
|---|---|
| Consumer app used directly by families | FTC Health Breach Notification Rule and state health-privacy laws |
| Sold to home care agencies or providers | Circle Care is a **business associate**; HIPAA applies and BAAs are required |

See the [regulatory memo (CC-8)](../../compliance/08-regulatory-memo.md) — not legal advice.

## Server-side protection of identity and payment data {#server-side}

Added in Sprint 11 (CC-172 – CC-190). Details are on [Accounts, identity & payments](../features/accounts-identity-payments.md#security-controls).

| Requirement | Control |
|---|---|
| SSNs protected (HIPAA §164.312(a)(2)(iv), GLBA Safeguards) | AES-256-GCM field encryption with a versioned key id; last four only in every response; HMAC fingerprint for uniqueness; re-entering the password is required to change it |
| No card data held by Circle Care (PCI DSS) | Card and bank numbers go browser → vault; the API stores tokens and last four only; the CVC is never stored |
| No real sensitive data in lower environments | `APP_ENV` other than `production` accepts only SSNs 900–999, routing `110000000`, accounts starting `000` and published test cards; blocked attempts are logged by field name only |
| Safe production configuration | The server refuses to start in production without encryption and HMAC keys, `DATABASE_URL`, and Stripe with a live key; staging needs stable keys; live keys are refused outside production |
| Audit-ready (FDIC / legal requests) | Masked views + `npm run audit:export` (masked CSVs, manifest with SHA-256, export itself audited); append-only `audit_events` |
| Sessions | Hashed tokens, HttpOnly + SameSite=Strict (+ Secure in production) cookies, 30-minute idle and 12-hour absolute expiry, 5-attempt lockout, CSRF header check |
| No PII in caches or logs | The service worker skips `/api` and `/vault`; the API sends `Cache-Control: no-store`; request bodies are never logged |

## What production needs

1. The same permission policy **enforced in a server API**, with field-level filtering of responses.
2. **Server-side encryption at rest** with managed, rotated keys; TLS in transit.
3. The **audit chain stored server-side** and anchored externally; 6-year retention.
4. **Signed BAAs** with every vendor that touches health data (hosting, database, push/SMS/email, error monitoring) — [vendor register](../../compliance/30-vendor-baa-register.md).
5. Real **push/SMS delivery** and iOS **critical-alert** entitlements.
6. **Identity and legal-document verification** by a staffed review team in a separate internal app.
7. **Breach response** — [incident response runbook](../../security/34-incident-response-runbook.md) with assigned roles and a tabletop exercise.
8. A third-party **penetration test** (OWASP ASVS L2 / MASVS) — [security test plan](../../security/78-security-test-plan.md).
9. A designated **security officer** owning the [risk analysis](../../compliance/79-hipaa-security-risk-analysis.md).
10. HTTP security headers (`frame-ancestors`, HSTS) from the host.

## Related pages

- [Privacy Center](../features/privacy-center.md)
- [Care circle & access](../features/care-circle-and-access.md)
- [Data model](data-model.md)
- [Quality & testing](quality-and-testing.md)
