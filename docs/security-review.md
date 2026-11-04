# VendorProof Security Review

**Purpose:** Security review register for findings, remediation, and status.

**Current Status:** Phase 0 scoped internal review recorded; no formal or external security audit has been performed.

---

## Review Status

**Scoped internal review only — not a formal security audit**

This register records code and dependency findings from the Phase 0 foundation review. It does not represent penetration testing, a compliance review, or an external audit.

The threat model in `docs/threat-model.md` documents the planned security controls. Remaining implementation gaps and the dependency finding are listed below.

---

## Findings Register

### Critical
| ID | Finding | Evidence | Affected files | Severity | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|---|
| - | No critical findings yet | - | - | - | - | - | - |

### High
| ID | Finding | Evidence | Affected files | Severity | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|---|
| - | No high findings yet | - | - | - | - | - | - |

### Medium
| ID | Finding | Evidence | Affected files | Severity | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|---|
| DEP-001 | Full workspace audit reports four moderate advisories through Drizzle Kit's deprecated esbuild loader; production dependencies audit clean | `npm audit` after clean install, 2026-11-04 | `package-lock.json`, `server/package.json` | Moderate | Track upstream replacement; do not force a breaking downgrade; review before production build changes | Production audit in CI; rerun full audit after toolchain changes | OPEN (development tooling only) |

### Low
| ID | Finding | Evidence | Affected files | Severity | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|---|
| - | No low findings yet | - | - | - | - | - | - |

### Informational
| ID | Finding | Evidence | Affected files | Severity | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|---|
| - | No informational findings yet | - | - | - | - | - | - |

---

## Planned Security Reviews

### Code Review
- **Frequency:** Before each major release
- **Scope:** All code changes since last review
- **Focus:** Authentication, authorisation, input validation, secrets handling, SQL injection, XSS, CSRF

### Dependency Audit
- **Frequency:** Continuous (CI) + weekly review
- **Tool:** npm audit, Snyk, or equivalent
- **Scope:** All dependencies in package.json
- **Action:** Critical and high vulnerabilities must be addressed before merge

### Secret Scan
- **Frequency:** Pre-commit hook + CI
- **Tool:** gitleaks or equivalent
- **Scope:** All files in repository
- **Action:** Any secret found must be removed and rotated before merge

### Penetration Testing
- **Frequency:** Before production deployment
- **Scope:** Full application
- **Focus:** OWASP Top 10, threat model threats
- **Action:** All critical and high findings must be addressed before production

### External Audit
- **Frequency:** Annually or before major production deployment
- **Scope:** Full application and infrastructure
- **Focus:** Compliance, architecture, implementation
- **Action:** All findings must be reviewed and addressed

---

## Security Checklist

Before production deployment:

- [ ] All critical and high findings resolved
- [ ] All medium findings reviewed and accepted or resolved
- [ ] Dependency audit passed (no critical or high vulnerabilities)
- [ ] Secret scan passed (no secrets in repository)
- [ ] Penetration test completed
- [ ] External audit completed (if required)
- [ ] Threat model verified against implementation
- [ ] Security controls verified (authentication, authorisation, tenant isolation, secrets handling)
- [ ] Input validation verified (all endpoints)
- [ ] Output encoding verified (no XSS)
- [ ] SQL injection prevention verified (parameterised queries only)
- [ ] CSRF protection verified (all mutating endpoints)
- [ ] Idempotency verified (all financial operations)
- [ ] Audit integrity verified (hash chain, insert-only)
- [ ] Session security verified (HttpOnly, Secure, SameSite, rotation)
- [ ] Secret rotation procedure documented
- [ ] Incident response procedure documented

---

## Incident Response

### Incident Categories
- **Critical:** Production data breach, financial fraud, system compromise
- **High:** Unauthorised access to tenant data, credential exposure, denial of service
- **Medium:** Security control bypass, minor data exposure, availability impact
- **Low:** Informational security issue, policy violation

### Incident Response Process
1. **Detection:** Alert from monitoring, user report, or security tool
2. **Triage:** Assess severity and impact
3. **Containment:** Immediate actions to limit impact (e.g., revoke credentials, shut down affected systems)
4. **Eradication:** Remove root cause (e.g., patch vulnerability, remove malicious code)
5. **Recovery:** Restore systems and data from backups
6. **Lessons Learned:** Document incident, update procedures, prevent recurrence

### Incident Communication
- **Internal:** Security team, engineering team, management
- **External:** Affected users (if data breach), regulators (if required), public (if significant)

### Incident Retention
- Incident reports retained for 7 years
- Post-incident review retained for 7 years

---

## Compliance

### Data Protection
- **Scope:** Personal data processing, user data, client data
- **Regulations:** GDPR (if EU users), CCPA (if California users), local data protection laws
- **Requirements:** Data minimisation, purpose limitation, data retention, user rights, breach notification

### Financial Regulations
- **Scope:** Invoice generation, financial records
- **Regulations:** Local tax regulations, financial record-keeping requirements
- **Requirements:** Accurate records, audit trail, retention periods

### Industry Standards
- **Scope:** Security practices
- **Standards:** OWASP Top 10, CIS Controls, NIST Cybersecurity Framework
- **Requirements:** Implement controls, regular reviews, continuous improvement

---

**Document status:** Initial security review register created. No findings yet. External audit pending.


## Phase 0 foundation review — 2026-11-04

The Phase 0 implementation adds validated environment configuration, redacted Pino logging, request IDs, exact-origin CORS, Helmet security headers, body-size limits, safe 404/error responses, and backend/frontend separation. These controls are foundation-level only and do not constitute a complete security audit.

Open findings remain: authentication and authorization are not implemented; tenant isolation is documented but not enforced by a database schema; session and CSRF controls are not implemented; provider credentials are not connected; and Swytchcode execution is not implemented. Database startup and migration execution were not testable in the sandbox. The production dependency audit is clean, but the full workspace audit has the moderate development-tool finding above; a dedicated secret scanner and an external security review have not been run.
