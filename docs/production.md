# VendorProof Production Runbook

**Status: NOT DEPLOYED.** This repository contains a Phase 0 foundation only. No production deployment, hosted database, provider authentication, or production smoke test has been performed.

## Current target

- Next.js frontend: Vercel, project root `apps/web`.
- Fastify API: Render web service.
- PostgreSQL: Supabase, connected from the server using `DATABASE_URL`.
- Background worker: deferred until queue processing is implemented and tested.

The exact provider preparation steps are in [`production-setup.md`](production-setup.md). The topology and repository configuration are described in [`deployment.md`](deployment.md). Do not treat either document as evidence that an account or service exists.

## Current operational facts

- `npm run build:server` builds the API and placeholder worker.
- `npm run start:api` starts the HTTP service. `npm run start:worker` is not yet a production job processor.
- `/health/live` is a process liveness endpoint.
- `/health/ready` verifies a database connection when configured. In production, missing or unreachable `DATABASE_URL` makes readiness fail. It does not verify authentication, business schema, RLS, or providers.
- `npm run db:check` checks Drizzle migration metadata. `npm run db:migrate` applies migrations to the configured database. The current migration creates only a connectivity sentinel.
- There is no rollback migration command. Use forward-only migrations and a tested database restore only when required.
- The Render Blueprint uses a free plan for smoke testing. Select a suitable paid plan and merge a reviewed release to `main` before production.

## Release checklist

Before any real customer data is accepted:

- [ ] Merge reviewed code to the chosen production branch after CI passes.
- [ ] Create separate staging and production Supabase projects and platform secrets.
- [ ] Verify Supabase connection mode, TLS, password URI encoding, and restore plan.
- [ ] Apply only a reviewed, tested application schema migration; the Phase 0 sentinel is not product schema.
- [ ] Configure Render `DATABASE_URL` and exact `API_CORS_ORIGIN`; verify `/health/ready`.
- [ ] Configure Vercel `NEXT_PUBLIC_API_BASE_URL` for Production and isolated Preview environments.
- [ ] Verify domain, HTTPS, CORS, application logs, and secret non-disclosure.
- [ ] Complete authentication, tenant isolation/RLS, integration testing, and security review.
- [ ] Verify a Supabase backup restore and record the result before storing production records.
- [ ] Keep Stripe/GitHub/Swytchcode credentials disabled until their methods, scopes, and sandbox flows are verified and approved.

## Rollback

For an application-only regression, redeploy the last known-good Vercel and Render releases. For schema issues, prefer a forward migration. If restoring Supabase data is necessary, select the correct project and point-in-time, schedule the outage, restore, and validate before reopening traffic. Never edit a migration that has already run or retry a financial write blindly.

A successful health check or CI build does not make the application production-ready. The Go-live blockers are listed in [`production-setup.md`](production-setup.md#go-live-blockers-in-this-codebase).
