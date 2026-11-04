# VendorProof Threat Model

**Purpose:** Document security threats, their controls, and verification tests.

---

## Threat Register

| ID | Threat | Affected asset | Likelihood | Impact | Mitigation | Verification test | Status |
|---|---|---|---|---|---|---|---|
| T01 | Cross-workspace read or write by guessed ID | All tenant data | Medium | High | Scoped repositories, RLS, 404 on miss | Two-workspace suite hits every route | MITIGATED (design) |
| T02 | Session theft or fixation | User sessions | Low | High | HttpOnly Secure cookie, rotation, revocation | Session reuse after sign-out fails | MITIGATED (design) |
| T03 | CSRF on approve or invoice | Approval workflow | Medium | High | SameSite, token, Origin check | Request without token rejected | MITIGATED (design) |
| T04 | Prompt injection through PR or issue text | Classification output | Medium | Medium | Section 8.5 of architecture document | Injection corpus yields only schema-valid suggestions or needs_review | MITIGATED (design) |
| T05 | Forged inbound Slack callback | Slack interactive approval | Low | High | Signature and replay checks (section 10.2) | Bad signature and replayed event rejected | PENDING (Slack not in release one) |
| T06 | Duplicate invoice | Financial integrity | Low | High | Unique approval, claim key, singleton job, provider key | Concurrent approve and retry tests | MITIGATED (design) |
| T07 | Approved content altered before execution | Invoice integrity | Low | High | Content hash revalidation | Mutate a line after approval; execution aborts | MITIGATED (design) |
| T08 | Secret in logs, errors or prompts | Secrets exposure | Low | High | Redaction, scanning, no secrets in prompts | Seeded fake secret never appears in output | MITIGATED (design) |
| T09 | AI agent widens the trusted tool list | Swytchcode configuration | Low | High | CODEOWNERS plus CI rule plus executor allowlist | Change without review fails CI | MITIGATED (design) |
| T10 | Swytchcode token compromise | Swytchcode access | Low | High | Secret manager, separate tokens per environment, rotation | Rotation drill documented | MITIGATED (design) |
| T11 | Live Stripe key outside production | Financial operations | Low | High | Startup assertion | Boot with wrong key refuses | MITIGATED (design) |
| T12 | Audit log tampering | Audit integrity | Low | High | Insert-only trigger, no UPDATE or DELETE grant, hash chain | Update attempt raises; chain verification fails on edit | MITIGATED (design) |
| T13 | SSRF | Infrastructure | Low | Medium | No user-supplied fetch | Static check and review | MITIGATED (design) |
| T14 | Control characters or markup in PDF text | PDF rendering | Low | Low | Text-only rendering, character sanitising | Fixture with hostile strings renders as text | MITIGATED (design) |
| T15 | Denial of service through huge imports | System availability | Medium | Medium | Page and item caps, per-workspace job limit | Cap reached produces partial, not a crash | MITIGATED (design) |
| T16 | Malicious dependency | Supply chain | Low | High | Lockfile, exact pins, audit, install scripts off | CI audit gate | MITIGATED (design) |
| T17 | Removed member keeps access | Authorisation | Low | Medium | Per-request membership check, session purge | Removed user's next request fails | MITIGATED (design) |
| T18 | IDOR (Insecure Direct Object Reference) | All tenant data | Medium | High | Workspace-scoped repositories, composite foreign keys | Two-workspace suite hits every ID parameter | MITIGATED (design) |
| T19 | SQL injection | Database | Low | High | Parameterised queries only through ORM | SQL injection strings in test corpus rejected | MITIGATED (design) |
| T20 | XSS (Cross-Site Scripting) | Frontend | Medium | Medium | React escapes by default; no raw HTML rendering of provider text | Stored XSS strings in test corpus rendered as text | MITIGATED (design) |
| T21 | Credential exposure in frontend | Secrets | Low | High | No secrets in frontend variables; workspace from session | Static check and review | MITIGATED (design) |
| T22 | Workspace ID from client | Tenant isolation | Medium | High | Workspace from authenticated session only | Request with workspace ID in body rejected | MITIGATED (design) |
| T23 | Provider permission changes | Provider access | Medium | Medium | Provider status checks; mark disconnected on auth error | Auth error fake marks provider disconnected | MITIGATED (design) |
| T24 | Oversized imports | System availability | Low | Medium | Body limit 256 KB; page and item caps | Oversized body rejected; cap produces partial | MITIGATED (design) |
| T25 | Report exposure | Confidential data | Low | Medium | No public links; Drive sharing requires explicit human action | Access control test on report endpoints | MITIGATED (design) |
| T26 | Worker failures mid-job | Job integrity | Medium | Medium | Pending execution reconciled at startup; invoice jobs never auto-retried | Kill test verifies reconciliation | MITIGATED (design) |
| T27 | Replay attacks on API | Idempotency | Low | High | Idempotency-Key header, stored in idempotency_record | Replayed key with different body returns 409 | MITIGATED (design) |
| T28 | Rate limit bypass | System availability | Medium | Medium | Per-IP and per-session rate limits; stricter on login and approve | Rate limit test enforces limits | MITIGATED (design) |

---

## Residual Risk

### Database Administrator Access
- **Risk:** A database administrator can still alter any table
- **Impact:** Audit log could be tampered with
- **Mitigation:** The audit hash chain head is also copied to the private report folder at each approval, which detects tampering but does not prevent it
- **Acceptance:** Accepted as operational risk; database administrator access is required for maintenance
- **Revisit condition:** Regulatory requirement for immutable audit storage

---

## Threat Categories

### Authentication and Session Threats
- T02: Session theft or fixation
- T17: Removed member keeps access
- T21: Credential exposure in frontend
- T22: Workspace ID from client

### Authorisation and Tenant Isolation Threats
- T01: Cross-workspace read or write by guessed ID
- T18: IDOR (Insecure Direct Object Reference)

### Input Validation and Injection Threats
- T04: Prompt injection through PR or issue text
- T13: SSRF
- T19: SQL injection
- T20: XSS (Cross-Site Scripting)

### CSRF and Replay Threats
- T03: CSRF on approve or invoice
- T05: Forged inbound Slack callback
- T27: Replay attacks on API

### Financial Integrity Threats
- T06: Duplicate invoice
- T07: Approved content altered before execution
- T11: Live Stripe key outside production

### Secrets and Configuration Threats
- T08: Secret in logs, errors or prompts
- T09: AI agent widens the trusted tool list
- T10: Swytchcode token compromise

### Data Integrity Threats
- T12: Audit log tampering
- T14: Control characters or markup in PDF text

### Availability Threats
- T15: Denial of service through huge imports
- T16: Malicious dependency
- T23: Provider permission changes
- T24: Oversized imports
- T26: Worker failures mid-job
- T28: Rate limit bypass

### Data Exposure Threats
- T25: Report exposure

---

## Verification Test Status

### MITIGATED (design)
Threats marked as "MITIGATED (design)" have documented mitigations in the architecture. Verification tests will be implemented during the testing milestone.

### PENDING
Threats marked as "PENDING" are for features not in release one (e.g., Slack interactive approval). Verification tests will be implemented when those features are added.

---

## Threat Model Review Process

### Initial Review
- This threat model is based on the architecture document (Sections 1-17)
- Threats are derived from the architecture's security controls and threat analysis
- Mitigations are documented in the architecture document

### Ongoing Review
- Threat model will be reviewed before each major release
- New threats will be added as features are added
- Verification tests will be updated as mitigations are implemented

### External Audit
- External security audit recommended before production deployment
- Audit findings will be recorded in `docs/security-review.md`

---

**Document status:** Initial threat model created. Mitigations designed. Verification tests pending implementation.


## Phase 0 hosting and boundary additions — 2026-11-04

The planned deployment separates the public Next.js frontend on Vercel from the Fastify API and worker on Render. The browser receives only `NEXT_PUBLIC_API_BASE_URL`; database URLs, Swytchcode tokens, provider credentials, and future session secrets remain on Render. Render PostgreSQL is the planned system of record, with migrations run as a controlled release step.

The primary new trust boundary is the Vercel-to-Render API connection. Mitigations are exact-origin CORS, HTTPS, request IDs, safe error bodies, server-side authorization in later phases, and no provider calls from browser code. Remaining risks include missing authentication, missing tenant enforcement, unavailable database verification in the current sandbox, and unverified provider execution.
