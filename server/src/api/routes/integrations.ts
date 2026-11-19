import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { disconnect as tenantDisconnect, saveKey } from '@swytchcode/runtime'
import { exec as runtimeExec } from '@swytchcode/runtime'
import { requireContext, withDbContext, audit } from '../../modules/core.js'

const workspaceParams = z.object({ workspaceId: z.string().uuid() }).strict()
const stripeKeySchema = z.object({ apiKey: z.string().regex(/^sk_test_[A-Za-z0-9]{8,}$/) }).strict()

function fail(reply: FastifyReply, statusCode: number, code: string, message: string): never {
  return reply.status(statusCode).send({ statusCode, code, error: 'Error', message }) as never
}
function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}
function safeCorrelationId(request: FastifyRequest): string {
  const value = request.headers['x-request-id']
  return typeof value === 'string' && /^[\w-]{8,64}$/.test(value) ? value : 'unknown'
}
function sanitizeProviderError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : ''
  if (/tenant_not_connected|not connected/i.test(message))
    return 'Stripe account is not connected for this workspace'
  if (/invalid|unauthorized|401|403/i.test(message))
    return 'Stripe rejected the test credential; check the key and test mode'
  return 'Stripe provider operation failed; check Swytchcode status'
}

async function verifyStripeRead(tenantId: string): Promise<void> {
  await runtimeExec(
    'stripe.customer.list',
    { params: { limit: '1' } },
    { tenantId, timeoutMs: 60000 },
  )
}

export function registerIntegrationRoutes(app: FastifyInstance) {
  app.get('/api/v1/workspaces/:workspaceId/integrations', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'read')
    const rows = await withDbContext(
      { userId: auth.userId, workspaceId },
      (tx) =>
        tx`select id, provider, status, connected_at, last_verified_at, verification_note, created_at, updated_at from provider_connection where workspace_id = ${workspaceId} order by provider`,
    )
    return ok(reply, rows)
  })

  app.post(
    '/api/v1/workspaces/:workspaceId/integrations/stripe/connect',
    async (request, reply) => {
      const { workspaceId } = workspaceParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const { apiKey } = stripeKeySchema.parse(request.body ?? {})
      try {
        await saveKey({ provider: 'stripe', tenantId: workspaceId, key: apiKey })
      } catch {
        return fail(reply, 502, 'STRIPE_CONNECTION_FAILED', 'Stripe credential could not be stored')
      }
      try {
        await verifyStripeRead(workspaceId)
      } catch (cause) {
        try {
          await tenantDisconnect({ provider: 'stripe', tenantId: workspaceId })
        } catch {
          /* best effort rollback */
        }
        return fail(reply, 422, 'STRIPE_VERIFICATION_FAILED', sanitizeProviderError(cause))
      }
      const now = new Date()
      const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const upserted =
          await tx`insert into provider_connection (workspace_id, provider, status, connected_at, last_verified_at, verification_note, created_by)
        values (${workspaceId}, 'stripe', 'connected', ${now}, ${now}, 'test_mode_read_verified', ${auth.userId})
        on conflict (workspace_id, provider) do update set status = 'connected', connected_at = coalesce(provider_connection.connected_at, excluded.connected_at), last_verified_at = excluded.last_verified_at, verification_note = excluded.verification_note, updated_at = now()
        returning id, provider, status, connected_at, last_verified_at, verification_note`
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'integration.stripe.connected', 'provider_connection', ${upserted[0].id}, ${JSON.stringify({ provider: 'stripe', mode: 'test', verification: 'customer_list_read' })}, ${safeCorrelationId(request)})`
        return upserted
      })
      return ok(reply, rows[0], 201)
    },
  )

  app.post('/api/v1/workspaces/:workspaceId/integrations/stripe/verify', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'write')
    try {
      await verifyStripeRead(workspaceId)
    } catch (cause) {
      return fail(reply, 422, 'STRIPE_VERIFICATION_FAILED', sanitizeProviderError(cause))
    }
    const now = new Date()
    const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
      const updated =
        await tx`update provider_connection set last_verified_at = ${now}, status = 'connected', verification_note = 'test_mode_read_verified', updated_at = now() where workspace_id = ${workspaceId} and provider = 'stripe' returning id, provider, status, connected_at, last_verified_at, verification_note`
      if (updated.length) {
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'integration.stripe.verified', 'provider_connection', ${updated[0].id}, ${JSON.stringify({ provider: 'stripe', verification: 'customer_list_read' })}, ${safeCorrelationId(request)})`
      }
      return updated
    })
    if (!rows.length)
      return fail(reply, 404, 'NOT_CONNECTED', 'Stripe is not connected for this workspace')
    return ok(reply, rows[0])
  })

  app.post(
    '/api/v1/workspaces/:workspaceId/integrations/stripe/disconnect',
    async (request, reply) => {
      const { workspaceId } = workspaceParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      try {
        await tenantDisconnect({ provider: 'stripe', tenantId: workspaceId })
      } catch {
        return fail(
          reply,
          502,
          'STRIPE_DISCONNECT_FAILED',
          'Stripe credential could not be revoked',
        )
      }
      await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const updated =
          await tx`update provider_connection set status = 'disconnected', updated_at = now() where workspace_id = ${workspaceId} and provider = 'stripe' returning id`
        if (updated.length) {
          await audit(
            workspaceId,
            auth.userId,
            'integration.stripe.disconnected',
            'provider_connection',
            updated[0].id,
            { provider: 'stripe' },
            safeCorrelationId(request),
          )
        }
      })
      return ok(reply, { disconnected: true })
    },
  )
}
