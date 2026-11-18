# Swytchcode Setup — Verified Local State (2026-11-18)

## CLI

- `swy` v2.27.0, logged in, workspace `swytchcode` (`92622744-0922-42dc-adfc-0a53359eb770`), project path `C:\swytchcode`, sandbox mode.
- Installed bundles: `GitHub@1.1.4`, `Stripe@2026-06-24.dahlia`. Google Calendar bundle not installed.
- `.swytchcode/integrations/manifest.json` sets `sandbox_endpoint` to `https://api.github.com` and `https://api.stripe.com` so sandbox calls hit the real provider endpoints.

## Enabled methods (`.swytchcode/tooling.json`)

- GitHub (read-only): `github.pull.get`, `github.pull.commits.get`
- Stripe (read-only): `stripe.customer.list`, `stripe.customer.get`, `stripe.invoice.list`, `stripe.invoice.get`
- Stripe write methods (`customer.create`, `invoice.create`, `invoiceitem.*`) remain disabled pending explicit approval and the reviewed draft path.

## Tenant connections

- Tenant id = VendorProof workspace id (`f1b9ea20-ed63-4530-ab4c-420450140e51` locally).
- GitHub: OAuth via Swytchcode WorkOS flow; verified with real `pull.get`/`pull.commits.get` on `hitakshijoshi20072911/scppi`.
- Stripe: `sk_test_` key stored via runtime `saveKey`; verified with bounded `stripe.customer.list` (`limit: 1`). Never commit keys.

## Known platform issues

- `auth.swytchcode.com` widget double-exchanges the single-use state token (React StrictMode) → "link already used". Workaround: manual session/authorize/confirm calls (see `docs/friction-diary.md`).
- `--json` output escapes `&` as `\u0026`; hand-copied authorization URLs break unless decoded.
- `@swytchcode/runtime` `exec()` returns `{data, request, status_code}`; `server/src/swytchcode/executor.ts` unwraps `.data` before adapter validation.

## Server requirements

- `SWYTCHCODE_TOKEN` in root `.env` for server-side runtime calls (never commit).
- API routes: `server/src/api/routes/integrations.ts` (Stripe connect/verify/disconnect/list), `server/src/api/routes/phase2.ts` (GitHub map/connect/verify/disconnect).
- State table: `provider_connection` (migration `0006`), RLS-enabled.
- All provider calls go through `server/src/swytchcode/executor.ts` or the audited `stripe-draft` adapter and are recorded in `provider_execution` / `audit_event`.

## Hosted deployment notes

- `APP_DATABASE_URL` (restricted `vendorproof_app` role) must be set for staging/production; `DATABASE_URL` remains the migration owner.
- Swytchcode tenant ids are workspace ids — the same flow works on hosted environments once `SWYTCHCODE_TOKEN` and provider tenant connections exist there.
- Stripe keys must be entered per environment through the Integrations UI; never reuse the local test key.
