# Phase 2 implementation — evidence and reconciliation

**Status:** Phase 2 backend implementation is prepared on `feat/phase-2-evidence-reconciliation`; automated checks pass. Live GitHub reads and PostgreSQL migration execution remain unverified because the current sandbox has no database URL, PostgreSQL client/server, or Swytchcode runtime credentials. The default provider executor fails closed, so this code does not claim a real provider call.

## Delivered

The API now supports GitHub repository mapping, contract-bound scope-rule configuration, reconciliation run creation, bounded source ingestion, failed-source retry, explicit partial-ingestion acceptance, deterministic classification, item review, owner/admin decisions, cancellation, and run/item reads. Routes are mounted under `/api/v1/workspaces/:workspaceId/projects/:projectId` and call the Phase 1 workspace authorization helper before tenant queries.

Phase 2 migrations add source mappings, scope rules, normalized work items, run/source records, run-item classifications, and provider-execution audit rows. The new tenant tables use forced PostgreSQL row-level security. Every route/repository transaction sets `app.workspace_id` locally; queries also carry explicit workspace predicates. Runs keep a JSON scope-rule snapshot and contract reference so later edits cannot silently change the classification basis. Scope rules become immutable once a run references their contract.

The GitHub adapter uses only verified read method IDs and currently implements bounded pagination for `github.pull.get`, requesting all PR states. It validates and reduces responses to PR ID, type, title, state, author, URL, and timestamps; body, comments, files, diffs, code, and arbitrary provider payloads are not persisted. Provider attempts are auditable by hashed request/correlation IDs and a payload-free response summary. No direct GitHub HTTP or SDK call and no shell/CLI execution were added.

Deterministic keyword classification produces only `rule_matched` or `needs_review`. Ambiguous, missing, malformed, oversized, or instruction-like evidence fails closed to review. A rule match is not an approval. Human approve/reject is a distinct owner/admin action, requires an explicit versioned decision, and is audit logged. Approvals require a category and short client-facing description. The Phase 2 workflow creates no hours, rates, amounts, currencies, or invoices.

## API workflow

1. An owner/admin maps a GitHub repository with `POST .../sources`. Mapping records `connection_status: not_connected`; it does not imply OAuth consent.
2. The owner/admin stores rules for a specific active contract with `PUT .../contracts/:contractId/scope-rules`. Rules are snapshotted when creating a run with `POST .../runs`.
3. A member creates a run for a local-date period and starts it with the returned `runVersion`. Each source read is bounded to 10 pages of 100 pull requests. Incomplete reads remain `ingested_partial`.
4. An admin can retry an individual failed source with `POST .../retry-source`, or explicitly accept partial evidence with `POST .../accept-partial`. Partial data cannot proceed to classification without one of these explicit actions.
5. `POST .../classify` applies the immutable scope-rule snapshot. Unmatched/ambiguous items enter `needs_review`; matching items enter `ready_for_approval` but are not approved for billing.
6. Owners/admins resolve review items via `POST .../items/:itemId/decision`. `GET .../items` and `GET .../runs/:runId` show the recorded state. Only `created`, `needs_review`, and `ready_for_approval` runs can be cancelled.

Every reconciliation-run state transition includes an expected `runVersion`, and the domain state machine rejects stale versions and invalid transitions. Period end dates are exclusive local-date boundaries in the project's stored time zone. Partial evidence requires an explicit retry or acceptance decision. Database operations are parameterized and transactionally audited.

## Runtime gate and required follow-up

`phase2Routes` accepts an injected `SwytchcodeExecutor`; `createServer` accepts an optional `phase2Executor`. Without one, `unavailableExecutor` returns `EXECUTOR_UNAVAILABLE` and makes no network call. The current source-connection flow deliberately does not claim that OAuth is connected or set `connection_status` to `connected`. Before enabling live ingestion, deploy a reviewed Swytchcode transport and GitHub OAuth/token flow, bind the authenticated workspace identity server-side, set connection state only after verified consent, then run the sandbox verification ladder documented in `docs/api-inventory.md`.

The new SQL migration is `server/src/db/migrations/0002_phase2_evidence_reconciliation.sql`. `npm run db:check` is static; it does not execute SQL against PostgreSQL. Apply it only to a disposable/test database first, then add PostgreSQL integration tests covering migration application, RLS isolation, run creation, failure/retry, and human decisions before staging deployment.

## Verification

Most recent successful automated checks: `npm run typecheck` (server and web), `npm run test:unit` (35 tests across five files), `npm run lint`, `npm run format:check`, `npm run build`, and `npm run db:check`. `npm audit --omit=dev --audit-level=moderate` reports zero production vulnerabilities. Full `npm audit --audit-level=moderate` still reports four moderate development-tool advisories through Drizzle Kit's deprecated esbuild loader; `npm audit fix --force` proposes a breaking Drizzle Kit downgrade and was not applied.

No live database migration, OAuth flow, Swytchcode executor call, or provider response was performed in this environment. The API’s default closed state and the `not_connected` mapping status are intentional safety behavior, not a claim of production readiness.
