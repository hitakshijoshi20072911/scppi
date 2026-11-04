# VendorProof Production Preparation Guide

**Status: preparation instructions only. No production provider accounts, services, domains, database, or credentials were created or tested.** This guide is for a human operator preparing Vercel, Render, and Supabase. It does not authorize live provider connections or financial actions.

## Deployment shape

- **Vercel:** Next.js frontend from `apps/web`.
- **Render:** Fastify API from `server`; a worker is deferred until the queue is implemented.
- **Supabase:** PostgreSQL only. The API connects with `DATABASE_URL`; the browser does not connect directly to Postgres.

See [`deployment.md`](deployment.md) for the architecture and [`operations/runbook.md`](operations/runbook.md) for routine operations.

## Before creating production services

1. Review the Phase 0 branch and its CI results. Merge only through a reviewed pull request. The checked-out branch is `feat/foundation-0`; production must not track this feature branch.
2. Keep development, staging, and production separated. Use separate Supabase projects and secrets. Do not put real customer information in Preview deployments.
3. Decide the desired region, service sizing, availability, recovery objective, domain names, monitoring ownership, and monthly budget. Recheck current plan limits and prices in the provider dashboards; this repository does not set or guarantee total cost.
4. Do not enable Stripe, GitHub, Swytchcode, or other provider credentials yet. The integrations are not authenticated or verified for runtime use.

## 1. Prepare Supabase PostgreSQL

1. Create a Supabase project for staging first. Select a region close to the Render API. Use a strong, unique database password and store it in an approved password manager.
2. Create a separate production project only after staging smoke tests pass. Restrict dashboard membership to the smallest necessary group and enable strong account authentication.
3. In the project **Connect** panel, copy the connection string for the intended connection mode. For a persistent Render service with IPv4-only outbound connectivity, use the **Session pooler** endpoint on port `5432`. Do not use the Transaction pooler for this long-lived backend client. A direct connection is suitable only where the runtime network supports the endpoint's IP version. Use the exact host and username shown by Supabase; percent-encode reserved characters in the database password.
4. Set the full connection string as the Render API's `DATABASE_URL` secret. Do not put it in browser code, a `NEXT_PUBLIC_*` variable, source control, issue text, or logs.
5. The app connects through PostgreSQL, not the Supabase Data API. Do not add Supabase `anon` or `service_role` keys to the frontend for this architecture.
6. Before real data exists, decide on backups. Supabase documents daily backups for Pro, Team, and Enterprise plans with plan-dependent retention; Point-in-Time Recovery is an add-on. Confirm the current plan's actual retention, restore procedure, and cost in the Dashboard. Database backups do not include objects stored through Supabase Storage. Run and record a restore drill before a real launch.

### Migration gate

The repository's only current SQL migration creates a Phase 0 connectivity sentinel. It does not create clients, users, projects, approvals, invoices, tenant policies, or the business schema. `npm run db:check` checks migration metadata; it is not a live connection test. `npm run db:migrate` applies SQL to the database referenced by `DATABASE_URL`.

Do not point the current migration at a production database as a substitute for Phase 1 schema work. For a future release, review the migration, take/verify a backup, run it against a disposable/staging project, verify results, and only then apply it to production through one controlled process. No automatic migration is configured in `render.yaml`.

## 2. Prepare Render API service

1. Connect the GitHub repository to Render and create a Blueprint from `render.yaml` on the reviewed branch. The current Blueprint defines only the API; it does not provision Supabase, a worker, or a database.
2. For staging, the Blueprint currently follows `feat/foundation-0` and selects Render's `free` web-service plan to support smoke testing. This plan is not a production availability recommendation. Before production, merge the approved code to `main`, update the Blueprint branch to `main`, and select an appropriately sized paid plan and region.
3. Set the following environment values for the API service:

   - `NODE_ENV`: `production` for the production service.
   - `HOST`: `0.0.0.0`.
   - `API_CORS_ORIGIN`: the exact HTTPS Vercel production origin (for example `https://app.example.com`). Never use a wildcard with credentials.
   - `DATABASE_URL`: the Supabase Session pooler connection string, saved as a secret.
   - `LOG_LEVEL`: `info` unless a reviewed operational policy requires otherwise.
   - `PORT`: leave to Render's service environment; the app reads the supplied `PORT` and otherwise uses its local default.

4. Use `npm ci --include=dev && npm run build:server` as the build command and `npm run start:api` as the start command. The Blueprint configures `/health/ready` as Render's HTTP health check.
5. Confirm the deployment reports healthy only after the database connection is configured. The readiness handler returns `503` in production when the database is missing or unavailable. It checks connectivity only; it does not prove that business migrations, authentication, RLS, or integrations are complete.
6. Add a Render Background Worker only in the phase that implements and tests durable jobs. Render background workers are separate continuously running services and have a distinct compute plan; the current worker entry point is only a placeholder.

Render environment variable changes require a deploy to take effect. Treat `render.yaml` as configuration, not proof that a service exists. Review the rendered Blueprint changes before applying them.

## 3. Prepare Vercel frontend

1. Import `hitakshijoshi20072911/scppi` as a Vercel project.
2. Set **Root Directory** to `apps/web`, select the Next.js framework preset, and use Node.js 22.13 or newer. Keep the repository's workspace lockfile/install and build configuration in `apps/web/vercel.json`; verify the first Preview build instead of assuming the dashboard defaults are correct.
3. Add only `NEXT_PUBLIC_API_BASE_URL` to the frontend project. Set Production to the HTTPS Render API origin. For Preview, use an isolated staging API; if that is not available, do not expose previews to real users or production data.
4. Remember that any `NEXT_PUBLIC_*` value is included in browser-visible code. Never set database credentials, provider tokens, session secrets, or other secrets in the Vercel frontend project.
5. Configure the custom frontend domain after the production project builds, then add that exact origin to Render's `API_CORS_ORIGIN`. Vercel environment changes apply to new deployments; trigger a fresh deployment after changing values.

## 4. Controlled deployment sequence

1. Pass CI on the release commit: formatting, lint, TypeScript checks, unit tests, Playwright smoke test, application build, migration metadata check, and dependency audit.
2. Deploy staging Vercel and Render services with a staging Supabase project. Confirm the frontend loads, the API responds to `/health/live`, and `/health/ready` reports its database check correctly.
3. Confirm browser requests carry the expected CORS origin and that no secret is present in frontend assets or deployment logs.
4. When Phase 1 has actual schema and integration tests, apply its reviewed migration to staging and verify it using the app's test suite. Do not label the current sentinel migration as production schema validation.
5. After an explicit release review, repeat with separate production resources. Take and verify the required backup first. Monitor Render deploy health, Vercel deployment status, and Supabase database health after cutover.

## 5. Rollback and incident response

- **Frontend/API defect:** promote the last known-good Vercel deployment and redeploy the prior Render commit. Check both services and browser-to-API CORS after rollback.
- **Schema change:** prefer a forward fix. There is no `db:rollback` command in this repository, and an applied migration must not be edited or blindly rerun.
- **Data loss/corruption:** use the Supabase restore process only after identifying the target project and recovery point. Restores can make the project unavailable; schedule downtime, communicate it, and validate the restored database before reopening traffic.
- **Credential exposure:** rotate the affected provider secret in its source and in Render, redeploy, and revoke the old credential. Never paste the exposed value into an issue or this repository.

## Go-live blockers in this codebase

This is **not yet ready for real customer or financial production use**. At minimum, the next phases must implement and verify:

- Authentication, session lifecycle, authorization, tenant isolation, and row-level security.
- VendorProof business tables and reviewed migrations; the present schema is only a Phase 0 sentinel.
- Business APIs, user workflows, audit and invoice logic, and the UI beyond the shell.
- Real PostgreSQL integration tests, including migrations and tenant-isolation tests.
- Verified Swytchcode runtime configuration and provider sandbox tests before any provider credentials are introduced.
- Worker/pg-boss behavior, retries, idempotency, observability, and recovery before background financial jobs exist.
- Security review, secret scanning, backup restoration drills, domain and cookie security, and production smoke tests.

Provider documentation used for these preparation steps: [Vercel monorepos](https://vercel.com/docs/monorepos), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render environment variables](https://render.com/docs/configure-environment-variables), [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Supabase backups](https://supabase.com/docs/guides/platform/backups).
