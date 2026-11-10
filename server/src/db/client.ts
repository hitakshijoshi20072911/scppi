import postgres from 'postgres'
import { config } from '../platform/config.js'

let sql: ReturnType<typeof postgres> | undefined
export type Db = ReturnType<typeof postgres>

export function getDatabase(): Db {
  const databaseUrl = runtimeDatabaseUrl(config)
  if (!databaseUrl) throw new Error('An application database URL is required for this operation')
  sql ??= postgres(databaseUrl, { max: 10, idle_timeout: 20, prepare: false })
  return sql
}

export function runtimeDatabaseUrl(environment: {
  NODE_ENV: string
  DATABASE_URL?: string
  APP_DATABASE_URL?: string
}): string | undefined {
  if (environment.NODE_ENV === 'production' || environment.NODE_ENV === 'staging')
    return environment.APP_DATABASE_URL
  return environment.APP_DATABASE_URL ?? environment.DATABASE_URL
}

export async function checkDatabase() {
  if (!runtimeDatabaseUrl(config)) return 'not_configured' as const
  try {
    await getDatabase()`select 1`
    return 'ready' as const
  } catch {
    return 'unavailable' as const
  }
}
export async function closeDatabase() {
  if (sql) await sql.end({ timeout: 5 })
  sql = undefined
}
