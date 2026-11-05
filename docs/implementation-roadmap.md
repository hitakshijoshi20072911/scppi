# VendorProof Implementation Roadmap

## Phase 0 — Project foundation and production readiness

Establish reproducible workspaces, the Fastify foundation, PostgreSQL/Drizzle migration infrastructure, the minimal Next.js frontend shell, CI, security baseline, and deployment configuration for Vercel plus Render. Preserve the original Lenis source and keep it outside backend compilation.

## Phase 1 — Backend and database

Implement authentication, workspaces, membership, authorization, clients, projects, contracts, time records, milestones, and tenant-scoped repositories.

## Phase 2 — Evidence and reconciliation engine (backend implemented; live verification pending)

Verify and integrate read-only GitHub evidence through the approved Swytchcode executor. Implement work-item mapping, deterministic classification, human-approved billing evidence, and reconciliation state transitions.

**2026-11-05 status:** The backend routes, migrations, guarded provider adapter/executor boundary, deterministic classification, versioned reconciliation transitions, failed-source retry, and human decision workflow are implemented on `feat/phase-2-evidence-reconciliation`. Automated checks pass. Live GitHub execution, OAuth connection flow, and PostgreSQL migration/RLS integration tests are blocked in the current sandbox; see [`docs/phase2-implementation.md`](phase2-implementation.md) for exact boundaries and next steps. Phase 2 must not be marked production-ready until those external checks pass.

## Phase 3 — Invoice and approval workflow

Implement approval content hashes, deterministic invoice previews, Stripe test-mode draft invoice creation, idempotency, uncertain-write recovery, and PDF reports. No invoice finalization, sending, charges, refunds, or payouts.

## Phase 4 — Frontend and product experience

Integrate the preserved Lenis implementation into the public/frontend application and build the dashboard, clients, projects, evidence, reconciliation, approval, and draft-invoice experiences.

## Phase 5 — Testing, hardening, and deployment

Complete end-to-end scenarios, security hardening, performance checks, provider verification, production monitoring, backup/restore drills, staging validation, and controlled release.
