# VendorProof

**Verified work. Traceable invoices.**

VendorProof is a deliverable reconciliation and invoice preparation platform for technical freelancers, consultants, fractional CTOs, and small software agencies.

It connects software development activity, contractual scope, approved billing evidence, and financial systems into an auditable reconciliation workflow.

---

## Status

**Architecture Initialised** - This is the initial repository bootstrap. The application is not yet built.

---

## Quick Start

### Prerequisites

- Node.js v22 or higher
- npm 10 or higher
- Swytchcode CLI 2.25.1 or higher

### Installation

```bash
npm install
```

### Development

```bash
# Start API server
npm run dev:api

# Start worker
npm run dev:worker

# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

---

## Architecture

VendorProof uses a modular monolith architecture with:

- **TypeScript** with strict mode
- **Fastify** for the backend API
- **PostgreSQL** as the system of record
- **Drizzle ORM** and SQL migrations
- **Zod** for validation
- **pg-boss** for persistent background jobs
- **PDFKit** for report generation
- **Pino** for structured logging
- **Vitest** for unit and integration tests
- **Playwright** for browser-level testing

See [docs/architecture.md](docs/architecture.md) for complete architecture documentation.

---

## Documentation

- [docs/architecture.md](docs/architecture.md) - Complete system architecture
- [docs/api-inventory.md](docs/api-inventory.md) - Provider method verification register
- [docs/decisions.md](docs/decisions.md) - Architectural decision register
- [docs/tradeoffs-considered.md](docs/tradeoffs-considered.md) - Trade-off documentation
- [docs/production.md](docs/production.md) - Production runbook
- [docs/threat-model.md](docs/threat-model.md) - Threat model
- [docs/security-review.md](docs/security-review.md) - Security review register
- [docs/performance-review.md](docs/performance-review.md) - Performance review
- [docs/testing-strategy.md](docs/testing-strategy.md) - Testing strategy
- [docs/verified-facts.md](docs/verified-facts.md) - Verified environment facts
- [docs/friction-diary.md](docs/friction-diary.md) - Development friction log
- [rules.md](rules.md) - Engineering rulebook (read before making changes)
- [AGENTS.md](AGENTS.md) - Instructions for AI coding agents

---

## Project Structure

```
vendorproof/
├── apps/web/          # Frontend (Lenis scrolling - to be integrated)
├── server/            # Backend API and worker
│   ├── src/
│   │   ├── api/       # API routes
│   │   ├── platform/  # Config, logger, errors
│   │   ├── db/        # Database (to be implemented)
│   │   ├── auth/      # Authentication (to be implemented)
│   │   ├── domain/    # Domain services (to be implemented)
│   │   ├── providers/ # Provider adapters (to be implemented)
│   │   ├── swytchcode/ # Swytchcode executor (to be implemented)
│   │   └── jobs/      # Background jobs (to be implemented)
│   └── tests/
├── packages/shared/   # Shared types and validation
├── docs/              # Documentation
└── .swytchcode/       # Swytchcode configuration
```

---

## Swytchcode Integration

This project uses Swytchcode for external API execution. The project is configured in sandbox mode.

**Important:** No provider integrations have been downloaded yet. Integrations will be added after the product idea is finalised and providers are verified.

See [docs/api-inventory.md](docs/api-inventory.md) for the current verification status of providers.

---

## Engineering Rules

**Before making changes, read [rules.md](rules.md).**

All AI coding agents (Manus, Windsurf, Claude) must read the engineering rulebook before making any changes.

---

## Current Limitations

- No actual product integrations yet
- No Wrekenfiles yet
- No provider credentials connected
- No invoice functionality yet
- No production deployment yet
- No completed security audit yet
- No completed performance audit yet
- Frontend integration pending the Lenis source

---

## License

To be determined.

---

## Contributing

To be determined.

