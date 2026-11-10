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

## Current provider matrix (2026-11-07)

| Provider        | Purpose                                                                             | Selected canonical methods                                                                                                                                                     | Highest evidenced level | Live status                                                                                        |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------: | -------------------------------------------------------------------------------------------------- |
| GitHub          | Read bounded pull request and commit evidence for an explicitly mapped repository   | `github.pull.get`, `github.pull.commits.get`, `github.pull.get1`, `github.commit.get2`                                                                                         |                       6 | Swytchcode owner OAuth reports connected-but-expired; no live verification                         |
| Stripe          | Test-mode customer and draft-invoice flow after explicit invoice approval           | `stripe.customer.list`, `stripe.customer.create`, `stripe.invoiceitem.create`, `stripe.invoiceitem.list`, `stripe.invoice.create`, `stripe.invoice.get`, `stripe.invoice.list` |                       6 | Adapter fake tests pass; Swytchcode Stripe API-key connection and live test-mode execution pending |
| Google Calendar | Create a dedicated VendorProof calendar and manage VendorProof-owned reminders only | `calendar.me.calendarList.list`, `calendar.calendar.create`, `calendar.event.get`, `calendar.event.create`, `calendar.event.update1`, `calendar.event.delete`                  |                       6 | Methods/schemas reviewed; Swytchcode OAuth consent and live test pending                           |

No provider has reached rung 7 or 8 in this task. The separate Stripe connector can identify a test-mode account, but that is not Swytchcode authentication and is not used to make provider calls. User-provided Swytchcode token and database URLs were exposed in chat and must be rotated before reuse.

## GitHub

**Integration:** `GitHub@1.1.4`; Wrekenfile: `.swytchcode/integrations/GitHub/github/1.1.4/wrekenfile.yaml`. The allowlist is read-only. The application maps a repository to a project, then an authenticated workspace administrator starts a workspace-tenant OAuth flow and performs bounded verification. It stores only minimized metadata (IDs, titles, states, allowed author fields, timestamps and URLs); it must not ingest source code or diffs. GitHub activity is not proof of hours. Retry reads only when safe; never fall back to a personal account or direct API.

**Current blocker:** owner-level Swytchcode GitHub OAuth is expired. The provider adapter and server route tests are mocked; no live repository was queried.

## Stripe

**Integration:** `Stripe@2026-06-24.dahlia`; Wrekenfile: `.swytchcode/integrations/Stripe/stripe/2026-06-24.dahlia/wrekenfile.yaml`. The adapter creates only a draft invoice and invoice items from a fresh, approved, immutable VendorProof invoice preview. It uses a synthetic test customer identity, metadata linking to workspace/preview/content hash, explicit `auto_advance: false`, bounded lookups and idempotency keys; an uncertain write is returned as `draft_unknown` and must be reconciled before retry. Current route code does not expose sending, finalization, payment, refund or payout operations.

**Current blocker:** Stripe methods are enabled and adapter tests pass against a fake runtime. The Swytchcode Stripe API-key connection has not been provisioned or tested. A Stripe connector in test mode is not interchangeable with the required Swytchcode runtime. Never use live mode or create a financial object until a separate user-approved, isolated test flow is connected.

## Google Calendar

**Integration:** `Google Calendar.calendar@v3`; Wrekenfile: `.swytchcode/integrations/Google Calendar/calendar/v3/wrekenfile.yaml`. Selected Calendar scopes are limited to calendar-list read (`https://www.googleapis.com/auth/calendar.calendarlist.readonly`) and the app-created calendar/event scope (`https://www.googleapis.com/auth/calendar.app.created`). The adapter uses stable event IDs and private VendorProof metadata; it may create its own secondary calendar and manage only events there. It must not read, update or delete unrelated primary/shared calendar events. Explain that reminders are limited to this dedicated VendorProof calendar.

**Current blocker:** method schemas and adapter fake tests exist; the Swytchcode OAuth connection and live create/update/delete test on an isolated test tenant have not occurred.

## Hosted database gate affecting provider verification

Both designated Supabase projects currently have only migrations `0000`–`0002`. The repository's `0003_commit_provenance.sql` and `0004_phase3_invoice_approval.sql` are absent in both hosted migration ledgers; consequently the invoice and later evidence schema are not present. Staging is Free and has no scheduled project backups; test has no business rows. Before any hosted migration, create a protected logical backup, rotate the previously exposed database credentials, review migrations, and test the resulting schema and RLS through the restricted runtime role. No migration has been applied in this work.

## Evidence files and verification

- Method definitions and schemas are in the checked-in Wrekenfiles named above.
- The exact enabled method IDs are recorded in `.swytchcode/tooling.json`.
- Fake-only safety tests: `server/tests/phase2.github.test.ts`, `server/tests/stripe-draft.test.ts`, and `server/tests/calendar-reminders.test.ts`.
- Local verification on 2026-11-07: 75 backend unit tests, typecheck, lint, formatting, build, 6 Playwright smoke/demo/routing tests, and production dependency audit all passed. These do not count as provider execution or hosted RLS/session/CRUD verification.
