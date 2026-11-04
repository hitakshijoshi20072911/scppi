# VendorProof Architectural Decisions

**Purpose:** Record architectural decisions, their rationale, and revisit conditions.

---

## Decision Register

| ID | Date | Decision | Reason | Alternatives | Status | Revisit condition |
|---|---|---|---|---|---|---|
| D001 | 2026-11-04 | VendorProof as the chosen product | Deliverable reconciliation and invoice preparation platform for technical freelancers | Other product ideas | APPROVED | Product pivot |
| D002 | 2026-11-04 | Modular monolith architecture | Single codebase with API and worker processes, avoiding microservice complexity | Microservices, serverless | APPROVED | Scale requirements justify microservices |
| D003 | 2026-11-04 | TypeScript and Fastify for backend | Type safety, schema-first API, easy testing, not tied to frontend framework | Express, NestJS, Go, Rust | APPROVED | Performance requirements exceed TypeScript capabilities |
| D004 | 2026-11-04 | PostgreSQL and Drizzle ORM | Transactions, partial unique indexes, row locks for idempotency; reviewable SQL migrations | MySQL, MongoDB, Prisma, TypeORM | APPROVED | Multi-region active-active requirements |
| D005 | 2026-11-04 | Manual approved time entries and fixed-price milestones | Removes unverifiable input (hours) from automated sources; keeps amounts traceable to human decisions | Time tracker integration only, automated inference from commits | APPROVED | Time tracker methods verified and approved |
| D006 | 2026-11-04 | AI as classification assistant only | AI suggests categories but never approves; human must approve ambiguous classifications | AI as primary classifier, fully automated billing | APPROVED | Legal liability framework changes |
| D007 | 2026-11-04 | GitHub as initial work-source candidate | Evidenced in Swytchcode catalogue; common for technical work | Linear only, GitLab only, manual entry only | APPROVED | GitHub methods fail verification |
| D008 | 2026-11-04 | One financial provider for release one | Reduces integration surface; Stripe preferred due to test mode and catalogue evidence | Multiple financial providers, manual invoice export | APPROVED | Stripe fails verification; QuickBooks verified first |
| D009 | 2026-11-04 | Draft-only invoice creation | Removes risk of accidental charges or sends; user must approve before any financial write | Automatic finalisation, automatic sending | APPROVED | Legal requirement for automatic invoicing |
| D010 | 2026-11-04 | Dashboard-only approval | Simplifies approval workflow; avoids webhook signature complexity in release one | Slack interactive approval, email approval | APPROVED | Slack interactive approval verified and approved |
| D011 | 2026-11-04 | Private, hash-verified audit reports | Database is authoritative; Drive is convenience copy; hash detects tampering | Drive as only storage, immutable blockchain | APPROVED | Regulatory requirement for immutable storage |
| D012 | 2026-11-04 | Server-side Swytchcode executor | Single module controls all Swytchcode calls; enforces allowlist, validation, timeouts | Browser-side calls, direct provider SDKs | APPROVED | Swytchcode provides browser-safe runtime |
| D013 | 2026-11-04 | Single-workspace initial operation | Per-workspace credential selection not yet verified in Swytchcode | Full multi-tenant from day one | APPROVED | Swytchcode per-workspace credential selection verified |
| D014 | 2026-11-04 | Existing Lenis frontend preservation | Preserves design investment; avoids rework | Rewrite with new framework | APPROVED | Lenis frontend cannot be adapted |
| D015 | 2026-11-04 | Incremental implementation and migrations | Reduces risk; allows testing at each milestone | Implement all 21 tables upfront | APPROVED | Timeline requires faster initial delivery |
| D016 | 2026-11-04 | pg-boss for background jobs | Durable jobs without a second datastore; uses same Postgres | Redis, BullMQ, SQS | APPROVED | Job volume exceeds Postgres capacity |
| D017 | 2026-11-04 | Zod for validation | Shared schemas between frontend and backend; runtime type checking | Joi, Yup, class-validator | APPROVED | Zod maintenance discontinued |
| D018 | 2026-11-04 | PDFKit for report generation | Pure JavaScript, no headless browser to patch | Puppeteer, Playwright, wkhtmltopdf | APPROVED | PDFKit cannot handle required formatting |
| D019 | 2026-11-04 | Pino with redaction for logging | Structured logs with correlation IDs; safe redaction of secrets | Winston, Bunyan | APPROVED | Pino maintenance discontinued |
| D020 | 2026-11-04 | Vitest and Playwright for testing | Modern test runners; real Postgres in integration tests | Jest, Cypress | APPROVED | Test framework limitations discovered |
| D021 | 2026-11-04 | Server-side sessions in Postgres | Revocable on sign-out; no session store dependency | JWT-only, Redis sessions | APPROVED | Session volume requires Redis |
| D022 | 2026-11-04 | Content hash for approval freeze | Detects any change to approved invoice before execution | Version number only, no hash | APPROVED | Hash collision concerns outweighed by simplicity |
| D023 | 2026-11-04 | Draft_unknown state for uncertain outcomes | Prevents blind retries of financial writes; requires manual resolution | Automatic retry, immediate failure | APPROVED | Provider guarantees idempotency |
| D024 | 2026-11-04 | Row-level security as second isolation layer | Defense in depth; catches missing workspace filters | Application-layer filtering only | APPROVED | RLS performance impact unacceptable |
| D025 | 2026-11-04 | Insert-only audit events with hash chain | Detects tampering; provides audit trail | Mutable audit log, external audit service | APPROVED | Regulatory requirement for specific audit format |

| D026 | 2026-11-04 | Vercel frontend, Render API, Supabase PostgreSQL deployment target | Separates the Next.js frontend from persistent API hosting and managed PostgreSQL while retaining the modular monolith | All services on one host, serverless API, self-hosted database | APPROVED (target only; not deployed) | Provider capability, cost, security, or availability needs change |
| D027 | 2026-11-04 | Phase 1 uses application-managed opaque sessions and scrypt password hashes | Keeps sessions revocable in PostgreSQL and uses Node's maintained, memory-hard password primitive without custom cryptography | JWT-only sessions, plaintext credentials, unmaintained auth package | APPROVED | Supabase Auth is explicitly adopted or a dedicated maintained auth library is selected |
| D028 | 2026-11-04 | Committed SQL migrations are applied by a small tracked migration runner | The bootstrap Drizzle journal was empty while the repository already contained a baseline SQL file; applying sorted, recorded SQL files preserves reviewability and clean-database execution | Ignoring existing SQL, manually editing applied migrations, speculative ORM generation | APPROVED | Drizzle metadata is regenerated from the complete Phase 1 schema |
---

## Decisions Requiring Approval

The following decisions are marked as APPROVED in this bootstrap but may require explicit user approval before implementation:

- **D005:** Manual approved time entries and fixed-price milestones (time tracker integration deferred)
- **D006:** AI as classification assistant only (AI vendor selection pending)
- **D009:** Draft-only invoice creation (no automatic finalisation or sending)
- **D010:** Dashboard-only approval (Slack interactive approval deferred)
- **D013:** Single-workspace initial operation (multi-tenancy deferred until Swytchcode verified)

---

## Decisions Requiring Provider Verification

The following decisions depend on successful provider verification at Milestone 2:

- **D007:** GitHub as initial work-source (requires GitHub methods verification)
- **D008:** One financial provider for release one (requires Stripe or QuickBooks verification)
- **D012:** Server-side Swytchcode executor (requires Swytchcode runtime verification)
- **D013:** Single-workspace initial operation (requires Swytchcode per-workspace credential selection verification)

If verification fails, these decisions will be revisited and alternatives will be considered.

---

## Bootstrap Decisions

The following decisions were made during initial repository setup and are implementation scaffolding:

- Repository structure follows the approved modular monolith pattern
- Documentation system created before implementation
- Engineering rulebook established to guide AI agents
- Minimal runnable backend created to prove the foundation
- Git repository initialised with proper hygiene
- GitHub repository connection established

These are not changes to the approved architecture but implementation scaffolding decisions.

---

**Document status:** Initial decisions recorded. Revisit conditions documented.
