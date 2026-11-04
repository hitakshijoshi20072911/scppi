import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { config } from '../platform/config.js'
import { logger } from '../platform/logger.js'

if (!config.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations')
}

const client = postgres(config.DATABASE_URL, { max: 1 })
const db = drizzle(client)

try {
  await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
  logger.info('Database migrations applied')
} finally {
  await client.end({ timeout: 5 })
}
