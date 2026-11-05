# VendorProof Deployment Architecture

**Status: planned, not deployed.** The repository contains deployment configuration scaffolding only. No Vercel, Render, or Supabase project has been created or connected by this work.

## Target topology

```text
Browser
  │ HTTPS
  ▼
Vercel: Next.js frontend (apps/web)
  │ NEXT_PUBLIC_API_BASE_URL; exact-origin CORS
  ▼
Render: Fastify API (server)
  │ DATABASE_URL held as a Render secret
  ▼
Supabase: managed PostgreSQL
```

The API and future background worker remain processes from the same TypeScript modular monolith. The worker is intentionally not provisioned yet: the current worker entry point is a placeholder and the pg-boss job system is not implemented. Add a Render Background Worker in a later phase, once it has real queue work and operational tests. Do not run long-lived API or worker processes as Vercel Functions.

## Current implementation and status

- `apps/web/` contains a minimal Next.js shell, not the complete VendorProof product UI.
- `server/` contains the Fastify foundation and health endpoints, not business APIs or authentication.
- `server/src/db/migrations/0000_phase0_baseline.sql` creates only a Phase 0 connectivity sentinel. It is not the VendorProof business schema.
- `render.yaml` defines the API web service only. It prompts for `DATABASE_URL` and the exact CORS origin; it does not create a database or worker.
- `apps/web/vercel.json` contains the framework build/install commands. The Vercel project must use the repository as the Git source and `apps/web` as its Root Directory.

These facts mean the code is suitable for the next implementation phase, not a live financial product deployment. See [`production-setup.md`](production-setup.md) for provider preparation and go-live blockers.

## Vercel frontend

Create a Vercel project for the repository and set **Root Directory** to `apps/web`. Keep the Next.js framework preset and Node.js 22.13 or newer. The app-specific `vercel.json` uses the root npm workspace lockfile and builds `@vendorproof/web`; verify the first Preview deployment before promoting any release.

Set `NEXT_PUBLIC_API_BASE_URL` separately by environment. It is intentionally public and must contain only the HTTPS API origin, for example `https://api.example.com` (no credentials or path required). Point Preview deployments only at a non-production API and dataset. If no isolated staging API exists yet, do not use preview deployments with real customer data.

Never set `DATABASE_URL`, session secrets, `SWYTCHCODE_TOKEN`, Stripe keys, or GitHub credentials in a `NEXT_PUBLIC_*` variable. Vercel applies environment-variable changes to new deployments, not already-built deployments. See [Vercel monorepo deployment](https://vercel.com/docs/monorepos), [build configuration](https://vercel.com/docs/builds/configure-a-build), and [environment variables](https://vercel.com/docs/environment-variables).

## Render API

`render.yaml` defines `vendorproof-api` as a Node web service. It builds with `npm ci --include=dev && npm run build:server`, starts with `npm run start:api`, and checks `GET /health/ready`. The current `free` plan is for smoke testing only; choose an appropriate paid plan and region before a production launch. Do not accept the default plan as a production availability or recovery commitment.

Set these service variables in Render:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `API_CORS_ORIGIN=https://<the-exact-vercel-production-origin>`
- `DATABASE_URL=<Supabase PostgreSQL connection string>` as a secret
- `LOG_LEVEL=info`
- `SWYTCHCODE_TOKEN=<rotated Swytchcode service token>` as a secret

Render supplies `PORT` for the web service. Do not hardcode secrets in `render.yaml`; its `sync: false` entries are prompts for dashboard values. Use one exact browser origin for CORS; do not use `*` with credentials. See [Render Blueprints](https://render.com/docs/blueprint-spec), [environment variables and secrets](https://render.com/docs/configure-environment-variables), and [health checks](https://render.com/docs/health-checks).

### Swytchcode runtime and GitHub connection
The API uses the pinned `@swytchcode/runtime` and `swytchcode` packages. The production executor remains fail-closed when `SWYTCHCODE_TOKEN` is absent. It accepts only the verified GitHub read methods, derives `tenantId` from the authenticated workspace on the server, passes bounded provider parameters through the Runtime SDK, and applies the SDK's 90-second subprocess timeout. It never calls GitHub directly or falls back to the application's own account.

Complete the one-time GitHub provider connection from a laptop with a browser, not from a headless Render shell:

```bash
git clone https://github.com/hitakshijoshi20072911/scppi.git
cd scppi
npm ci
export SWYTCHCODE_TOKEN='your-rotated-service-token'
npx swytchcode auth connect github
# Select the downloaded <github> library when prompted, then approve GitHub OAuth.
npx swytchcode auth status
```

Do not paste the service token, GitHub password, or OAuth code into chat. The provider consent must finish successfully before claiming live GitHub evidence ingestion. Afterward, set the same rotated service token as the Render `SWYTCHCODE_TOKEN` secret and redeploy. If the CLI reports `setup_required`, the Swytchcode workspace owner must first complete `swy auth connect github`; if it reports `tenant_not_connected`, the signed-in VendorProof workspace still needs its workspace-level connection flow.

The Blueprint currently follows `feat/foundation-0` so it can be previewed from this branch. Before production, merge a reviewed release to `main` and update the Blueprint service branch to `main`. Confirm the service's selected region, plan, auto-deploy policy, and environment before its first production deploy.

## Supabase PostgreSQL

Supabase is the planned managed PostgreSQL host. Retrieve the connection string from the Supabase Dashboard's **Connect** panel; do not construct pooler hostnames or usernames manually. For a persistent Render backend on an IPv4-only path, use the Supabase **Session pooler** string (port 5432). Do not use Transaction pooler mode for this long-lived PostgreSQL client. Use the dashboard-provided direct connection only from environments with supported network access. If the database password contains reserved characters, percent-encode it in the URI.

Store the connection string only in Render as `DATABASE_URL` and in a protected migration environment when needed. The frontend does not connect directly to Postgres. The current migration command is `npm run db:migrate`; `npm run db:check` validates Drizzle migration metadata but does not connect to or migrate a live database.

Supabase's backup retention and restore options depend on its plan. Select a plan whose backup window and recovery objective fit the data, and perform a restore drill before handling real customer or financial records. Daily database backups do not include objects held in Supabase Storage. See [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres) and [database backups](https://supabase.com/docs/guides/platform/backups).

## Release and rollback discipline

1. Develop on a feature branch and require the CI checks before merge.
2. Use separate Preview/staging and Production variables, database projects, and customer data. Never point Preview at the production database.
3. Back up the target database and review the SQL migration before applying it. Migrations are not run automatically by the Render Blueprint.
4. Apply a migration once through a controlled release step, then deploy the compatible API and verify `/health/live`, `/health/ready`, and the frontend smoke test.
5. For an application-only issue, roll back the app to the last known-good deployment. Prefer forward-only database migrations; do not edit or re-run a migration that has already been applied.
6. Use a tested Supabase restore procedure only when a database restore is necessary; coordinate downtime and verify the restored project before routing traffic.

The readiness endpoint checks database connectivity when `DATABASE_URL` is configured. It does not verify authentication, business-table migrations, RLS, provider connections, or financial workflows. A healthy endpoint is not a production-readiness certification.

## Official platform references

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render environment variables and secrets](https://render.com/docs/configure-environment-variables)
- [Render health checks](https://render.com/docs/health-checks)
- [Render background workers](https://render.com/docs/background-workers)
- [Supabase PostgreSQL connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
