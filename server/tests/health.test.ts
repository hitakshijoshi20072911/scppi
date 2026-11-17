import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/db/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/client.js')>()
  return { ...actual, checkDatabase: vi.fn() }
})
import { createServer } from '../src/api/index.js'
import { isDatabaseReady } from '../src/api/routes/health.js'
import { checkDatabase } from '../src/db/client.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined
const mockedCheckDatabase = vi.mocked(checkDatabase)

beforeEach(() => {
  mockedCheckDatabase.mockResolvedValue('not_configured')
})

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('health endpoints', () => {
  it('reports service status at the API root', async () => {
    server = await createServer()
    const response = await server.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      service: 'vendorproof-api',
      status: 'ok',
      version: 'v1',
    })
  })

  it('reports liveness and a request id', async () => {
    server = await createServer()
    const response = await server.inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok' })
    expect(response.headers['x-request-id']).toBeTruthy()
  })

  it('reports readiness in tests while identifying an unconfigured database', async () => {
    server = await createServer()
    const response = await server.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ready',
      checks: { database: 'not_configured' },
    })
  })

  it('reports readiness when the database health check is ready', async () => {
    mockedCheckDatabase.mockResolvedValue('ready')
    server = await createServer()
    const response = await server.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ready',
      checks: { database: 'ready' },
    })
  })

  it('fails production readiness when the database is missing or unavailable', () => {
    expect(isDatabaseReady('not_configured', 'production')).toBe(false)
    expect(isDatabaseReady('unavailable', 'production')).toBe(false)
    expect(isDatabaseReady('ready', 'production')).toBe(true)
  })

  it('does not leak internal details for missing routes', async () => {
    server = await createServer()
    const response = await server.inject({ method: 'GET', url: '/not-a-route' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(response.body).not.toContain('node_modules')
  })
})
