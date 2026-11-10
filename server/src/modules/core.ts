import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyRequest } from 'fastify'
import type { TransactionSql } from 'postgres'
import { getDatabase } from '../db/client.js'
import { config } from '../platform/config.js'

const scrypt = promisify(nodeScrypt)
export type Role = 'owner' | 'admin' | 'member'
export type AuthContext = {
  userId: string
  sessionId: string
  csrfToken: string
  authenticatedAt: Date
}
const hashToken = (v: string) => createHash('sha256').update(v).digest('hex')

/** Set only transaction-local values: pooled connections never retain identity across requests. */
export async function setDbContext(
  tx: TransactionSql,
  context: {
    userId?: string | null
    sessionId?: string | null
    workspaceId?: string | null
    authEmail?: string | null
    sessionTokenHash?: string | null
  },
) {
  await tx`select
    set_config('app.user_id', ${context.userId ?? ''}, true),
    set_config('app.session_id', ${context.sessionId ?? ''}, true),
    set_config('app.workspace_id', ${context.workspaceId ?? ''}, true),
    set_config('app.auth_email', ${context.authEmail ?? ''}, true),
    set_config('app.session_token_hash', ${context.sessionTokenHash ?? ''}, true)`
}
export async function withDbContext<T>(
  context: Parameters<typeof setDbContext>[1],
  action: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const result = await getDatabase().begin(async (tx) => {
    await setDbContext(tx, context)
    return action(tx)
  })
  return result as unknown as T
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${key.toString('hex')}`
}
export async function verifyPassword(password: string, encoded: string) {
  const [, salt, value] = encoded.split('$')
  if (!salt || !value) return false
  const key = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(value, 'hex')
  return expected.length === key.length && timingSafeEqual(expected, key)
}
export function validatePassword(password: string) {
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  )
}
export function normaliseEmail(email: string) {
  return email.trim().toLowerCase()
}
export function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}
export function getCookie(request: FastifyRequest, name: string) {
  const raw = request.headers.cookie ?? ''
  return raw
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
export function setSessionCookie(
  reply: { header: (name: string, value: string) => unknown },
  token: string,
) {
  const crossOrigin = config.NODE_ENV === 'production'
  reply.header(
    'set-cookie',
    `__Host-vendorproof_session=${token}; Path=/; HttpOnly; SameSite=${crossOrigin ? 'None' : 'Lax'}${crossOrigin ? '; Secure' : ''}`,
  )
}
export function clearSessionCookie(reply: { header: (name: string, value: string) => unknown }) {
  const crossOrigin = config.NODE_ENV === 'production'
  reply.header(
    'set-cookie',
    `__Host-vendorproof_session=; Path=/; HttpOnly; Max-Age=0; SameSite=${crossOrigin ? 'None' : 'Lax'}${crossOrigin ? '; Secure' : ''}`,
  )
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const csrf = randomBytes(32).toString('base64url')
  const [row] = await withDbContext(
    { userId },
    (tx) =>
      tx`insert into session (user_id, token_hash, csrf_token, expires_at) values (${userId}, ${hashToken(token)}, ${csrf}, now() + interval '7 days') returning id, csrf_token, last_authenticated_at`,
  )
  return {
    token,
    sessionId: row.id as string,
    csrfToken: row.csrf_token as string,
    authenticatedAt: new Date(row.last_authenticated_at as string),
  }
}
export async function authenticate(request: FastifyRequest): Promise<AuthContext | undefined> {
  const token = getCookie(request, '__Host-vendorproof_session')
  if (!token) return undefined
  const tokenHash = hashToken(token)
  const [row] = await withDbContext({ sessionTokenHash: tokenHash }, async (tx) => {
    const [session] =
      await tx`select id, user_id, csrf_token, last_authenticated_at from session where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()`
    if (session)
      await setDbContext(tx, { userId: String(session.user_id), sessionId: String(session.id) })
    return session ? [session] : []
  })
  return row
    ? {
        userId: row.user_id as string,
        sessionId: row.id as string,
        csrfToken: row.csrf_token as string,
        authenticatedAt: new Date(row.last_authenticated_at as string),
      }
    : undefined
}
export async function revokeSession(ctx: AuthContext) {
  await withDbContext(
    { userId: ctx.userId, sessionId: ctx.sessionId },
    (tx) =>
      tx`update session set revoked_at = now() where id = ${ctx.sessionId} and user_id = ${ctx.userId} and revoked_at is null`,
  )
}
export async function workspaceRole(userId: string, workspaceId: string) {
  const [row] = await withDbContext(
    { userId, workspaceId },
    (tx) =>
      tx`select role from membership where user_id = ${userId} and workspace_id = ${workspaceId} and status = 'active'`,
  )
  return row?.role as Role | undefined
}
export function can(role: Role | undefined, permission: 'read' | 'write' | 'approve' | 'manage') {
  if (!role) return false
  if (permission === 'read') return true
  if (permission === 'write') return role === 'owner' || role === 'admin'
  if (permission === 'approve') return role !== 'member'
  return role === 'owner'
}
export async function requireContext(
  request: FastifyRequest,
  workspaceId: string,
  permission: 'read' | 'write' | 'approve' | 'manage' = 'read',
) {
  const auth = await authenticate(request)
  if (!auth) {
    const error = new Error('Authentication required')
    ;(error as Error & { statusCode: number; code: string }).statusCode = 401
    ;(error as Error & { code: string }).code = 'UNAUTHENTICATED'
    throw error
  }
  const role = await workspaceRole(auth.userId, workspaceId)
  if (!can(role, permission)) {
    const error = new Error('Workspace access denied')
    ;(error as Error & { statusCode: number; code: string }).statusCode = 404
    ;(error as Error & { code: string }).code = 'NOT_FOUND'
    throw error
  }
  return { auth, role: role as Role }
}
export async function audit(
  workspaceId: string | null,
  actor: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  after: unknown,
  requestId?: string,
  before?: unknown,
) {
  await withDbContext(
    { userId: actor, workspaceId },
    (tx) =>
      tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id) values (${workspaceId}, ${actor}, ${action}, ${entityType}, ${entityId}, ${before ? JSON.stringify(before) : null}, ${after ? JSON.stringify(after) : null}, ${requestId ?? null})`,
  )
}
export function id(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined
}
export function requestBody<T>(request: FastifyRequest) {
  return request.body as T
}
export { randomUUID }
