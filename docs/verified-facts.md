# VendorProof - Verified Facts

**Purpose:** Record actual verified environment facts for the VendorProof project.

---

## Environment Information

- **Project name:** VendorProof
- **Project path:** c:\swytchcode
- **Node.js version:** v22.19.0
- **npm version:** 10.9.3
- **Swytchcode CLI version:** 2.25.1
- **Project initialisation command:** Already initialised (mode changed from production to sandbox on 2026-11-04)
- **Project mode:** sandbox
- **MCP configuration status:** Configured and verified
- **tooling.json location:** c:\swytchcode\.swytchcode\tooling.json
- **Integration manifest location:** Not yet created (no integrations downloaded)
- **Git repository:** https://github.com/hitakshijoshi20072911/scppi.git (to be initialised)

## Swytchcode Configuration

### tooling.json
```json
{
  "editor": "windsurf",
  "integrations": {},
  "mode": "sandbox",
  "tools": {},
  "version": "2.25.1"
}
```

**Location:** c:\swytchcode\.swytchcode\tooling.json

**Mode:** sandbox (changed from production on 2026-11-04)

**Integrations:** None

**Enabled tools:** None

## MCP Configuration

### Location
%USERPROFILE%\.codeium\windsurf\mcp_config.json

### Configuration
```json
{
  "mcpServers": {
    "swytchcode": {
      "args": ["mcp", "serve", "--project", "c:\\swytchcode"],
      "command": "swytchcode",
      "type": "stdio"
    }
  }
}
```

### Status
- **Transport:** stdio
- **Project path:** c:\swytchcode (explicitly configured on 2026-11-04)
- **Working:** Verified via swytchcode_list and swytchcode_policy

## Architecture Source

### Source Files
- `_planning-input/vendorproof-architecture-part1.md` - Sections 1-6
- `_planning-input/vendorproof-architecture-part2.md` - Sections 7-17

**Note:** Part 2 filename claims Sections 7-28, but actual content ends at Section 17. Sections 18-28 were not provided.

### Architecture Decisions Implemented
- Modular monolith architecture
- TypeScript with Fastify backend
- PostgreSQL with Drizzle ORM
- Manual approved time entries and fixed-price milestones
- AI as classification assistant only
- GitHub as initial work-source candidate
- One financial provider for release one (Stripe preferred)
- Draft-only invoice creation
- Dashboard-only approval
- Server-side Swytchcode executor
- Single-workspace initial operation
- Existing Lenis frontend preservation
- Incremental implementation and migrations

## Current Integrations

- **Installed:** GitHub@1.1.4, Stripe@2026-06-24.dahlia
- **Enabled tools:** None
- **Connected provider accounts:** None

## Provider Verification Status

### GitHub
- **Verification level:** Rung 5 (Canonical IDs and schemas verified)
- **Integration version:** GitHub@1.1.4
- **Methods verified:** github.pull.get, github.pull.commits.get, github.pull.get1, github.commit.get2
- **Canonical IDs:** Verified (see docs/api-inventory.md)
- **Schemas:** Verified (see docs/api-inventory.md and docs/evidence/swytchcode/github/wrekenfile.yaml)
- **Authentication:** oauth2 (not connected)
- **Sandbox execution:** Not yet verified

### Stripe
- **Verification level:** Rung 5 (Canonical IDs and schemas verified)
- **Integration version:** Stripe@2026-06-24.dahlia
- **Methods verified:** stripe.invoice.create, stripe.invoice.get, stripe.invoice.list, stripe.invoiceitem.create, stripe.invoiceitem.get, stripe.invoiceitem.list, stripe.customer.create1, stripe.customer.get
- **Canonical IDs:** Verified (see docs/api-inventory.md)
- **Schemas:** Verified (see docs/api-inventory.md and docs/evidence/swytchcode/stripe/wrekenfile.yaml)
- **Authentication:** api_key (not connected)
- **Sandbox execution:** Not yet verified

### Other Providers
- **Google Drive:** None
- **Slack:** Catalogue mention only
- **Linear:** None
- **QuickBooks Online:** None
- **Time trackers:** None

See `docs/api-inventory.md` for detailed provider matrix.

## Official Documentation References

### Swytchcode
- https://docs.swytchcode.com/
- https://docs.swytchcode.com/cli/projects/
- https://docs.swytchcode.com/cli/integrations/
- https://docs.swytchcode.com/cli/mcp/
- https://docs.swytchcode.com/cli/authentication/
- https://docs.swytchcode.com/configuration/tooling-json/

### Technology Stack
- Fastify: https://fastify.dev/
- PostgreSQL: https://www.postgresql.org/
- Drizzle ORM: https://orm.drizzle.team/
- Zod: https://zod.dev/
- pg-boss: https://github.com/timgit/pg-boss
- PDFKit: https://pdfkit.org/
- Pino: https://getpino.io/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/

## CLI Commands and Outputs

### Integration Download (2026-11-04 20:35)
```powershell
swy get stripe
# Output: saved Stripe/stripe@2026-06-24.dahlia
#          saved 1 bundles for provider "Stripe"

swy get github
# Output: saved GitHub/github@1.1.4
#          saved 1 bundles for provider "GitHub"
```

### Method Inspection (2026-11-04 20:36)
```powershell
swy info github.pull.get
# Output: Schema verified (665 lines truncated)

swy info github.pull.commits.get
# Output: Schema verified (285 lines truncated)

swy info stripe.invoice.create
# Output: Schema verified (504 lines truncated)

swy info stripe.invoice.get
# Output: Schema verified (503 lines truncated)
```

### Environment Diagnostics (2026-11-04)
```powershell
Get-Location
# Output: C:\swytchcode

node --version
# Output: v22.19.0

npm --version
# Output: 10.9.3

swy --version
# Output: swytchcode version 2.25.1

swy whoami
# Output: backend: https://api-v2.swytchcode.com (default)
#          auth: user session
#          email: hitakshijoshi2007.2911@gmail.com
#          session: valid (expires in 40 minutes)

swy doctor
# Output: [backend] https://api-v2.swytchcode.com (default)
#          [tooling_json] tooling.json present and valid JSON
#          [auth] user session present (not expired)
#          All checks passed (no errors)

swy auth status
# Output: No connected accounts. Run `swytchcode auth connect <provider>`

git status
# Output: fatal: not a git repository (or any of the parent directories): .git
```

## Repository Structure

### Current Structure
```
c:\swytchcode\
├── .swytchcode/
│   └── tooling.json
├── apps/
│   └── web/
│       └── README.md
├── server/
│   ├── src/
│   │   ├── api/
│   │   │   └── routes/
│   │   ├── platform/
│   │   ├── db/
│   │   ├── auth/
│   │   ├── domain/
│   │   ├── providers/
│   │   ├── swytchcode/
│   │   └── jobs/
│   ├── tests/
│   └── (package.json to be added)
├── packages/
│   └── shared/
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── scripts/
├── docs/
│   ├── architecture.md
│   ├── api-inventory.md
│   ├── decisions.md
│   ├── tradeoffs-considered.md
│   ├── production.md
│   ├── threat-model.md
│   ├── security-review.md
│   ├── performance-review.md
│   ├── testing-strategy.md
│   ├── verified-facts.md
│   ├── friction-diary.md
│   └── evidence/
│       └── README.md
├── .github/
│   ├── workflows/
│   ├── CODEOWNERS
│   └── dependabot.yml
├── rules.md
├── AGENTS.md
├── SUBMISSION.md
├── README.md
├── .gitignore
├── .editorconfig
├── .gitattributes
├── package.json
└── package-lock.json
```

## Git Status

- **Repository:** Not yet initialised (to be initialised in this bootstrap)
- **Remote:** https://github.com/hitakshijoshi20072911/scppi.git
- **Branch:** main (to be created)

## Account Status

- **Swytchcode email:** [REDACTED for documentation]
- **Authentication:** Valid session
- **Connected provider accounts:** None

---

**Document status:** Verified facts recorded. Environment confirmed. Bootstrap in progress.

