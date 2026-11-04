# Instructions for AI Coding Agents

**Purpose:** Guide for Manus, Windsurf, Claude, and other AI coding agents working on VendorProof.

---

## Before Starting Work

**You must read these documents in order:**

1. **`rules.md`** - The canonical engineering constitution for this repository
2. **`docs/architecture.md`** - The approved system architecture
3. **`docs/decisions.md`** - Architectural decisions and their rationale
4. **`docs/api-inventory.md`** - Provider method verification status
5. **Relevant documentation** - Any docs specific to your task (e.g., `docs/testing-strategy.md` for test work)

---

## Your Responsibilities

### Before Making Changes

1. **Read `rules.md`** - This is mandatory. Do not skip this.
2. **Understand the architecture** - Read `docs/architecture.md` to understand the system.
3. **Check existing decisions** - Read `docs/decisions.md` to understand architectural choices.
4. **Inspect the code** - Read the actual files you will modify.
5. **Understand dependencies** - Know what depends on what you're changing.
6. **Check existing tests** - Ensure tests exist and understand what they test.
7. **State your plan** - Explain what you will change and why before making changes.

### While Making Changes

1. **Keep changes scoped** - Only change what is necessary for the task.
2. **Follow the architecture** - Don't silently change the approved architecture.
3. **Write tests** - Add or update tests for your changes.
4. **Update documentation** - Keep docs in sync with code changes.
5. **Follow security rules** - Never compromise security for convenience.
6. **Follow Swytchcode rules** - Only use verified methods; never invent canonical IDs.
7. **Preserve the frontend** - Don't rewrite the Lenis frontend design system.

### After Making Changes

1. **Run tests** - Run all relevant tests and report results.
2. **Run quality checks** - Run lint, typecheck, format check.
3. **Report what changed** - List all files modified.
4. **Report test results** - Report actual command output, not "all tests passed".
5. **Report any issues** - Be honest about errors or unresolved risks.
6. **Update documentation** - Ensure docs reflect the changes.

---

## What You Must Never Do

### Security Violations

- **Never hard-code secrets.** Use environment variables.
- **Never commit `.env` files.** They must be in `.gitignore`.
- **Never expose secrets to frontend.** Frontend must not have secrets.
- **Never ask users to paste secrets.** Use secure credential flows.
- **Never write secrets to logs.** Use redaction.

### Swytchcode Violations

- **Never call providers directly.** Use the Swytchcode executor.
- **Never invent canonical method IDs.** Use IDs from downloaded Wrekenfiles.
- **Never invent integration schemas.** Use schemas from downloaded Wrekenfiles.
- **Never enable tools without approval.** Tool changes require human review.
- **Never change sandbox mode.** Sandbox mode must be preserved during development.
- **Never use production credentials for testing.** Use test/sandbox accounts only.

### Architecture Violations

- **Never silently change the architecture.** Architectural changes must be documented in `docs/decisions.md`.
- **Never introduce microservices without approval.** Follow the modular monolith pattern.
- **Never add unnecessary infrastructure.** Prefer simpler solutions.
- **Never duplicate business logic.** Keep logic in domain services.

### Frontend Violations

- **Never rewrite the Lenis frontend.** Preserve the design system.
- **Never change fonts, colours, or components without documentation.** Explain why a change is necessary.
- **Never add secrets to frontend code.** Frontend must not have secrets.

### Testing Violations

- **Never say "all tests passed" without running them.** Run tests and report actual output.
- **Never skip tests.** All changes must have tests.
- **Never commit broken code.** Ensure tests pass before committing.

---

## What You Must Always Do

### Before Starting

- **Read `rules.md`.** This is not optional.
- **Read the architecture.** Understand the system before changing it.
- **Check provider verification status.** See `docs/api-inventory.md` before using any provider method.
- **Understand the task scope.** Work on one milestone at a time.

### While Working

- **Validate inputs.** Use Zod schemas for all API inputs.
- **Scope database queries.** Always filter by workspace_id.
- **Use transactions for related changes.** Ensure data consistency.
- **Handle errors explicitly.** Don't let errors propagate silently.
- **Log with correlation IDs.** Use structured logging with correlation IDs.
- **Write idempotent code.** Ensure operations can be safely retried where appropriate.

### After Working

- **Run the quality workflow.** Format, lint, typecheck, test, build.
- **Report actual results.** Don't fabricate test results.
- **Update documentation.** Keep docs in sync with code.
- **Record friction.** Update `docs/friction-diary.md` if you encounter issues.

---

## Special Instructions for Manus

When working on VendorProof, Manus must:

1. **Read `rules.md` first.** This is your primary instruction.
2. **Read the milestone specification.** Understand what the milestone requires.
3. **Read the relevant architecture sections.** Understand how your work fits into the system.
4. **Implement incrementally.** Don't try to do everything at once.
5. **Test as you go.** Don't wait until the end to test.
6. **Report progress.** Keep the user informed of your progress.
7. **Ask for clarification.** If something is unclear, ask before assuming.

---

## Special Instructions for Swytchcode Work

When working with Swytchcode integrations:

1. **Check `docs/api-inventory.md`.** Verify the provider method is verified before using it.
2. **Never invent a canonical ID.** Only use IDs from downloaded Wrekenfiles.
3. **Never invent a schema.** Only use schemas from downloaded Wrekenfiles.
4. **Use the executor.** All Swytchcode calls must go through `server/src/swytchcode/executor.ts`.
5. **Validate responses.** Don't trust exit codes alone; validate response data.
6. **Handle failures explicitly.** Don't retry financial writes blindly.
7. **Record executions.** Write to `provider_execution` table.
8. **Never enable tools without approval.** Tool changes require human review and CODEOWNERS approval.

---

## Special Instructions for Financial Work

When working with financial operations:

1. **Never create charges or refunds.** Only draft invoice creation in release one.
2. **Never finalise or send invoices automatically.** User must approve.
3. **Never retry financial writes blindly.** Unknown outcomes must enter manual reconciliation.
4. **Always use content hashes.** Freeze approved invoice data with a hash.
5. **Always revalidate before execution.** Revalidate the hash before executing the financial write.
6. **Always use idempotency keys.** Prevent duplicate invoices.
7. **Always audit financial actions.** Record all financial actions in the audit log.
8. **Never let AI approve financial operations.** Financial operations require human approval.

---

## Special Instructions for AI Classification

When working with AI classification:

1. **AI is a suggestion only.** AI never approves classifications.
2. **Human must approve ambiguous items.** AI-suggested items require human review.
3. **Never let AI see money or hours.** AI only sees work item text and scope rules.
4. **Never let AI create amounts.** All money calculation is deterministic.
5. **Validate AI output.** Use Zod schemas to validate AI responses.
6. **Handle injection attempts.** Reject prompt injection attempts.
7. **Store AI suggestions.** Store as `ai_suggestion`, never as approved.
8. **Never let AI trigger writes.** AI has no tools and no database access.

---

## Special Instructions for Frontend Work

When working with the frontend:

1. **Preserve the Lenis design system.** Don't rewrite the existing design.
2. **Preserve fonts and typography.** Don't change fonts without documentation.
3. **Preserve colours.** Don't change the colour system without documentation.
4. **Preserve components.** Don't rewrite components without documentation.
5. **Preserve Lenis scrolling.** Don't change Lenis configuration without documentation.
6. **Use shared types.** Use types from `packages/shared`.
7. **Never call providers directly.** All provider calls go through the backend API.
8. **Never have secrets.** Frontend must not have secrets or tokens.

---

## When You're Stuck

If you encounter a blocker:

1. **Stop and explain.** Don't guess or make assumptions.
2. **Provide evidence.** Show the error, the stack trace, the relevant code.
3. **Propose options.** Suggest possible ways forward.
4. **Ask for clarification.** If something is unclear, ask.
5. **Document the issue.** Record the blocker in `docs/friction-diary.md`.

---

## Quality Checklist

Before declaring a task complete, verify:

- [ ] I have read `rules.md`
- [ ] I have read the relevant architecture documentation
- [ ] I have inspected the files I modified
- [ ] I have added or updated tests
- [ ] I have run all tests and they pass
- [ ] I have run lint and it passes
- [ ] I have run typecheck and it passes
- [ ] I have run the build and it succeeds
- [ ] I have updated relevant documentation
- [ ] I have reported what changed
- [ ] I have reported test results
- [ ] I have not introduced security vulnerabilities
- [ ] I have not introduced secrets
- [ ] I have not changed the architecture without documentation
- [ ] I have not changed the frontend design without documentation
- [ ] I have not enabled Swytchcode tools without approval

---

**Document status:** Agent instructions established. All agents must read this before starting work.
