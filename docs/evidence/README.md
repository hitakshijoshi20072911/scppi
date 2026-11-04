# Evidence Storage

**Purpose:** Instructions for storing and managing evidence for verification and audit purposes.

---

## What to Store

### Sanitised CLI Output
- Swytchcode CLI command output
- Provider method verification results
- Installation and configuration logs
- Error messages (redacted)

### Screenshots
- Swytchcode catalogue pages
- Provider dashboard screenshots (test accounts only)
- UI screenshots for demos (seeded fake data)
- Error screenshots (redacted)

### Redacted Error Examples
- Error messages with secrets redacted
- Stack traces (no secrets)
- Provider error responses (no secrets)

### Sandbox Execution Evidence
- Swytchcode `swy exec` output (redacted)
- Provider API responses (redacted)
- Test data used (no real client data)

### Test Reports
- Unit test results
- Integration test results
- E2E test results
- Coverage reports

### Build Reports
- Build logs (no secrets)
- Dependency audit results
- Security scan results

### Deployment Evidence
- Deployment logs (no secrets)
- Health check results
- Smoke test results

---

## How to Store

### File Naming
- Use descriptive names
- Include date and context
- Example: `github-verification-2026-11-04-cli-output.txt`
- Example: `stripe-draft-invoice-2026-11-04-response-redacted.json`

### File Format
- Text files for CLI output and logs
- JSON for structured data
- PNG for screenshots
- PDF for reports

### Directory Structure
```
docs/evidence/
├── provider-verification/
│   ├── github/
│   ├── stripe/
│   └── slack/
├── test-results/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── deployment/
│   ├── staging/
│   └── production/
└── demos/
```

---

## Redaction Guidelines

### What to Redact
- API keys
- Authentication tokens
- Session tokens
- Passwords
- Secret keys
- Personal account details
- Client names (unless using fake data)
- Real email addresses
- Real phone numbers
- Internal infrastructure details

### How to Redact
- Replace with `[REDACTED]`
- Replace with `[SECRET]`
- Replace with placeholder values (e.g., `sk_test_1234567890abcdef`)
- Do not leave partial secrets (e.g., `sk_test_1234...`)

### Verification
- Review redacted content before storing
- Ensure no secrets remain
- Use automated secret scanning tools

---

## What NOT to Store

### Never Store
- API keys
- Authentication credentials
- Tokens
- Personal account details
- Real client data
- Real user data
- Unredacted error messages
- Unredacted logs
- Production credentials

### Sensitive Data
- Do not store real client names
- Do not store real project names
- Do not store real contract details
- Use seeded fake data for demos

---

## Evidence Lifecycle

### Creation
- Create evidence when performing verification
- Create evidence when running tests
- Create evidence when deploying
- Create evidence for demos

### Storage
- Store in `docs/evidence/`
- Use appropriate subdirectories
- Follow naming conventions
- Redact sensitive information

### Retention
- Keep evidence for 1 year
- Archive old evidence to cold storage
- Delete evidence older than 1 year

### Access
- Evidence is for verification and audit
- Do not share evidence publicly
- Share evidence only with authorised parties

---

## Evidence for Deliverables

### Swytchcode CLI Exploration
- CLI version output
- Help command output
- Configuration verification

### Integration and Wrekenfile Exploration
- Provider search results
- `swy get` output
- Wrekenfile content (redacted)
- Method verification results

### API Operation Execution
- `swy exec` command
- `swy exec` output (redacted)
- Provider response (redacted)
- Verification results

### Practical Example
- End-to-end workflow screenshots
- API request/response examples (redacted)
- Test results

### Demo Video
- Scripted demo using seeded fake data
- No real client data
- No real credentials
- Stored in external location (link in evidence)

---

## Evidence Review

### Before Storing
- Verify redaction is complete
- Verify no secrets remain
- Verify file naming is correct
- Verify directory structure is correct

### Periodic Review
- Review evidence quarterly
- Archive old evidence
- Delete evidence past retention period
- Update this document if process changes

---

**Document status:** Evidence storage guidelines documented.
