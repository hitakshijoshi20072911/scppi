# Phase 1 implementation

Phase 1 adds the persistent backend foundation without implementing provider integrations, reconciliation, invoices, or the full dashboard.

## Implemented scope

- PostgreSQL users, workspaces, memberships, sessions, clients, projects, contracts, time entries, milestones, and append-only audit events.
- Tenant-owned tables carry `workspace_id`; project, contract, time-entry, and milestone relationships use workspace-aware foreign keys.
- Registration creates a default workspace and owner membership atomically. Passwords are stored as salted, memory-hard scrypt hashes. Sessions are opaque, stored as hashes, revocable, seven-day absolute expiry, and transported in an HttpOnly `__Host-` cookie.
- Roles are centralized as owner, admin, and member. Owner-only membership management and owner/admin write and approval permissions are enforced server-side.
- Contract, time-entry, and milestone status transitions are explicit endpoints. Approved and accepted records cannot be edited through generic status changes.
- Important changes write append-only audit events with actor, workspace, entity, request ID, and before/after JSON where applicable.

## API surface

Authentication: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`.

Service status: `GET /` returns a non-sensitive service identity and links to `/health/live` and `/health/ready`. The API strips one trailing slash from `API_CORS_ORIGIN` so a Render environment value such as `https://frontend.example/` still produces the browser-correct exact origin `https://frontend.example`.

Workspace and membership: `POST /api/v1/workspaces`, `GET/POST /api/v1/workspaces/:workspaceId/members`.

Tenant resources: `GET/POST /api/v1/workspaces/:workspaceId/clients`, `/projects`, `/contracts`, `/time-entries`, and `/milestones`, plus audit reads at `/audit-events`.

Lifecycle actions: contract `activate` and `complete`; time-entry `submit`, `approve`, and `reject`; milestone `complete` and `accept`.

All request bodies are strict Zod schemas. Unknown tenant records return not-found behavior rather than revealing cross-workspace existence.

## Migration and verification

`npm run db:migrate` applies sorted committed SQL files once each and records them in `__vendorproof_migrations`. The Phase 1 migration is `server/src/db/migrations/0001_phase1_foundation.sql`. Do not point this command at an unverified production database.

The current automated checks cover password/session primitives, protected-route rejection, existing health behavior, formatting, lint, TypeScript, and production builds. A real PostgreSQL integration suite and staging deployment still require an available isolated database and the existing Render/Supabase credentials; no claim is made that those live checks have run in this environment.
