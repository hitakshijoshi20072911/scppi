# VendorProof Development Friction Diary

**Purpose:** Chronological record of setup issues, development friction, and resolutions.

---

## Friction Log

| Date/time | Attempted step | Command/action | Expected result | Actual result/error | Attempts/fix | Resolution status |
|---|---|---|---|---|---|---|
| 2026-11-04 19:05 | Swytchcode environment diagnostics | node --version, npm --version, swy --version, swy whoami, swy doctor, swy auth status | All commands succeed, report versions and status | All commands succeeded. Posthog warnings about shutdown timeout (non-critical). | None required | SUCCESS |
| 2026-11-04 19:05 | Project directory inspection | Checked for .swytchcode/, tooling.json, manifest.json, wrekenfile.yaml | tooling.json exists, others not yet created | tooling.json exists with mode: "production". No integrations downloaded. | None required - expected state | SUCCESS |
| 2026-11-04 19:05 | MCP configuration inspection | Read %USERPROFILE%\.codeium\windsurf\mcp_config.json | Swytchcode server registered with stdio transport | Swytchcode correctly registered, no duplicates | None required | SUCCESS |
| 2026-11-04 19:06 | Swytchcode mode correction | Changed tooling.json mode from "production" to "sandbox" | Project runs in sandbox mode | Successfully changed mode, validated with swy doctor | Backup created before edit | SUCCESS |
| 2026-11-04 19:06 | MCP project path detection | Called swytchcode MCP tools | MCP server detects project root | Initial error: MCP server running from Windsurf install dir instead of project dir | Added --project c:\swytchcode to MCP server args | SUCCESS |
| 2026-11-04 19:07 | MCP verification | Called swytchcode_list and swytchcode_policy | Tools accessible, project detected | Tools accessible, no policies configured (expected) | None required | SUCCESS |
| 2026-11-04 19:07 | Initial documentation structure | Created docs/ folder and documentation files | docs/verified-facts.md and docs/friction-diary.md created | Files created successfully | None required | SUCCESS |
| 2026-11-04 20:00 | Repository structure creation | Created apps/, server/, packages/, scripts/, .github/, docs/evidence/ directories | Directory structure created | All directories created successfully | None required | SUCCESS |
| 2026-11-04 20:00 | Frontend placeholder | Created apps/web/README.md | Frontend placeholder created | File created successfully with preservation notes | None required | SUCCESS |
| 2026-11-04 20:00 | Shared package | Created packages/shared/package.json and src/index.ts | Shared package scaffold created | Files created successfully | None required | SUCCESS |
| 2026-11-04 20:00 | Documentation system | Created 13 documentation files | Comprehensive documentation created | All files created successfully | None required | SUCCESS |
| 2026-11-04 20:00 | Updated verified-facts.md | Replaced generic Swytchcode content with VendorProof-specific information | VendorProof facts recorded | File updated successfully | None required | SUCCESS |

---

## Notes

### Earlier Swytchcode Setup (2026-11-04 19:05 - 19:07)
- Production mode was discovered in the original `tooling.json`
- It was changed to sandbox mode with a backup created
- The MCP process initially did not detect the intended project root
- The project path was added to MCP configuration
- MCP discovery was subsequently reported as working
- No Wrekenfile exists yet because no integration has been downloaded

### Architecture Source
- Architecture Part 1 (Sections 1-6) and Part 2 (Sections 7-17) were read
- Part 2 filename claims Sections 7-28, but actual content ends at Section 17
- Sections 18-28 were not provided in the source material
- Documentation reflects this limitation

### Current Bootstrap (2026-11-04 20:00)
- Repository structure created following approved modular monolith pattern
- Comprehensive documentation system created before implementation
- No friction encountered during bootstrap
- Backend scaffold to be implemented next

---

**Document status:** Friction diary maintained. No unresolvable issues encountered.
