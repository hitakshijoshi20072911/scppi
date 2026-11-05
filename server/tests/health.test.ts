import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/api/index.js'
import { isDatabaseReady } from '../src/api/routes/health.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined

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
