import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/api/index.js'
import { hashPassword, validatePassword, verifyPassword } from '../src/modules/core.js'
import { configSchema } from '../src/platform/config.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('Phase 1 security primitives', () => {
  it('normalizes a trailing slash from the configured CORS origin', () => {
    expect(configSchema.parse({ API_CORS_ORIGIN: 'https://example.com/' }).API_CORS_ORIGIN).toBe(
      'https://example.com',
    )
  })

  it('hashes passwords with a unique salted scrypt value', async () => {
    const first = await hashPassword('correct horse 123')
    const second = await hashPassword('correct horse 123')
    expect(first).not.toBe(second)
    expect(await verifyPassword('correct horse 123', first)).toBe(true)
    expect(await verifyPassword('wrong horse 123', first)).toBe(false)
  })

  it('enforces a minimum password policy', () => {
    expect(validatePassword('short1')).toBe(false)
    expect(validatePassword('long-enough-password-1')).toBe(true)
  })

  it('rejects protected tenant routes before touching tenant data', async () => {
    server = await createServer()
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workspaces/00000000-0000-0000-0000-000000000000/clients',
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it.each([
    ['PATCH', 'clients'],
    ['PATCH', 'projects'],
    ['PATCH', 'contracts'],
    ['PATCH', 'time-entries'],
    ['PATCH', 'milestones'],
    ['DELETE', 'clients'],
    ['DELETE', 'projects'],
    ['DELETE', 'contracts'],
    ['DELETE', 'time-entries'],
    ['DELETE', 'milestones'],
  ] as const)('rejects unauthenticated %s for %s', async (method, resource) => {
    server = await createServer()
    const response = await server.inject({
      method,
      url: `/api/v1/workspaces/00000000-0000-0000-0000-000000000000/${resource}/11111111-1111-4111-8111-111111111111`,
      payload: method === 'PATCH' ? { name: 'Updated' } : undefined,
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})
