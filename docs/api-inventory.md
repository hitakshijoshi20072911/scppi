# VendorProof Provider API Inventory

This register distinguishes source code and mocks from real provider authentication/execution. Wrekenfiles are untrusted API descriptions; they do not prove credentials work. All provider calls must use the official Swytchcode Runtime. No direct HTTP/SDK fallback is allowed.

## Verification scale

1. Catalogue mention.
2. Registry search confirmed.
3. Integration download succeeded.
4. Method present in Wrekenfile.
5. Canonical ID and request/response schema reviewed.
6. Method enabled in `.swytchcode/tooling.json`.
7. Provider authentication connected for the intended account/tenant.
8. A bounded sandbox/test execution succeeded and was recorded.

Do not claim a provider at a higher level than evidenced. Unit tests use fakes and do not count as rung 8.

## Current provider matrix (2026-11-13)

| Provider        | Purpose                                                                           | Selected canonical methods                   | Highest evidenced level | Live status                                                                                                  |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------------ |
| GitHub          | Read bounded pull request and commit evidence for an explicitly mapped repository | `github.pull.get`, `github.pull.commits.get` |                       6 | Swytchcode owner OAuth reports connected-but-expired; no live verification                                   |
| Stripe          | Source-only draft adapter pending verified test-account binding                   | None enabled                                 |                       5 | All Stripe methods disabled; no API route invokes the adapter; test-mode identity/retry semantics unverified |
| Google Calendar | Source-only reminder adapter pending durable ownership provenance                 | None enabled                                 |                       5 | All Calendar methods disabled; label matching alone does not prove app ownership; OAuth/live test pending    |

No provider has reached rung 7 or 8 in this task. The separate Stripe connector can identify a test-mode account, but that is not Swytchcode authentication and is not used to make provider calls. User-provided Swytchcode token and database URLs were exposed in chat and must be rotated before reuse.

The authenticated integration screen allows project-scoped GitHub repository mapping and shows the actual connection status returned by the API. Stripe and Google Calendar are visibly marked unavailable/not verified with disabled actions; those controls are not an OAuth connection flow and must not be described as working until the server-side provider paths and safety gates are completed. The project workspace/evidence UI is backed by application APIs and does not change any provider verification level.

## GitHub

**Integration:** `GitHub@1.1.4`; Wrekenfile: `.swytchcode/integrations/GitHub/github/1.1.4/wrekenfile.yaml`. The allowlist is read-only. The application maps a repository to a project, then an authenticated workspace administrator starts a workspace-tenant OAuth flow and performs bounded verification. It stores only minimized metadata (IDs, titles, states, allowed author fields, timestamps and URLs); it must not ingest source code or diffs. GitHub activity is not proof of hours. Retry reads only when safe; never fall back to a personal account or direct API.

**Current blocker:** owner-level Swytchcode GitHub OAuth is expired. The provider adapter and server route tests are mocked; no live repository was queried.

## Stripe

**Integration:** `Stripe@2026-06-24.dahlia`; Wrekenfile: `.swytchcode/integrations/Stripe/stripe/2026-06-24.dahlia/wrekenfile.yaml`. The adapter creates only a draft invoice and invoice items from a fresh, approved, immutable VendorProof invoice preview. It uses a synthetic test customer identity, metadata linking to workspace/preview/content hash, explicit `auto_advance: false`, bounded lookups and idempotency keys; an uncertain write is returned as `draft_unknown` and must be reconciled before retry. Current route code does not expose sending, finalization, payment, refund or payout operations.

**Current blocker:** The source adapter has fake-runtime tests, but all Stripe create methods are disabled in `.swytchcode/tooling.json`; no application API route invokes it. `testMode: true` and synthetic email validation do not independently prove the connected Stripe credential is test-mode, and runtime retry/header behavior remains unverified. The separate Stripe connector's test account is not interchangeable with the required Swytchcode runtime. Do not enable writes until a test credential/account is independently verified, retry/idempotency behavior is demonstrated, and a reviewed API path binds the approved preview hash to server-established workspace identity.

## Google Calendar

**Integration:** `Google Calendar.calendar@v3`; Wrekenfile: `.swytchcode/integrations/Google Calendar/calendar/v3/wrekenfile.yaml`. The source adapter uses stable event IDs and private VendorProof metadata, but currently infers calendar ownership from mutable labels and does not persist a trusted created-calendar ID. Matching labels alone do not prove app ownership. Calendar create/update/delete methods are disabled in `.swytchcode/tooling.json`; do not claim operational reminders or exclusive ownership until durable provenance is implemented and the isolated OAuth tenant is verified. Unrelated primary/shared calendars must never be mutated.

**Current blocker:** all Calendar methods are disabled; the source adapter infers ownership from mutable summary/description/private markers and does not persist a trusted created-calendar ID. Matching labels alone do not prove app ownership. Do not claim operational reminders or exclusive ownership until durable provenance is implemented and lookalike-resource tests pass. Swytchcode OAuth and live isolated-tenant validation have not occurred.

## Hosted database gate affecting provider verification

Both designated Supabase projects currently have only migrations `0000`–`0002`. The repository's `0003_commit_provenance.sql` and `0004_phase3_invoice_approval.sql` are absent in both hosted migration ledgers; consequently the invoice and later evidence schema are not present. Staging is Free and has no scheduled project backups; test has no business rows. Before any hosted migration, create a protected logical backup, rotate the previously exposed database credentials, review migrations, and test the resulting schema and RLS through the restricted runtime role. No migration has been applied in this work.

## Evidence files and verification

- Method definitions and schemas are in the checked-in Wrekenfiles named above.
- The exact enabled method IDs are recorded in `.swytchcode/tooling.json`.
- Fake-only safety tests: `server/tests/phase2.github.test.ts`, `server/tests/stripe-draft.test.ts`, and `server/tests/calendar-reminders.test.ts`.
- Local verification on 2026-11-07: 75 backend unit tests, typecheck, lint, formatting, build, 6 Playwright smoke/demo/routing tests, and production dependency audit all passed. These do not count as provider execution or hosted RLS/session/CRUD verification.
