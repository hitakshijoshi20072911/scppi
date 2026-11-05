# VendorProof Operations Runbook

**Status:** Operational instructions for the Phase 0 foundation only. No hosted environment has been provisioned.

## Local startup

1. Copy `.env.example` to `.env`; keep `.env` out of Git.
2. If Docker is installed, start local PostgreSQL with `docker compose up -d postgres`.
3. Set `DATABASE_URL` to the local database and run `npm run db:migrate` when you need to validate the connectivity sentinel.
4. Start the API and web app in separate terminals with `npm run dev:api` and `npm run dev:web`.
5. Check `http://localhost:3000/health/live`, `http://localhost:3000/health/ready`, and `http://localhost:3001`.

`npm run db:check` validates Drizzle migration metadata only. It does not connect to PostgreSQL. The current sandbox used for the Phase 0 review had no Docker or `psql`, so the live migration has not been verified there.

## Hosted topology

- Vercel runs the Next.js application from `apps/web`.
- Render runs the Fastify API as a web service.
- Supabase hosts PostgreSQL; its connection string is provided to Render as the `DATABASE_URL` secret.
- Do not provision a Render database. The current Blueprint does not define one.
- Do not provision a Render worker until a durable queue and real worker workload exist.

## Render API service

Use `render.yaml` as the Blueprint, then review the changes Render proposes. Configure `API_CORS_ORIGIN` to the exact HTTPS frontend origin, `DATABASE_URL` with the Supabase Session pooler string appropriate for the Render network, and `SWYTCHCODE_TOKEN` only after its approved OAuth connection is complete. Keep credentials in Render's secret environment settings, not in the Blueprint or logs. The `/health/ready` endpoint should return a failure when production database connectivity is missing or unavailable.

The Blueprint branch is `main`; its free plan is only for smoke tests. Before production, choose a production-appropriate paid plan and verify region, auto-deploy settings, exact CORS origin, and secret values.

## Vercel frontend

Set the Vercel project Root Directory to `apps/web`, use Node.js 22.13 or newer, and configure `NEXT_PUBLIC_API_BASE_URL` separately for Preview and Production. This value is visible to the browser and must contain only the public API origin. Preview should use isolated non-production resources. Never set database, provider, or session secrets in Vercel frontend variables.

## Supabase database

Create separate staging and production projects. Use the project Dashboard's **Connect** panel for connection details. For a persistent Render backend on IPv4-only networking, use the Session pooler mode, not Transaction pooler mode. Store the connection string only in Render and protected migration environments. Confirm backup retention and restore procedures in the selected Supabase plan; run a restore drill before production data is stored.

## Release checks

Before a deploy, run the repository quality workflow and review any migration. Do not run migrations automatically from `render.yaml`. Back up the target database before applying a production schema change. After deployment, check the Vercel build, Render deploy health, `/health/live`, `/health/ready`, and a browser-to-API smoke test. These checks do not verify authentication, RLS, business flows, or provider APIs.

## Rollback

- Vercel: promote the previous known-good deployment.
- Render: redeploy the previous known-good commit.
- Database: prefer a forward fix. No `db:rollback` script currently exists. Use a tested Supabase restore only when necessary and expect downtime.
- After rollback, check API readiness, frontend/API CORS, data consistency, and logs before reopening traffic.

For the full provider setup sequence and current go-live blockers, see [`../production-setup.md`](../production-setup.md).
