# VendorProof Testing Strategy

**Purpose:** Define testing approach, levels, and quality gates.

## Phase 0 coverage status

Phase 0 currently implements four Fastify health tests and one Playwright frontend smoke test. The CI workflow also runs formatting, lint, type checks, builds, a Drizzle metadata check, and a production-dependency audit. PostgreSQL integration tests, business-flow E2E tests, provider sandbox tests, and production smoke tests are not implemented and must not be reported as passing. The integration script is intentionally absent until a real PostgreSQL test harness is added.

---

## Test Levels

| Level | Scope | Tooling | Label in reports |
|---|---|---|---|
| Unit | Billing engine, rounding, period boundaries, matching, deduplication, state machine, idempotency, permissions, classifier output validation | Vitest | unit (mocked) |
| Integration | Repositories, migrations, RLS, constraints, adapters against a fake executor, job claims | Vitest with real PostgreSQL | integration |
| Contract | Adapter code versus schemas copied from verified Wrekenfiles | Vitest | contract |
| Sandbox | Real Swytchcode calls against test or sandbox accounts | Manual script, evidence recorded | sandbox |
| End to end | Browser through API, using the fake executor by default | Playwright | e2e (fake) or e2e (sandbox) |
| Production | Smoke only, read-only | Smoke script | production-smoke |

**Important:** Production APIs are never the default test target. No test is reported as passed without the command and its output recorded in the pull request.

---

## Unit Testing

### Scope
- Billing engine calculations (rounding, amounts, totals)
- Period boundary calculations
- Matching logic
- Deduplication logic
- State machine transitions
- Idempotency logic
- Permission checks
- Classifier output validation
- Utility functions

### Tools
- **Framework:** Vitest
- **Assertions:** Built-in Vitest assertions
- **Mocking:** Vitest built-in mocking

### Guidelines
- Test pure functions with deterministic inputs and outputs
- Mock external dependencies (database, providers, LLM)
- Test edge cases and error conditions
- Aim for high coverage of business logic

### Billing Test Vectors

Ties round up. Rate is in minor units.

| Case | Input | Expected |
|---|---|---|
| Round up, 15 minutes | 1, 15, 16 minutes | 15, 15, 30 |
| Nearest, 15 minutes | 7, 8, 22, 23 minutes | 0 (flagged zero-rounded), 15, 15, 30 |
| Nearest, 6 minutes, tie | 3 minutes | 6 |
| Amount, half-up | 15 min at rate 12000 | 3000 |
| Amount, half-up | 1 min at rate 100 | 2 |
| Amount, tie | 1 min at rate 30 | 1 |
| Amount, below tie | 1 min at rate 29 | 0, flagged |
| Period boundary, Asia/Kolkata | Merge at 2026-10-31 18:29:59 UTC versus 18:30:00 UTC for [Oct 1, Nov 1) | Included versus excluded |
| Daylight saving | 25-hour day on 2026-11-01 in America/New_York | Items in the repeated hour both belong to that day |
| Hour cap | Entries exceed cap | Reduction appears as its own line; total equals cap amount |

**Note:** A zero-rounded entry is never silently dropped; it is shown for a human decision. Property tests (sum of lines equals total; no float operation anywhere) are added if a property library is approved.

---

## Integration Testing

### Scope
- Repository methods
- Database migrations
- Row-level security (RLS)
- Database constraints
- Adapters against a fake executor
- Job claims and processing

### Tools
- **Framework:** Vitest
- **Database:** Real PostgreSQL (test database)
- **Migrations:** Run migrations up and down in tests

**Phase 0 status:** Planned, not implemented. No integration configuration or live PostgreSQL test database is present yet.

### Guidelines
- Use real PostgreSQL, not mocks
- Create fresh database for each test run
- Test migrations up and down
- Test RLS with two-workspace suites
- Test constraints with invalid data
- Test job processing with pg-boss

---

## Contract Testing

### Scope
- Adapter code versus schemas copied from verified Wrekenfiles
- Input validation against Wrekenfile schemas
- Output validation against Wrekenfile schemas

### Tools
- **Framework:** Vitest
- **Schemas:** Zod schemas generated from Wrekenfile schemas

### Guidelines
- Generate Zod schemas from verified Wrekenfile schemas
- Test adapter input validation
- Test adapter output validation
- Test error handling for invalid provider responses

---

## Sandbox Testing

### Scope
- Real Swytchcode calls against test or sandbox accounts
- Provider method verification
- End-to-end provider workflows

### Tools
- **Framework:** Manual scripts
- **Evidence:** Recorded in `docs/evidence/`

### Guidelines
- Run only after provider methods are verified
- Use sandbox or test accounts only
- Record all CLI output and responses
- Store evidence in `docs/evidence/`
- Never use production accounts for testing

---

## End-to-End Testing

### Scope
- Browser through API
- Full user workflows
- Using fake executor by default

### Tools
- **Framework:** Playwright
- **Browser:** Chromium, Firefox, WebKit
- **Executor:** Fake executor (default), real executor (sandbox tests)

### Guidelines
- Test critical user workflows
- Test error conditions
- Test with fake executor by default
- Sandbox E2E tests only after provider verification
- Test cross-browser compatibility

### E2E Scenario
Create client; add project with contract and scope rules; connect a test repository; import work items; enter and approve time entries; run reconciliation; review AI suggestions; approve; create a draft invoice in provider test mode; verify the invoice read back and the audit report hash. Every step asserts persisted state, not only screen text.

---

## Production Smoke Testing

### Scope
- Read-only operations against production
- Health checks
- Critical path verification

### Tools
- **Framework:** Smoke script
- **Environment:** Production (read-only)

### Guidelines
- Run only after production deployment
- Test read-only operations only
- Verify health endpoints
- Verify critical paths are functional
- Record results in deployment documentation

---

## Security and Abuse Testing

### Scope
- Unauthenticated access to every route
- Two-workspace cross access on every route and ID parameter
- Malformed and oversize bodies
- SQL injection strings
- Stored XSS strings in work item titles
- Prompt-injection corpus (instruction override, role claims, hidden text, requests for amounts)
- Duplicate approval from two sessions at once
- Repeated invoice creation
- Approval then edit then execute
- Replayed idempotency key with changed body
- Seeded fake secret never present in logs, errors, or prompts
- Removed-member session
- Expired approval
- Slack signature and replay tests (when section 10.2 is built)

### Tools
- **Framework:** Vitest, Playwright
- **Corpus:** Test fixtures for injection strings

### Guidelines
- Test every route for unauthorised access
- Test every ID parameter for cross-workspace access
- Test input validation with malformed data
- Test SQL injection with injection strings
- Test XSS with stored XSS strings
- Test prompt injection with injection corpus
- Test idempotency with replay attacks
- Test session security with removed member and expired approval

---

## Quality Gates in CI

### Current Phase 0 checks

The executable CI checks are defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): format, lint, type check, unit tests, Playwright smoke test, build, `npm run db:check`, and `npm audit --omit=dev --audit-level=high`.

### Planned checks for later phases

Add real PostgreSQL integration and migration tests when the first business schema and repository code are implemented. Add contract and sandbox tests only after the associated provider methods are verified. Add production smoke tests only after a production environment exists. Do not make successful no-DB checks stand in for those test levels.

### Gate Rules
- A pull request cannot merge with any gate red
- Every fixed bug adds a regression test where practical
- Security findings must be addressed before merge
- Critical and high dependency vulnerabilities must be addressed before merge

---

## Test Data Management

### Test Data
- Use seeded fake data for consistency
- Do not use real client data in tests
- Do not use real credentials in tests
- Sanitise any real data before use in tests

### Test Database
- Create fresh database for each test run
- Clean up after each test run
- Use transactions for rollback where possible
- Isolate test data from development data

### Test Fixtures
- Store test fixtures in `server/tests/fixtures/`
- Use descriptive names for fixtures
- Document fixture purpose and usage
- Keep fixtures minimal and focused

---

## Test Documentation

### Test Results
- Record test results in pull requests
- Record command and output for each test
- Record evidence for sandbox and production tests
- Store evidence in `docs/evidence/`

### Test Coverage
- Aim for high coverage of business logic
- Do not chase 100% coverage for its own sake
- Focus on critical paths and error conditions
- Review coverage gaps and justify exclusions

---

## Test Maintenance

### Test Updates
- Update tests when features change
- Update tests when bugs are fixed
- Update test fixtures when data models change
- Remove obsolete tests

### Test Review
- Review tests in code review
- Review test coverage in code review
- Review test quality in code review
- Review test performance in code review

---

**Document status:** Phase 0 unit and browser smoke tests exist; the later-phase integration, contract, sandbox, security-abuse, and production test suites remain planned.
