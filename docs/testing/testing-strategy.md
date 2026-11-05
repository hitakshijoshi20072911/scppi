

## Stage 3 verification ladder

Mocked tests cover the allowlisted runtime methods, sanitized provider failures, bounded pull-request pagination, bounded commit pagination, commit metadata reduction, duplicate-safe persistence paths, reconciliation transitions, and access control. These tests do not prove provider authentication or live GitHub access.

Live staging tests must be run separately with an owner-provided Swytchcode token and completed GitHub OAuth consent. They should use a read-only repository, verify the workspace tenant and mapped account, read one pull request and its associated commits, rerun the same sync to confirm deduplication, exercise a retry and partial-ingestion path, and confirm that no commit becomes a time entry.

PostgreSQL tests must apply migrations `0000` through `0003` to a disposable database. They must inspect table/index/foreign-key structure, forced RLS, policies, table ownership, effective grants, `rolsuper`, and `rolbypassrls`. Cross-tenant reads and writes must run as the restricted application role with transaction-local `app.workspace_id`; a superuser result is not sufficient evidence. Staging migration is additive only after those tests pass.
