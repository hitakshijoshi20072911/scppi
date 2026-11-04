# VendorProof

**Verified work. Traceable invoices.**

VendorProof is a work-to-invoice reconciliation platform for technical freelancers and software agencies. It is intended to connect engineering delivery evidence with human-approved time records or fixed-price milestones so future invoice lines can be reviewed and traced.

## Current status

Phase 0 foundation is prepared on `feat/foundation-0`. The current implementation includes:

- A Fastify API foundation with request IDs, safe errors, exact-origin CORS, security headers, and health endpoints.
- A minimal Next.js frontend shell intended for Vercel.
- PostgreSQL/Drizzle migration scaffolding with a Phase 0 connectivity sentinel only.
- A root npm workspace with one authoritative `package-lock.json`.
- Vitest backend unit tests, a Playwright browser smoke test, ESLint, Prettier, TypeScript checks, and GitHub Actions CI.
- A Render Blueprint for the API web service. Supabase is the planned database host; the Blueprint does not create a database or background worker.
- Preserved Lenis source under `server/src/lenis`; it is excluded from backend compilation and must be integrated into `apps/web` only in the approved frontend phase.

No production service has been deployed. Authentication, business data models, tenant RLS, provider execution, real worker jobs, and invoice workflows are not implemented. No GitHub or Stripe provider calls or financial operations are part of Phase 0.

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

The application remains a modular monolith. API and future worker processes share one TypeScript codebase and the PostgreSQL database. Provider calls will be added later behind a server-side Swytchcode executor. The frontend never holds provider credentials or calls providers directly.

## Repository structure

- `apps/web/` — Next.js frontend foundation.
- `server/` — Fastify API, future worker entrypoint, Drizzle config, and migrations.
- `packages/shared/` — shared validation contracts and types.
- `docs/` — architecture, deployment, security, operations, testing, and roadmap documentation.
- `server/src/lenis/` — preserved browser-only Lenis source; not backend runtime code.
- `.swytchcode/` — downloaded provider definitions and sandbox configuration; no provider tools are enabled in Phase 0.

## Prerequisites

- Node.js 22.13 or newer.
- npm 10 or newer.
- Docker for the easiest local PostgreSQL setup, or another PostgreSQL instance.
- Git.

Swytchcode CLI and provider authentication are not required for Phase 0.

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
npm audit --omit=dev --audit-level=high
```

The E2E test requires Playwright Chromium; install it with `npx playwright install chromium` if needed. `db:check` is a static Drizzle migration check; it does not test a live database. The Phase 0 migration creates a connectivity sentinel, not the product schema.

See [`docs/phase0-validation.md`](docs/phase0-validation.md) for the latest executed checks and their limits.

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
