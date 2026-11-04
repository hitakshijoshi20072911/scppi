# Planning Input Traceability Matrix

| Source | Requirement or decision | Phase 0 reflection | Status |
|---|---|---|---|
| `_planning-input/vendorproof-architecture-part1.md` | Modular monolith; human-approved time/milestones; draft-only finance; AI suggestion only | `docs/architecture.md`, `docs/decisions.md`, roadmap | Applied and deferred to later phases |
| `_planning-input/vendorproof-architecture-part2.md` | Server-side executor, provider verification ladder, tenant-aware sessions, deterministic billing | `docs/api-inventory.md`, `docs/threat-model.md`, `docs/deployment.md` | Applied as constraints; implementation deferred |
| `rules.md` | Preserve source, use branches, lock dependencies, test actual behavior, protect secrets | `feat/foundation-0`, root lockfile, CI, `.env.example` | Applied |
| `AGENTS.md` | Read architecture and API inventory before integration work | Audit performed before changes | Applied |
| `pasted_content_2.txt` | Phase 0 must establish frontend/backend foundation, database readiness, CI, deployment plan, and evidence | Phase 0 source/config/docs/tests | In progress; external account setup remains manual |
| Owner deployment direction | Vercel frontend and Render backend | `docs/deployment.md`, `render.yaml`, `apps/web/vercel.json` | Applied as deployment recommendation |
