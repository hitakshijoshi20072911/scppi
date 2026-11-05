import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/api/index.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('Phase 2 route access controls', () => {
  it.each([
    [
      'GET',
      '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/sources',
    ],
    [
      'POST',
      '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/runs',
    ],
    [
      'POST',
      '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/runs/33333333-3333-4333-8333-333333333333/start',
    ],
    [
      'POST',
      '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/runs/33333333-3333-4333-8333-333333333333/items/44444444-4444-4444-8444-444444444444/decision',
    ],
  ] as const)('rejects unauthenticated %s %s before tenant access', async (method, url) => {
    server = await createServer()
    const response = await server.inject({ method, url })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})
