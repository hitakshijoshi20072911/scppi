import postgres from 'postgres'
import { config } from '../platform/config.js'

let sql: ReturnType<typeof postgres> | undefined

function getClient() {
  if (!config.DATABASE_URL) return undefined
  sql ??= postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20 })
  return sql
}

export async function checkDatabase() {
  const client = getClient()
  if (!client) return 'not_configured' as const
  try {
    await client`select 1`
    return 'ready' as const
  } catch {
    return 'unavailable' as const
  }
}

export async function closeDatabase() {
  if (sql) await sql.end({ timeout: 5 })
}
