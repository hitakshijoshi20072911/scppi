# Supabase Free Plan — Backup, Migration and Deployment Guide

Verified against live projects on 2026-11-19 (Supabase CLI 3.2.0).

## Projects

| Display name        | Project ref               | Region        | Plan | Status         | Postgres |
| ------------------- | ------------------------- | ------------- | ---- | -------------- | -------- |
| venderproof-test    | `opffskvpzppozdpjahze`    | ap-south-1    | Free | ACTIVE_HEALTHY | 17.11    |
| venderproof-staging | `lmvxfopnczeuxgxugoxe`    | ap-southeast-1| Free | ACTIVE_HEALTHY | 17.11    |

## Why manual backups are required

Supabase Free has **no scheduled project backups**. The supported recovery
path is a manual logical export with `supabase db dump`. A single default dump
is incomplete: it excludes table data, cluster roles, and Supabase-managed
schemas (`auth`, `storage`, `extensions`). Three dumps are required per project.

## Backup procedure (executed 2026-11-19)

```powershell
supabase db dump --remote=<project-ref> -f schema.sql          # schema only
supabase db dump --remote=<project-ref> --data-only -f data.sql # table data
supabase db dump --remote=<project-ref> --role-only -f roles.sql # cluster roles
```

Backups are stored outside the repository at
`%USERPROFILE%\VendorProofBackups\<project-ref>\<timestamp>\` with
`checksums.sha256` and `backup-metadata.txt`. Never commit or upload them.

Verified result: schema/data restored into disposable local `vendorproof_restore`
— all 19 public application tables and staging rows (2 users, 2 workspaces,
1 project, 3 migration records) recovered. Restore errors were limited to
Supabase-managed roles (`anon`, `authenticated`, `service_role`, `supabase_*`)
and the `extensions` schema, which do not exist in plain PostgreSQL and are
not needed by VendorProof.

Limitations: logical dumps do not include Supabase Storage objects, Auth
users, or role passwords. `vendorproof_app` must be recreated by the reviewed
migrations; its password is provisioned separately as a protected credential.

## Remote migration state (verified via dumps)

Both projects have only `0000`–`0002` applied. Pending: `0003`–`0009`
(7 migrations). Staging contains real user/workspace/session rows; test is
nearly empty. Do not assume identical ledgers — always dump first.

## Migration plan (pending owner authorization)

1. Confirm fresh backups exist for the target project and restore-rehearsed.
2. Create restricted role: `vendorproof_app` (non-superuser, no BYPASSRLS) via
   migration `0005` mechanics; store its password as a Render secret.
3. Run `DATABASE_URL=<owner-connection> npm run db:migrate` from `server/`
   against the target — the runner is idempotent and records
   `public.__vendorproof_migrations`.
4. Verify ledger shows 10 rows; verify `vendorproof_app` RLS denies cross-
   workspace access with a test query.
5. Set Render `APP_DATABASE_URL` to the restricted role; never put the owner
   credential in `APP_DATABASE_URL`.

Expected ledger after full apply: `0000_phase0_baseline` …
`0009_signup_intent` (10 rows).

## Connection strings (Render)

- Prefer Supabase **Session Pooler** (port 5432, user `postgres.<ref>`) for the
  long-running API; avoid Transaction Pooler (6543) — session-local
  `set_config` RLS context requires session semantics.
- Direct `db.<ref>.supabase.co` is IPv6-only on Free; use the pooler if the
  Render network cannot reach it.
- Always SSL (`sslmode=require`).

## Environment separation

| Variable                | Where      | Value                                  |
| ----------------------- | ---------- | -------------------------------------- |
| `DATABASE_URL`          | migrations | owner credential, never runtime        |
| `APP_DATABASE_URL`      | Render API | restricted `vendorproof_app`           |
| `NEXT_PUBLIC_API_BASE_URL` | Vercel  | API base only — never secrets/DB       |
| `SWYTCHCODE_TOKEN`      | Render API | server API key                         |
| `API_CORS_ORIGIN(S)`    | Render API | exact Vercel origin(s)                 |

Preview deployments must point at a preview/staging API and staging DB only;
production points at production API/DB only. No `NEXT_PUBLIC_*` may contain
credentials.
