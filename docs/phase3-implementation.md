# Phase 3 implementation — invoice previews and human review

**Status:** Backend and authenticated frontend support deterministic invoice previews and owner review. External Stripe writes, PDF export, and staging execution are not implemented or verified in this slice.

## Implemented

- Additive PostgreSQL migration `0004_phase3_invoice_approval.sql` creates workspace-isolated invoice preview, immutable invoice line, active evidence-claim, and invoice review-history tables.
- A ready reconciliation run can have at most one open or approved invoice preview. A rejected preview releases its evidence claims and can be replaced. The server selects only approved, billable hourly time entries or accepted fixed-price milestones matching the run's project, client, contract, currency, billing period, and active contract terms.
- Periods are half-open `[start, end)`. Milestone acceptance dates are evaluated in the time zone captured on the reconciliation run.
- Amounts are calculated in integer minor units with deterministic half-up hourly rounding. Cumulative accepted fixed-price milestones across the contract cannot exceed the contract value. Unsafe integer arithmetic and duplicate evidence are rejected.
- The backend stores a versioned snapshot and SHA-256 over canonical JSON, including the workspace, source run/version/completeness/time zone, client, project, contract, period, currency, evidence references and values, accepted fixed-milestone contract total, and subtotal. Database triggers block edits/deletes of invoice lines, snapshots, and review history.
- A review recomputes current eligible evidence while holding database row locks. Any change to the reconciliation, contract, client/project relationship, or evidence invalidates the snapshot. Review is restricted to the workspace owner and a session authenticated within the last 15 minutes. Rejection requires a reason and releases the evidence claims; approval and rejection are recorded in both the review history and audit log.
- The authenticated `/app/invoices` page lists eligible runs and previews, supports preview creation, line inspection, hash display, approval, rejection, and review history.

## API

- `GET /api/v1/workspaces/:workspaceId/invoice-eligible-runs`
- `POST /api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/invoice-previews` (`{ "runVersion": number }`)
- `GET /api/v1/workspaces/:workspaceId/invoice-previews`
- `GET /api/v1/workspaces/:workspaceId/invoice-previews/:invoiceId`
- `POST /api/v1/workspaces/:workspaceId/invoice-previews/:invoiceId/review` (`{ decision, version, contentHash, reason? }`)

All operations use the existing authenticated workspace context and database RLS. Review mutations also pass through the existing CSRF/origin controls.

## Explicit provider and deployment gates

The Stripe Wrekenfile evidence lists `stripe.invoice.create`, `stripe.invoice.get`, `stripe.invoice.list`, and related customer/invoice-item methods at schema-verification level. The trusted Swytchcode tooling and runtime executor do not enable those Stripe methods; no Stripe test credential, tenant connection, live sandbox execution, idempotency behavior, or draft retrieval has been verified. The repository rules require human review before widening that controlled allowlist. Therefore **this code does not invoke Stripe, create a financial-provider draft, or claim provider connectivity**. It does not call Stripe directly.

PDF generation is not included: PDFKit is not currently installed, and this slice does not add a new dependency without separately validating the report requirements. The current reconciliation engine does not attach manual time/milestone evidence to run items, so the invoice snapshot identifies the run and its own approved evidence records but does not claim that each billing record is linked to an imported GitHub item. Tax calculation is not supported by the current contract schema and is not added to the preview.

Before any draft write can be built or released, the next required step is human review of the exact Stripe method IDs/schemas and trusted-tool changes; then a workspace-specific Stripe test connection, controlled test-mode execution of create/retrieve/list and idempotency/uncertain-write behavior, and review of the write-path threat model. No production provider credential or live Stripe operation may be used.

## Verification

Automated checks are recorded in the corresponding pull request after execution. Database-backed migration, RLS, concurrency, and staged provider tests require a disposable PostgreSQL database and verified Stripe test tenant, neither of which is asserted by the unit suite.
