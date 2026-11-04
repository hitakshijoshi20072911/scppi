import postgres from 'postgres'
import { config } from '../platform/config.js'

let sql: ReturnType<typeof postgres> | undefined
export type Db = ReturnType<typeof postgres>

export function getDatabase(): Db {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required for this operation')
  sql ??= postgres(config.DATABASE_URL, { max: 10, idle_timeout: 20, prepare: false })
  return sql
}

export async function checkDatabase() {
  if (!config.DATABASE_URL) return 'not_configured' as const
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
