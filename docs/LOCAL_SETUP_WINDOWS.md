# VendorProof local setup on Windows

This is the supported local path for Windows PowerShell, Windsurf, Node.js `22.23.4`, npm, Docker Desktop, and PostgreSQL 16. VendorProof's PostgreSQL container binds to `127.0.0.1:5433` because another project owns host port `5432`. The Compose project uses its own named volume and does not stop, delete, or modify the other project's container.

## Clean clone

```powershell
git clone https://github.com/hitakshijoshi20072911/scppi.git
cd scppi
git checkout feat/vendorproof-local-and-core-repair
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\dev\setup.ps1
```

The scripts do not require nvm. If Node is missing or reports `v22.19.0` (or any version below `22.23.4`), install the official Windows x64 MSI for Node `22.23.4`: <https://nodejs.org/dist/v22.23.4/node-v22.23.4-x64.msi>. Close and reopen PowerShell afterward. Setup prints both `node --version` and `npm --version` and stops before running npm when the Node version is incompatible.

`setup.ps1` is idempotent. It copies `.env.example` only when `.env` does not exist, adds missing safe defaults without overwriting existing values, starts only the `postgres` service, waits for readiness, and runs the tracked migration chain. It does not print secret values. To install dependencies separately, use `.\scripts\dev\setup.ps1 -SkipInstall` after `npm ci`.

The local roles have separate purposes:

- `DATABASE_URL` is the local development and migration-owner connection. The example uses `postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof`.
- `APP_DATABASE_URL` is reserved for staging/production and must identify the restricted `vendorproof_app` role. The hosted API uses it exclusively when `NODE_ENV` is `staging` or `production`.
- Do not put hosted credentials in `.env`, `.env.example`, frontend variables, Git, or chat.

## Start the applications

Use two PowerShell terminals from the repository root:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

The API is at `http://localhost:3000`; the web app is at `http://localhost:3001`. `setup.ps1` creates `apps/web/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`, so browser requests use the Next.js same-origin `/api` rewrite to the local API. Environment changes require restarting the Next.js dev server. The local session cookie is intentionally named `vendorproof_session` because the `__Host-` prefix requires `Secure`, which is not appropriate for plain HTTP local development. Staging and production use `__Host-vendorproof_session; Secure; Path=/; HttpOnly` and do not weaken that policy.

Check API liveness and readiness:

```powershell
Invoke-WebRequest http://localhost:3000/health/live
Invoke-WebRequest http://localhost:3000/health/ready
Invoke-WebRequest http://localhost:3001/
Invoke-WebRequest http://localhost:3001/api/v1/auth/me
```

The last request is expected to return HTTP `401` from Fastify through the Next.js proxy, not a Next.js `404`.

## Verify the checkout

```powershell
.\scripts\dev\check.ps1
```

The check script validates Compose, PostgreSQL, migrations, repository quality, and database-backed integration tests before checking HTTP services. It does not require the API or frontend for the database tests, but it does require both services for the final health/proxy checks. If the API is not running, it reports: `API is not running. Start npm run dev:api in another terminal and rerun this check.`

For PostgreSQL-backed integration tests against the local `vendorproof` database, the setup script applies migrations with the migration-owner URL and provisions the local-only password for the restricted role. Run the tests with the restricted runtime URL:

```powershell
$env:DATABASE_URL = 'postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof'
$env:APP_DATABASE_URL = 'postgresql://vendorproof_app:vendorproof_app@127.0.0.1:5433/vendorproof'
$env:NODE_ENV = 'test'
npm run test:integration
```

The integration suite creates synthetic records only. It verifies registration/session persistence, workspace and core-record CRUD, approved human time and milestones, two-workspace isolation, and restricted-role/RLS denial. It must never target production or the user's hosted staging database.

## Stop local services

```powershell
docker compose stop postgres
```

Do not use `docker compose down -v` for routine cleanup; that deletes the VendorProof volume. The normal local setup uses the persistent `vendorproof` database; do not point tests at `vendorproof_integration` unless you explicitly create that database in a separate disposable Compose project.

## Provider integrations (verified 2026-11-18)

- GitHub tenant OAuth and Stripe test-mode `saveKey` both work locally through Swytchcode; see `docs/SWYTCHCODE_SETUP.md` for the auth-widget workaround and enabled methods.
- Stripe connection is entered in the browser at `/app/integrations` (test `sk_test_` key only); the API verifies with a bounded `customer.list` read before marking connected.
- Migration `0006_provider_connections.sql` adds the `provider_connection` table; run `npm run db:migrate` after pulling.
