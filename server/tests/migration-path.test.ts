import { readdir, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('migration path resolution', () => {
  it('converts the migration module URL to the real native migrations directory', async () => {
    const migrationModuleUrl = new URL('../src/db/migrate.ts', import.meta.url)
    const migrationsFolder = fileURLToPath(new URL('./migrations/', migrationModuleUrl))
    const migrationsDirectory = await stat(migrationsFolder)
    const files = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql')).sort()

    expect(isAbsolute(migrationsFolder)).toBe(true)
    expect(migrationsDirectory.isDirectory()).toBe(true)
    expect(files).toEqual([
      '0000_phase0_baseline.sql',
      '0001_phase1_foundation.sql',
      '0002_phase2_evidence_reconciliation.sql',
      '0003_commit_provenance.sql',
      '0004_phase3_invoice_approval.sql',
      '0005_vendorproof_app_rls.sql',
      '0006_provider_connections.sql',
      '0007_two_sided_platform.sql',
      '0008_client_portal_functions.sql',
      '0009_signup_intent.sql',
    ])
  })
})
