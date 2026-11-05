import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/api/index.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('Phase 3 route access controls', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const runId = '33333333-3333-4333-8333-333333333333'
  const invoiceId = '44444444-4444-4444-8444-444444444444'

  it.each([
    [
      'POST',
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/invoice-previews`,
    ],
    ['GET', `/api/v1/workspaces/${workspaceId}/invoice-previews`],
    ['GET', `/api/v1/workspaces/${workspaceId}/invoice-previews/${invoiceId}`],
    ['POST', `/api/v1/workspaces/${workspaceId}/invoice-previews/${invoiceId}/review`],
  ] as const)('rejects unauthenticated %s %s before tenant access', async (method, url) => {
    server = await createServer()
    const response = await server.inject({ method, url })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('rejects an untrusted origin on invoice review writes', async () => {
    server = await createServer()
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/invoice-previews/${invoiceId}/review`,
      headers: { origin: 'https://untrusted.example' },
      payload: { decision: 'approve', version: 0, contentHash: '0'.repeat(64) },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN_ORIGIN' })
  })
})
