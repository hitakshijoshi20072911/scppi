import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postgres from 'postgres'
import { config } from '../platform/config.js'
import { logger } from '../platform/logger.js'

if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations')
const client = postgres(config.DATABASE_URL, { max: 1, prepare: false })
const migrationsFolder = new URL('./migrations', import.meta.url).pathname

try {
  await client`create table if not exists __vendorproof_migrations (name varchar(255) primary key, applied_at timestamptz not null default now())`
  const files = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const [applied] = await client`select name from __vendorproof_migrations where name = ${file}`
    if (applied) continue
    const sql = await readFile(join(migrationsFolder, file), 'utf8')
    await client.begin(async (tx) => {
      await tx.unsafe(sql)
      await tx`insert into __vendorproof_migrations (name) values (${file})`
    })
    logger.info({ migration: file }, 'Database migration applied')
  }
} finally {
  await client.end({ timeout: 5 })
}
