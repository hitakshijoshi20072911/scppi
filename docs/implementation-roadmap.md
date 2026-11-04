# VendorProof Implementation Roadmap

## Phase 0 — Project foundation and production readiness

Establish reproducible workspaces, the Fastify foundation, PostgreSQL/Drizzle migration infrastructure, the minimal Next.js frontend shell, CI, security baseline, and deployment configuration for Vercel plus Render. Preserve the original Lenis source and keep it outside backend compilation.

## Phase 1 — Backend and database

Implement authentication, workspaces, membership, authorization, clients, projects, contracts, time records, milestones, and tenant-scoped repositories.

## Phase 2 — Evidence and reconciliation engine

Verify and integrate read-only GitHub evidence through the approved Swytchcode executor. Implement work-item mapping, deterministic classification, human-approved billing evidence, and reconciliation state transitions.

## Phase 3 — Invoice and approval workflow

Implement approval content hashes, deterministic invoice previews, Stripe test-mode draft invoice creation, idempotency, uncertain-write recovery, and PDF reports. No invoice finalization, sending, charges, refunds, or payouts.

## Phase 4 — Frontend and product experience

Integrate the preserved Lenis implementation into the public/frontend application and build the dashboard, clients, projects, evidence, reconciliation, approval, and draft-invoice experiences.

## Phase 5 — Testing, hardening, and deployment

Complete end-to-end scenarios, security hardening, performance checks, provider verification, production monitoring, backup/restore drills, staging validation, and controlled release.
