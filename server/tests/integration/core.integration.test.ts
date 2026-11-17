import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase } from '../../src/db/client.js'
import { createServer } from '../../src/api/index.js'
import { withDbContext } from '../../src/modules/core.js'

type Envelope<T> = { data: T }
type Row = { id: string; [key: string]: unknown }
type Session = { cookie: string; csrf: string; workspaceId: string; userId: string }

const enabled = Boolean(process.env.APP_DATABASE_URL || process.env.DATABASE_URL)
describe.skipIf(!enabled)('PostgreSQL core integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>

  function cookieFrom(response: { headers: Record<string, unknown> }) {
    const value = response.headers['set-cookie']
    const first = Array.isArray(value) ? value[0] : value
    return String(first).split(';', 1)[0]
  }

  async function register(email: string, workspaceName: string): Promise<Session> {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        name: 'Integration User',
        password: 'integration-password-1',
        workspaceName,
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Envelope<{ user: Row; workspace: Row; csrfToken: string }>
    return {
      cookie: cookieFrom(response),
      csrf: body.data.csrfToken,
      workspaceId: String(body.data.workspace.id),
      userId: String(body.data.user.id),
    }
  }

  function headers(session: Session, mutation = false) {
    return {
      cookie: session.cookie,
      ...(mutation ? { 'x-csrf-token': session.csrf } : {}),
    }
  }

  beforeAll(async () => {
    server = await createServer()
  })

  afterAll(async () => {
    await server.close()
    await closeDatabase()
  })

  it('persists a session and supports core records through approval', async () => {
    const session = await register(`owner-${Date.now()}@example.test`, 'Integration workspace')
    const me = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: headers(session),
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().data.workspaces[0].id).toBe(session.workspaceId)

    const clientResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/clients`,
      headers: headers(session, true),
      payload: { name: 'Integration Client' },
    })
    expect(clientResponse.statusCode).toBe(201)
    const client = clientResponse.json().data as Row

    const projectResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/projects`,
      headers: headers(session, true),
      payload: { clientId: client.id, name: 'Integration Project' },
    })
    expect(projectResponse.statusCode).toBe(201)
    const project = projectResponse.json().data as Row

    const contractResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/contracts`,
      headers: headers(session, true),
      payload: {
        clientId: client.id,
        projectId: project.id,
        reference: 'INT-001',
        title: 'Hourly agreement',
        billingModel: 'hourly',
        currency: 'USD',
        hourlyRateMinor: 12500,
        effectiveDate: '2026-01-01',
      },
    })
    expect(contractResponse.statusCode).toBe(201)
    const contract = contractResponse.json().data as Row

    const updated = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${session.workspaceId}/clients/${client.id}`,
      headers: headers(session, true),
      payload: { name: 'Updated Integration Client' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().data.name).toBe('Updated Integration Client')

    const entry = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/time-entries`,
      headers: headers(session, true),
      payload: {
        projectId: project.id,
        contractId: contract.id,
        workDate: '2026-01-15',
        durationMinutes: 90,
        description: 'Implement integration coverage',
      },
    })
    expect(entry.statusCode).toBe(201)
    const entryId = String(entry.json().data.id)

    const submitted = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/time-entries/${entryId}/submit`,
      headers: headers(session, true),
    })
    expect(submitted.statusCode).toBe(200)
    const approved = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${session.workspaceId}/time-entries/${entryId}/approve`,
      headers: headers(session, true),
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().data.status).toBe('approved')

    const listed = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${session.workspaceId}/clients`,
      headers: headers(session),
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().data).toHaveLength(1)
  })

  it('accepts a fixed-price milestone and isolates workspaces under RLS', async () => {
    const first = await register(`first-${Date.now()}@example.test`, 'First workspace')
    const second = await register(`second-${Date.now()}@example.test`, 'Second workspace')

    const client = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.workspaceId}/clients`,
      headers: headers(first, true),
      payload: { name: 'First client' },
    })
    const project = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.workspaceId}/projects`,
      headers: headers(first, true),
      payload: { clientId: client.json().data.id, name: 'First project' },
    })
    const contract = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.workspaceId}/contracts`,
      headers: headers(first, true),
      payload: {
        clientId: client.json().data.id,
        projectId: project.json().data.id,
        reference: 'FIX-001',
        title: 'Fixed milestone agreement',
        billingModel: 'fixed_milestone',
        currency: 'USD',
        contractValueMinor: 50000,
        effectiveDate: '2026-01-01',
      },
    })
    const milestone = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.workspaceId}/milestones`,
      headers: headers(first, true),
      payload: {
        projectId: project.json().data.id,
        contractId: contract.json().data.id,
        title: 'Accepted milestone',
        amountMinor: 50000,
        currency: 'USD',
      },
    })
    expect(milestone.statusCode).toBe(201)
    const milestoneId = milestone.json().data.id
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/v1/workspaces/${first.workspaceId}/milestones/${milestoneId}/complete`,
          headers: headers(first, true),
        })
      ).statusCode,
    ).toBe(200)
    const accepted = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.workspaceId}/milestones/${milestoneId}/accept`,
      headers: headers(first, true),
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().data.status).toBe('accepted')

    const crossWorkspace = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${first.workspaceId}/clients`,
      headers: headers(second),
    })
    expect(crossWorkspace.statusCode).toBe(404)

    const deniedInsert = await withDbContext(
      { userId: second.userId, workspaceId: first.workspaceId },
      async (tx) =>
        tx`insert into client (workspace_id, name) values (${first.workspaceId}, 'blocked')`,
    ).catch((error) => error as Error)
    expect(deniedInsert).toBeInstanceOf(Error)

    const logout = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: headers(first, true),
    })
    expect(logout.statusCode).toBe(200)
    const afterLogout = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: headers(first),
    })
    expect(afterLogout.statusCode).toBe(401)
  })

  it('does not permit the runtime role to read without tenant context', async () => {
    const rows = await getDatabase()`select count(*)::int as count from client`
    expect(Number(rows[0].count)).toBe(0)
  })
})
