# VendorProof

**Verified work. Traceable invoices.**

VendorProof is a work-to-invoice reconciliation platform for technical freelancers and software agencies. It is intended to connect engineering delivery evidence with human-approved time records or fixed-price milestones so future invoice lines can be reviewed and traced.

## Current status

Repository: [hitakshijoshi20072911/scppi](https://github.com/hitakshijoshi20072911/scppi). Phase 1–3 code is merged to `main` (latest audited commit: `95a7ef1` on 2026-11-05). Current source includes PostgreSQL-backed authentication and workspace records; client, project, contract, time-entry, milestone, GitHub evidence/reconciliation, and invoice-preview/review flows; and the public fictional demo. See the phase documents for precise scope.

Verification at the latest Stage 5 read-only audit (2026-11-05): format, lint, server/web typecheck, 49 backend unit tests, 6 Playwright tests, server/web production builds, static migration metadata check, and production dependency audit passed. These local checks do **not** establish that a hosted database is migrated, RLS works under the restricted runtime role, or authenticated CRUD works against staging.

Deployment and provider state must be treated as unverified until checked in the owners' dashboards and against isolated staging. A public GET of the documented Vercel URL returned HTTP 200 during this audit; the documented Render `/health/live` and `/health/ready` requests timed out. No staging migration, restricted-role RLS test, hosted authenticated CRUD, live GitHub OAuth execution, Stripe draft operation, or Google Calendar call was performed. Stripe external writes and PDF export are not implemented; Google Calendar support is not verified. Never use a production database as staging or describe mocks/static checks as provider verification.

The repository contains additive migrations through `0004_phase3_invoice_approval.sql`. The README's previous statement that the schema remained a Phase 0 sentinel is stale. Whether the hosted database has applied these migrations is unknown here. A controlled isolated staging database and rotated credentials are required before remote validation or migrations.

## Architecture

```text
Vercel: apps/web (Next.js)
        │ HTTPS / exact CORS origin
        ▼
Render: Fastify API (server)
        │ DATABASE_URL secret
        ▼
Supabase: PostgreSQL

Render background worker: deferred until durable jobs are implemented
```

The application remains a modular monolith. API and future worker processes share one TypeScript codebase and the PostgreSQL database. Phase 2 exposes a server-side Swytchcode executor injection point and defaults to a fail-closed unavailable executor; direct provider HTTP/SDK calls are prohibited. The frontend never holds provider credentials or calls providers directly.

## Repository structure

- `apps/web/` — Next.js frontend, product landing, demo, authenticated shell, and API-backed management screens.
- `server/` — Fastify API, future worker entrypoint, Drizzle config, and migrations.
- `packages/shared/` — shared validation contracts and types.
- `docs/` — architecture, deployment, security, operations, testing, and roadmap documentation.
- `server/src/lenis/` — preserved browser-only Lenis source; not backend runtime code.
- `.swytchcode/` — downloaded provider definitions and sandbox configuration; downloaded schemas are not proof of authenticated or executed provider calls.

## Prerequisites

- Node.js 22.23.4 (see `.node-version`).
- npm 10 or newer.
- Docker for the easiest local PostgreSQL setup, or another PostgreSQL instance.
- Git.

Swytchcode CLI and provider authentication are not required for Phase 0. Live Phase 2 GitHub ingestion requires a reviewed executor transport and an authorized GitHub connection; the current code safely remains disabled without them.

## Local development

```bash
cp .env.example .env
npm ci
```

If Docker is available:

```bash
docker compose up -d postgres
# Set DATABASE_URL in the ignored .env file to your local database.
npm run db:migrate
```

Start the services in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:3001`. Check `http://localhost:3000/health/live` and `http://localhost:3000/health/ready`.

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
npm run db:check
npm run db:migrate
npm audit --omit=dev --audit-level=high
```

The E2E test requires Playwright Chromium; install it with `npx playwright install chromium` if needed. `db:check` is a static Drizzle migration check; it does not test a live database. The Phase 0 migration creates a connectivity sentinel, not the product schema.

See [`docs/phase0-validation.md`](docs/phase0-validation.md) for Phase 0 validation and [`docs/phase2-implementation.md`](docs/phase2-implementation.md) for Phase 2 scope, current checks, and live-verification blockers.

## Deployment

The planned deployment is Vercel for `apps/web`, Render for the Fastify API, and Supabase for PostgreSQL. No provider service has been created by this repository work. Follow [`docs/deployment.md`](docs/deployment.md), [`docs/production-setup.md`](docs/production-setup.md), [`docs/production.md`](docs/production.md), and [`docs/operations/runbook.md`](docs/operations/runbook.md).

For Vercel, set Root Directory to `apps/web` and configure `NEXT_PUBLIC_API_BASE_URL` separately for Preview and Production. For Render, use the reviewed `render.yaml`, set `API_CORS_ORIGIN` to the exact frontend origin, and store the Supabase `DATABASE_URL` as a secret. Do not put database, Swytchcode, Stripe, GitHub, or session credentials in frontend variables.

## Product and security rules

- GitHub activity is evidence of engineering activity, not proof of hours.
- Hours come from human-entered and approved time records.
- Fixed-price amounts come from explicit milestone records.
- Money is calculated deterministically in integer minor units.
- AI may suggest classifications or descriptions but cannot invent hours or money.
- Human approval precedes financial actions.
- Release-one financial scope is draft invoice creation only; no sending, finalization, charges, refunds, or payouts.
- Tenant isolation and authorization are server responsibilities.

See [`rules.md`](rules.md), [`docs/threat-model.md`](docs/threat-model.md), and [`docs/implementation-roadmap.md`](docs/implementation-roadmap.md).
