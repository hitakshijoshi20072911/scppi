# VendorProof Production Runbook

**Purpose:** Single source of truth for production setup and deployment.

**Status:** NOT DEPLOYED

---

## Current Deployment Status

**NOT DEPLOYED** - This is an initial architecture document. No production deployment has been performed.

---

## Environments

| Environment | Purpose | Swytchcode mode | Provider credentials |
|---|---|---|---|
| development | Local development | sandbox | Local test accounts |
| staging | Pre-production testing | sandbox | Test accounts |
| production | Live production | production | Production accounts |

**Important:** Swytchcode's `sandbox` mode is distinct from the web application's `APP_ENV`. Do not assume that local CLI authentication automatically works in a deployed server.

---

## Frontend/Backend Architecture

### Frontend
- **Location:** `apps/web/`
- **Framework:** Lenis scrolling frontend (to be integrated)
- **Deployment:** Static files served from CDN or reverse proxy
- **Build command:** `npm run build` (to be determined after frontend integration)

### Backend
- **Location:** `server/`
- **Framework:** Fastify (TypeScript)
- **Processes:** Two entry points from one codebase
  - API: `npm run start:api`
  - Worker: `npm run start:worker`
- **Deployment:** Container image with CLI binary and `.swytchcode/` directory

---

## Container Hosting Requirements

### Base Image
- Node.js v22 or compatible
- Ability to install additional binaries
- Persistent filesystem or mounted volume for `.swytchcode/`

### Swytchcode CLI Installation
The Swytchcode CLI binary must be installed in the container. Installation method to be verified against official documentation.

### Directory Structure
```
/app
  /server
  /node_modules
  /.swytchcode/
    tooling.json
    integrations/
```

---

## Database Hosting

### Database
- **Type:** PostgreSQL
- **Version:** To be determined (latest stable release)
- **Hosting:** Managed PostgreSQL service (e.g., RDS, Neon, Supabase)
- **Requirements:**
  - Support for partial unique indexes
  - Support for row-level security
  - Connection pooling
  - Automated backups
  - Point-in-time recovery

### Migrations
- **Tool:** Drizzle ORM with SQL migrations
- **Command:** `npm run db:migrate` (to be implemented)
- **Rollback:** `npm run db:rollback` (to be implemented)
- **Discipline:**
  - Migrations are plain SQL files
  - Migrations are reviewable in version control
  - Migrations are tested against empty database and previous schema
  - Migrations that modify data are reversible

---

## Build and Start Commands

**Note:** These commands will be implemented during the backend foundation milestone. Current values are placeholders.

### Development
```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm run test

# Start API (development)
npm run dev:api

# Start worker (development)
npm run dev:worker
```

### Production
```bash
# Install dependencies
npm ci

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm run test

# Start API (production)
npm run start:api

# Start worker (production)
npm run start:worker
```

---

## Environment Variables

### Application Environment
- `APP_ENV` - `development`, `staging`, or `production`
- `PORT` - API server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session cookie signing

### Swytchcode Configuration
- `SWYTCHCODE_TOKEN` - Swytchcode account token (from secret manager)
- **Important:** Do not use local CLI authentication in production. Use `SWYTCHCODE_TOKEN` as a process environment secret.

### Provider Credentials
**Note:** Provider-specific environment variables will be added after provider verification at Milestone 2.

**Stripe (if verified):**
- `STRIPE_SECRET_KEY` - Stripe API secret key (test or production based on APP_ENV)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (when webhooks are added)

**GitHub (if verified):**
- `GITHUB_TOKEN` - GitHub personal access token (read-only)

**Google Drive (if verified):**
- `GOOGLE_DRIVE_CREDENTIALS` - Google Drive service account credentials

**Slack (if verified):**
- `SLACK_BOT_TOKEN` - Slack bot token
- `SLACK_SIGNING_SECRET` - Slack signing secret (for interactive callbacks)

### LLM Configuration
**Note:** LLM provider selection is pending approval.

- `LLM_PROVIDER` - LLM provider (e.g., openai, anthropic)
- `LLM_API_KEY` - LLM API key
- `LLM_MODEL` - Model identifier

### Logging
- `LOG_LEVEL` - Log level (default: `info`)
- `LOG_FORMAT` - Log format (default: `json`)

---

## Swytchcode Production Configuration Requirements

### Authentication
- **Development:** `swy login` device flow, provider accounts connected with `swy auth connect` against sandbox or test accounts only
- **Server:** `SWYTCHCODE_TOKEN` as a process environment secret; provider credentials supplied as environment variables from secret manager
- **Important:** The encrypted managed store is not relied on in containers because a container filesystem is ephemeral

### Mode
- **Development/Staging:** `sandbox` mode in `tooling.json`
- **Production:** `production` mode in `tooling.json` (only after verification)

### Tool Configuration
- `.swytchcode/tooling.json` must be committed to version control
- Generated integration manifests must be reviewed before committing
- Changes to trusted tool configuration require human review and CODEOWNERS approval

---

## Provider Credentials

### Credential Storage
- **Location:** Secret manager (e.g., AWS Secrets Manager, HashiCorp Vault)
- **Injection:** Environment variables at container startup
- **Rotation:** Documented in this file; each credential has an owner and rotation date

### Credential Separation
- Separate values for staging and production
- Stripe test key only outside production
- Never use production credentials in development or staging

### Credential Verification
- Financial adapter refuses to run if `APP_ENV` is not production and the configured Stripe key does not carry the test-mode prefix
- Financial adapter refuses to run if `APP_ENV` is production and the key does not carry the production prefix

---

## HTTPS

### Requirement
- HTTPS required in production
- HTTP allowed only in development

### Configuration
- TLS termination at reverse proxy or load balancer
- HSTS header enabled
- Secure flag on cookies

---

## CORS and Origin Configuration

### Development
- If frontend and API are on different origins during development, configure CORS with exact origins

### Production
- Frontend and API share one origin behind a reverse proxy (preferred)
- If separate origins, configure CORS with exact origin allowlist
- Never use wildcard with credentials

---

## Health Checks

### Endpoints
- `/healthz` - Liveness check (unauthenticated)
- `/readyz` - Readiness check (unauthenticated)

### Liveness Check
- Returns 200 if server process is running
- No internal details exposed

### Readiness Check
- Returns 200 if all dependencies are ready
- Returns 503 if any dependency is not ready
- Dependencies to check:
  - Database connection
  - Swytchcode CLI availability
  - (Future) Provider connections

### Implementation
- Health checks must not expose stack traces, credentials, connection strings, or internal infrastructure details
- Health checks must be honest about readiness (do not report ready if database is not connected)

---

## Monitoring

### Metrics to Collect
- Request rate and latency
- Error rate by endpoint
- Database query performance
- Provider API call rate and latency
- Worker job queue depth
- Worker job success/failure rate
- Memory and CPU usage

### Logging
- Structured logging with Pino
- Correlation IDs on all requests and jobs
- Log levels: error, warn, info, debug
- Redaction of secrets (authorization headers, cookies, tokens, fields named secret/key/token)

### Alerts
- High error rate
- High latency
- Database connection failures
- Provider API failures
- Worker job failures
- Low disk space

---

## Logs

### Log Retention
- Development: 7 days
- Staging: 30 days
- Production: 90 days (or as required by compliance)

### Log Storage
- Centralised log service (e.g., CloudWatch, Datadog, Loki)
- Logs shipped from container via log agent

### Log Redaction
- Pino redaction list covers:
  - Authorization headers
  - Cookies
  - Tokens
  - Any field named secret, key, or token
- Unit test asserts redaction

---

## Backups

### Database Backups
- Automated daily backups
- Point-in-time recovery enabled
- Backups encrypted at rest
- Backup retention: 30 days (or as required by compliance)

### Report Storage
- Database is authoritative
- Drive copy is convenience backup
- Drive upload failure is non-blocking

### Backup Verification
- Regular restore tests
- Backup integrity checks

---

## Recovery

### Disaster Recovery
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 24 hours (based on backup frequency)

### Recovery Steps
1. Restore database from most recent backup
2. Deploy latest container image
3. Verify health endpoints
4. Run smoke tests
5. Monitor for errors

---

## Rollback

### Database Rollback
- Migrations are reversible
- Rollback command: `npm run db:rollback`
- Test rollback in staging before production

### Application Rollback
- Deploy previous container image
- No database rollback if schema is compatible
- If schema incompatible, rollback database migration first

### Rollback Verification
- Run smoke tests after rollback
- Monitor for errors
- Verify data integrity

---

## Secret Rotation

### Swytchcode Token
- **Owner:** Infrastructure team
- **Rotation frequency:** Quarterly
- **Procedure:**
  1. Generate new token in Swytchcode dashboard
  2. Update secret manager
  3. Restart containers
  4. Verify functionality
  5. Revoke old token after 24 hours

### Provider Credentials
- **Owner:** Platform team
- **Rotation frequency:** Provider-specific (typically 90 days)
- **Procedure:**
  1. Generate new credentials in provider dashboard
  2. Update secret manager
  3. Restart containers
  4. Verify functionality
  5. Revoke old credentials after 24 hours

### Session Secret
- **Owner:** Platform team
- **Rotation frequency:** Annually
- **Procedure:**
  1. Generate new secret
  2. Update secret manager
  3. Restart containers
  4. Existing sessions will be invalidated (acceptable)

---

## Data Retention

### Financial Records
- Approved runs: 7 years (tax requirement)
- Invoice lines: 7 years (tax requirement)
- Approvals: 7 years (tax requirement)
- Audit events: 7 years (tax requirement)

### Work Evidence
- Work items: 2 years
- Time entries: 7 years (tax requirement)
- Milestones: 7 years (tax requirement)

### Reports
- Reports: 7 years (tax requirement)

### AI Suggestions
- AI suggestions: 90 days (can be purged, keeping hashes)

### Account Deletion
- Export first
- Purge everything except records under financial retention rule
- State which financial records remain and why

---

## Known Uncertainties

### Swytchcode Production Authentication
- **Uncertainty:** Whether `SWYTCHCODE_TOKEN` is the correct production authentication mechanism
- **Verification required:** Re-read primary Swytchcode documentation before production deployment
- **Mitigation:** Document the verified approach in this file before production use

### Per-Workspace Credential Selection
- **Uncertainty:** Whether Swytchcode supports per-workspace credential selection on a server
- **Current decision:** Single-workspace initial operation
- **Verification required:** Verify before enabling multi-tenancy
- **Mitigation:** Document the verified approach before multi-tenant deployment

### Provider Idempotency Mechanisms
- **Uncertainty:** Whether Stripe and other providers support idempotency keys
- **Verification required:** Read Wrekenfiles at Milestone 2
- **Mitigation:** Document idempotency support in `docs/api-inventory.md`

---

## Deployment Checklist

Before deploying to production:

- [ ] All tests pass (unit, integration, E2E)
- [ ] Security audit passed (no critical or high vulnerabilities)
- [ ] Dependency audit passed
- [ ] Secret scan passed
- [ ] Database migrations tested in staging
- [ ] Rollback procedureed in staging
- [ ] Health endpoints verified
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Log aggregation configured
- [ ] Backup verification completed
- [ ] Disaster recovery procedure documented
- [ ] Secret rotation procedure documented
- [ ] Swytchcode production authentication verified
- [ ] Provider credentials verified (test vs production)
- [ ] HTTPS configured
- [ ] CORS configured correctly
- [ ] HSTS enabled
- [ ] Session security reviewed

---

**Document status:** Initial production runbook created. Deployment not yet performed. Verification required before production use.
