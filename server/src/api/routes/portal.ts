import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { authenticate, requireContext, withDbContext } from '../../modules/core.js'

const uuid = z.string().uuid()
const wsParams = z.object({ workspaceId: uuid }).strict()
const clientParams = z.object({ workspaceId: uuid, clientId: uuid }).strict()
const contractParams = z.object({ workspaceId: uuid, contractId: uuid }).strict()
const versionParams = z.object({ workspaceId: uuid, contractId: uuid, versionId: uuid }).strict()
const projectParams = z.object({ workspaceId: uuid, projectId: uuid }).strict()
const deliverableParams = z.object({ workspaceId: uuid, deliverableId: uuid }).strict()
const previewParams = z.object({ workspaceId: uuid, previewId: uuid }).strict()
const invitationParams = z
  .object({ workspaceId: uuid, clientId: uuid, invitationId: uuid })
  .strict()

const CLIENT_ROLES = ['client_owner', 'client_admin', 'billing_approver', 'client_viewer'] as const
const inviteSchema = z
  .object({
    email: z.string().email().max(320),
    role: z.enum(CLIENT_ROLES).default('client_viewer'),
  })
  .strict()
const engagementSchema = z
  .object({
    projectId: uuid,
    contractId: uuid.optional(),
    name: z.string().min(1).max(160),
    description: z.string().max(4000).optional(),
    status: z.enum(['proposed', 'active', 'on_hold', 'completed', 'cancelled']).default('proposed'),
  })
  .strict()
const versionSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(8000).optional(),
    billingModel: z.enum(['hourly', 'fixed_milestone', 'fixed_price']).optional(),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/i)
      .optional(),
    hourlyRateMinor: z.number().int().min(0).optional(),
    contractValueMinor: z.number().int().min(0).optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    changeReason: z.string().max(1000).optional(),
  })
  .strict()
const deliverableSchema = z
  .object({
    projectId: uuid,
    milestoneId: uuid.optional(),
    title: z.string().min(1).max(160),
    description: z.string().max(8000).optional(),
    amountMinor: z.number().int().min(0).optional(),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/i)
      .optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict()
const lifecycleSchema = z
  .object({
    event: z.enum([
      'completion_submitted',
      'completed',
      'cancel_requested',
      'cancelled',
      'on_hold',
      'resumed',
    ]),
    reason: z.string().max(1000).optional(),
  })
  .strict()
const acceptSchema = z
  .object({
    decision: z.enum(['accept', 'reject', 'request_changes']),
    reason: z.string().max(1000).optional(),
  })
  .strict()
const deliverableDecisionSchema = z
  .object({
    decision: z.enum(['accept', 'request_revision']),
    reason: z.string().max(1000).optional(),
  })
  .strict()
const acceptInviteSchema = z.object({ token: z.string().min(20).max(200) }).strict()

function fail(reply: FastifyReply, statusCode: number, code: string, message: string): never {
  return reply.status(statusCode).send({ statusCode, code, error: 'Error', message }) as never
}
function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

async function notifyClient(
  tx: Parameters<Parameters<typeof withDbContext>[1]>[0],
  workspaceId: string,
  clientId: string,
  type: string,
  title: string,
  body: string | undefined,
  entityType: string,
  entityId: string,
) {
  await tx`insert into client_notification (workspace_id, client_id, type, title, body, entity_type, entity_id) values (${workspaceId}, ${clientId}, ${type}, ${title}, ${body ?? null}, ${entityType}, ${entityId})`
}

export function registerPortalRoutes(app: FastifyInstance) {
  // ---------- Provider: client invitations ----------
  app.post(
    '/api/v1/workspaces/:workspaceId/clients/:clientId/invitations',
    async (request, reply) => {
      const { workspaceId, clientId } = clientParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const input = inviteSchema.parse(request.body ?? {})
      const token = randomBytes(24).toString('base64url')
      const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const existing =
          await tx`select id from client_invitation where workspace_id = ${workspaceId} and client_id = ${clientId} and email = ${input.email.toLowerCase()} and accepted_at is null and revoked_at is null limit 1`
        let inv
        if (existing.length) {
          inv = (
            await tx`update client_invitation set token_hash = ${sha256(token)}, role = ${input.role}, expires_at = ${expires}, invited_by = ${auth.userId}, updated_at = now() where id = ${existing[0].id} returning id, email, role, expires_at`
          )[0]
        } else {
          inv = (
            await tx`insert into client_invitation (workspace_id, client_id, email, role, token_hash, expires_at, invited_by)
          values (${workspaceId}, ${clientId}, ${input.email.toLowerCase()}, ${input.role}, ${sha256(token)}, ${expires}, ${auth.userId})
          returning id, email, role, expires_at`
          )[0]
        }
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'client.invited', 'client_invitation', ${inv.id}, ${JSON.stringify({ email: inv.email, role: inv.role })}, ${randomUUID()})`
        return [inv]
      })
      return ok(
        reply,
        { ...rows[0], inviteToken: token, acceptPath: `/portal/accept?token=${token}` },
        201,
      )
    },
  )

  app.get(
    '/api/v1/workspaces/:workspaceId/clients/:clientId/invitations',
    async (request, reply) => {
      const { workspaceId, clientId } = clientParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'read')
      const rows = await withDbContext(
        { userId: auth.userId, workspaceId },
        (tx) =>
          tx`select id, email, role, expires_at, accepted_at, revoked_at, created_at from client_invitation where workspace_id = ${workspaceId} and client_id = ${clientId} order by created_at desc`,
      )
      return ok(reply, rows)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/clients/:clientId/invitations/:invitationId/revoke',
    async (request, reply) => {
      const { workspaceId, clientId, invitationId } = invitationParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const updated =
          await tx`update client_invitation set revoked_at = now(), updated_at = now() where workspace_id = ${workspaceId} and client_id = ${clientId} and id = ${invitationId} and accepted_at is null and revoked_at is null returning id`
        if (updated.length)
          await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'client.invite_revoked', 'client_invitation', ${invitationId}, null, ${randomUUID()})`
        return updated
      })
      if (!rows.length) return fail(reply, 404, 'NOT_FOUND', 'Pending invitation not found')
      return ok(reply, { revoked: true })
    },
  )

  app.get('/api/v1/workspaces/:workspaceId/clients/:clientId/portal', async (request, reply) => {
    const { workspaceId, clientId } = clientParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'read')
    const data = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
      const members =
        await tx`select cm.id, cm.user_id, u.email, u.name, cm.role, cm.status, cm.created_at from client_membership cm join app_user u on u.id = cm.user_id where cm.workspace_id = ${workspaceId} and cm.client_id = ${clientId} order by cm.created_at`
      const invites =
        await tx`select id, email, role, expires_at, accepted_at, revoked_at from client_invitation where workspace_id = ${workspaceId} and client_id = ${clientId} and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`
      return { members, invitations: invites }
    })
    return ok(reply, data)
  })

  // ---------- Provider: engagements ----------
  app.post('/api/v1/workspaces/:workspaceId/engagements', async (request, reply) => {
    const { workspaceId } = wsParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'write')
    const input = engagementSchema.parse(request.body ?? {})
    const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
      const project =
        await tx`select id, client_id from project where workspace_id = ${workspaceId} and id = ${input.projectId}`
      if (!project.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 })
      const clientId = project[0].client_id
      const inserted =
        await tx`insert into client_engagement (workspace_id, client_id, project_id, contract_id, name, description, status)
        values (${workspaceId}, ${clientId}, ${input.projectId}, ${input.contractId ?? null}, ${input.name}, ${input.description ?? null}, ${input.status})
        on conflict (workspace_id, project_id) do update set contract_id = excluded.contract_id, name = excluded.name, description = excluded.description, status = excluded.status, updated_at = now()
        returning *`
      await notifyClient(
        tx,
        workspaceId,
        clientId,
        'engagement.created',
        `Project "${input.name}" shared with you`,
        input.description,
        'client_engagement',
        inserted[0].id,
      )
      await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'engagement.upserted', 'client_engagement', ${inserted[0].id}, ${JSON.stringify({ projectId: input.projectId })}, ${randomUUID()})`
      return inserted
    })
    return ok(reply, rows[0], 201)
  })

  app.get('/api/v1/workspaces/:workspaceId/engagements', async (request, reply) => {
    const { workspaceId } = wsParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'read')
    const rows = await withDbContext(
      { userId: auth.userId, workspaceId },
      (tx) =>
        tx`select * from client_engagement where workspace_id = ${workspaceId} order by created_at desc`,
    )
    return ok(reply, rows)
  })

  // ---------- Provider: contract versions ----------
  app.post(
    '/api/v1/workspaces/:workspaceId/contracts/:contractId/versions',
    async (request, reply) => {
      const { workspaceId, contractId } = contractParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const input = versionSchema.parse(request.body ?? {})
      const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const contract =
          await tx`select * from contract where workspace_id = ${workspaceId} and id = ${contractId}`
        if (!contract.length)
          throw Object.assign(new Error('Contract not found'), { statusCode: 404 })
        const c = contract[0]
        const latest =
          await tx`select coalesce(max(version), 0) as v from contract_version where contract_id = ${contractId}`
        const version = Number(latest[0].v) + 1
        const snapshot = {
          title: input.title ?? c.title,
          description: input.description ?? c.description ?? '',
          billingModel: input.billingModel ?? c.billing_model,
          currency: (input.currency ?? c.currency).toLowerCase(),
          hourlyRateMinor: input.hourlyRateMinor ?? c.hourly_rate_minor ?? null,
          contractValueMinor: input.contractValueMinor ?? c.contract_value_minor ?? null,
          effectiveDate: input.effectiveDate ?? String(c.effective_date).slice(0, 10),
          endDate: input.endDate ?? (c.end_date ? String(c.end_date).slice(0, 10) : null),
          reference: c.reference,
        }
        const hash = sha256(JSON.stringify(snapshot))
        const inserted =
          await tx`insert into contract_version (workspace_id, contract_id, client_id, version, snapshot, content_hash, status, change_reason, created_by)
        values (${workspaceId}, ${contractId}, ${c.client_id}, ${version}, ${JSON.stringify(snapshot)}, ${hash}, 'proposed', ${input.changeReason ?? null}, ${auth.userId})
        returning *`
        await notifyClient(
          tx,
          workspaceId,
          c.client_id,
          'contract.proposed',
          `Contract v${version} proposed: ${snapshot.title}`,
          input.changeReason,
          'contract_version',
          inserted[0].id,
        )
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'contract.version_created', 'contract_version', ${inserted[0].id}, ${JSON.stringify({ contractId, version, contentHash: hash })}, ${randomUUID()})`
        return inserted
      })
      return ok(reply, rows[0], 201)
    },
  )

  app.get(
    '/api/v1/workspaces/:workspaceId/contracts/:contractId/versions',
    async (request, reply) => {
      const { workspaceId, contractId } = contractParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'read')
      const rows = await withDbContext(
        { userId: auth.userId, workspaceId },
        (tx) =>
          tx`select id, version, status, content_hash, change_reason, snapshot, created_at from contract_version where workspace_id = ${workspaceId} and contract_id = ${contractId} order by version desc`,
      )
      return ok(reply, rows)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/contracts/:contractId/versions/:versionId/provider-accept',
    async (request, reply) => {
      const { workspaceId, contractId, versionId } = versionParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const result = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const v =
          await tx`select * from contract_version where workspace_id = ${workspaceId} and contract_id = ${contractId} and id = ${versionId}`
        if (!v.length) return { error: [404, 'NOT_FOUND', 'Contract version not found'] as const }
        const version = v[0]
        if (version.status === 'accepted' || version.status === 'rejected')
          return { error: [409, 'INVALID_STATE', `Version already ${version.status}`] as const }
        await tx`insert into contract_acceptance (workspace_id, contract_version_id, client_id, party, user_id) values (${workspaceId}, ${versionId}, ${version.client_id}, 'provider', ${auth.userId}) on conflict (contract_version_id, party) do nothing`
        const both =
          await tx`select count(*)::int as n from contract_acceptance where contract_version_id = ${versionId}`
        if (both[0].n >= 2) {
          await tx`update contract_version set status = 'accepted' where id = ${versionId}`
          await tx`update contract set status = 'active', updated_at = now() where workspace_id = ${workspaceId} and id = ${contractId}`
          await tx`update client_engagement set status = 'active', updated_at = now() where workspace_id = ${workspaceId} and contract_id = ${contractId}`
        } else {
          await tx`update contract_version set status = 'provider_accepted' where id = ${versionId}`
        }
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'contract.provider_accepted', 'contract_version', ${versionId}, ${JSON.stringify({ version: version.version })}, ${randomUUID()})`
        return { ok: true }
      })
      if ('error' in result && result.error)
        return fail(reply, result.error[0], result.error[1], result.error[2])
      return ok(reply, { accepted: true })
    },
  )

  // ---------- Provider: deliverables ----------
  app.post('/api/v1/workspaces/:workspaceId/deliverables', async (request, reply) => {
    const { workspaceId } = wsParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'write')
    const input = deliverableSchema.parse(request.body ?? {})
    const rows = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
      const project =
        await tx`select id, client_id from project where workspace_id = ${workspaceId} and id = ${input.projectId}`
      if (!project.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 })
      const inserted =
        await tx`insert into client_deliverable (workspace_id, client_id, project_id, milestone_id, title, description, amount_minor, currency, due_date)
        values (${workspaceId}, ${project[0].client_id}, ${input.projectId}, ${input.milestoneId ?? null}, ${input.title}, ${input.description ?? null}, ${input.amountMinor ?? null}, ${input.currency?.toLowerCase() ?? null}, ${input.dueDate ?? null})
        returning *`
      return inserted
    })
    return ok(reply, rows[0], 201)
  })

  app.get(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/deliverables',
    async (request, reply) => {
      const { workspaceId, projectId } = projectParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'read')
      const rows = await withDbContext(
        { userId: auth.userId, workspaceId },
        (tx) =>
          tx`select * from client_deliverable where workspace_id = ${workspaceId} and project_id = ${projectId} order by created_at`,
      )
      return ok(reply, rows)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/deliverables/:deliverableId/submit',
    async (request, reply) => {
      const { workspaceId, deliverableId } = deliverableParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const result = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const d =
          await tx`select * from client_deliverable where workspace_id = ${workspaceId} and id = ${deliverableId}`
        if (!d.length) return { error: [404, 'NOT_FOUND', 'Deliverable not found'] as const }
        const updated =
          await tx`update client_deliverable set status = 'submitted', submitted_at = now(), submitted_by = ${auth.userId}, updated_at = now() where id = ${deliverableId} and status in ('draft','changes_requested') returning id, client_id, project_id, title`
        if (!updated.length)
          return {
            error: [
              409,
              'INVALID_STATE',
              'Deliverable cannot be submitted from its current state',
            ] as const,
          }
        await notifyClient(
          tx,
          workspaceId,
          updated[0].client_id,
          'deliverable.submitted',
          `Deliverable submitted: ${updated[0].title}`,
          'Review and accept or request revisions.',
          'client_deliverable',
          deliverableId,
        )
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'deliverable.submitted', 'client_deliverable', ${deliverableId}, null, ${randomUUID()})`
        return { ok: true }
      })
      if ('error' in result && result.error)
        return fail(reply, result.error[0], result.error[1], result.error[2])
      return ok(reply, { submitted: true })
    },
  )

  // ---------- Provider: project lifecycle ----------
  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/lifecycle',
    async (request, reply) => {
      const { workspaceId, projectId } = projectParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const input = lifecycleSchema.parse(request.body ?? {})
      const result = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const project =
          await tx`select id, client_id, status from project where workspace_id = ${workspaceId} and id = ${projectId}`
        if (!project.length) return { error: [404, 'NOT_FOUND', 'Project not found'] as const }
        const p = project[0]
        const statusMap: Record<string, string> = {
          completion_submitted: 'completion_submitted',
          completed: 'completed',
          cancel_requested: 'cancel_requested',
          cancelled: 'cancelled',
          on_hold: 'on_hold',
          resumed: 'active',
        }
        const newStatus = statusMap[input.event]
        if (!newStatus)
          return { error: [422, 'INVALID_EVENT', 'Unsupported lifecycle event'] as const }
        await tx`update project set status = ${newStatus}, updated_by = ${auth.userId}, updated_at = now() where id = ${projectId}`
        await tx`insert into project_lifecycle_event (workspace_id, project_id, client_id, event_type, actor_user_id, party, reason) values (${workspaceId}, ${projectId}, ${p.client_id}, ${input.event}, ${auth.userId}, 'provider', ${input.reason ?? null})`
        await notifyClient(
          tx,
          workspaceId,
          p.client_id,
          `project.${input.event}`,
          `Project update: ${input.event.replace(/_/g, ' ')}`,
          input.reason,
          'project',
          projectId,
        )
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'project.lifecycle', 'project', ${projectId}, ${JSON.stringify({ event: input.event })}, ${randomUUID()})`
        return { ok: true, status: newStatus }
      })
      if ('error' in result && result.error)
        return fail(reply, result.error[0], result.error[1], result.error[2])
      return ok(reply, result)
    },
  )

  // ---------- Provider: client invoices ----------
  app.post(
    '/api/v1/workspaces/:workspaceId/invoice-previews/:previewId/issue',
    async (request, reply) => {
      const { workspaceId, previewId } = previewParams.parse(request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const result = await withDbContext({ userId: auth.userId, workspaceId }, async (tx) => {
        const preview =
          await tx`select * from invoice_preview where workspace_id = ${workspaceId} and id = ${previewId}`
        if (!preview.length)
          return { error: [404, 'NOT_FOUND', 'Invoice preview not found'] as const }
        const p = preview[0]
        if (p.status !== 'approved')
          return {
            error: [409, 'INVALID_STATE', 'Only approved invoice previews can be issued'] as const,
          }
        const existing =
          await tx`select id from client_invoice where workspace_id = ${workspaceId} and invoice_preview_id = ${previewId}`
        if (existing.length)
          return { error: [409, 'DUPLICATE', 'Invoice already issued for this preview'] as const }
        const project =
          await tx`select client_id from project where workspace_id = ${workspaceId} and id = ${p.project_id}`
        if (!project.length)
          return { error: [404, 'NOT_FOUND', 'Project not found for preview'] as const }
        const clientId = project[0].client_id
        const number = `INV-${new Date().getFullYear()}-${String(p.id).slice(0, 8).toUpperCase()}`
        const snapshot = p.snapshot
        const inserted =
          await tx`insert into client_invoice (workspace_id, client_id, project_id, invoice_preview_id, invoice_number, currency, total_minor, status, snapshot, content_hash, created_by)
        values (${workspaceId}, ${clientId}, ${p.project_id}, ${previewId}, ${number}, ${p.currency}, ${p.subtotal_minor}, 'issued', ${JSON.stringify(snapshot)}, ${p.content_hash}, ${auth.userId})
        returning *`
        await tx`insert into client_invoice_event (workspace_id, client_id, client_invoice_id, event_type, actor_user_id, party, detail) values (${workspaceId}, ${clientId}, ${inserted[0].id}, 'issued', ${auth.userId}, 'provider', ${JSON.stringify({ invoiceNumber: number })})`
        await notifyClient(
          tx,
          workspaceId,
          clientId,
          'invoice.issued',
          `Invoice ${number} issued`,
          `Total ${p.currency} ${(Number(p.subtotal_minor) / 100).toFixed(2)}`,
          'client_invoice',
          inserted[0].id,
        )
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'invoice.issued', 'client_invoice', ${inserted[0].id}, ${JSON.stringify({ invoiceNumber: number, previewId })}, ${randomUUID()})`
        return { ok: true, invoice: inserted[0] }
      })
      if ('error' in result && result.error)
        return fail(reply, result.error[0], result.error[1], result.error[2])
      return ok(reply, result.invoice, 201)
    },
  )

  app.get('/api/v1/workspaces/:workspaceId/client-invoices', async (request, reply) => {
    const { workspaceId } = wsParams.parse(request.params)
    const { auth } = await requireContext(request, workspaceId, 'read')
    const rows = await withDbContext(
      { userId: auth.userId, workspaceId },
      (tx) =>
        tx`select ci.*, c.name as client_name from client_invoice ci join client c on c.workspace_id = ci.workspace_id and c.id = ci.client_id where ci.workspace_id = ${workspaceId} order by ci.created_at desc`,
    )
    return ok(reply, rows)
  })

  // ---------- Client portal ----------
  app.post('/api/v1/portal/invitations/accept', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const { token } = acceptInviteSchema.parse(request.body ?? {})
    const user = await withDbContext(
      { userId: auth.userId },
      (tx) => tx`select email from app_user where id = ${auth.userId}`,
    )
    if (!user.length) return fail(reply, 404, 'NOT_FOUND', 'User not found')
    const rows = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select public.vendorproof_accept_client_invitation(${sha256(token)}, ${auth.userId}, ${user[0].email}) as result`,
    )
    const result = rows[0]?.result as {
      ok: boolean
      code?: string
      message?: string
      workspaceId?: string
      clientId?: string
      role?: string
    }
    if (!result?.ok) {
      const status =
        result?.code === 'NOT_FOUND'
          ? 404
          : result?.code === 'EMAIL_MISMATCH' || result?.code === 'FORBIDDEN'
            ? 403
            : 409
      return fail(
        reply,
        status,
        result?.code ?? 'INVITE_FAILED',
        result?.message ?? 'Invitation could not be accepted',
      )
    }
    return ok(
      reply,
      { workspaceId: result.workspaceId, clientId: result.clientId, role: result.role },
      201,
    )
  })

  app.get('/api/v1/portal/overview', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const memberships = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select cm.workspace_id, cm.client_id, cm.role from client_membership cm where cm.user_id = ${auth.userId} and cm.status = 'active' order by cm.created_at`,
    )
    const contexts = []
    for (const m of memberships) {
      const data = await withDbContext(
        { userId: auth.userId, workspaceId: m.workspace_id },
        async (tx) => {
          const meta =
            await tx`select c.name as client_name, w.name as workspace_name from client c join workspace w on w.id = c.workspace_id where c.workspace_id = ${m.workspace_id} and c.id = ${m.client_id}`
          const engagements =
            await tx`select id, project_id, contract_id, name, description, status, billing_model, currency, contract_value_minor, hourly_rate_minor, start_date, target_end_date from client_engagement where workspace_id = ${m.workspace_id} and client_id = ${m.client_id} order by created_at desc`
          const deliverables =
            await tx`select id, project_id, milestone_id, title, description, amount_minor, currency, due_date, status, submitted_at, client_decision, client_reason from client_deliverable where workspace_id = ${m.workspace_id} and client_id = ${m.client_id} order by created_at desc limit 50`
          const invoices =
            await tx`select id, project_id, invoice_number, currency, total_minor, status, issued_at, due_date, paid_at, created_at from client_invoice where workspace_id = ${m.workspace_id} and client_id = ${m.client_id} order by created_at desc limit 50`
          const notifications =
            await tx`select id, type, title, body, entity_type, entity_id, read_at, created_at from client_notification where workspace_id = ${m.workspace_id} and client_id = ${m.client_id} and (user_id is null or user_id = ${auth.userId}) order by created_at desc limit 50`
          const versions =
            await tx`select cv.id, cv.contract_id, cv.version, cv.status, cv.snapshot, cv.content_hash, cv.change_reason, cv.created_at, ca.party, ca.accepted_at from contract_version cv left join contract_acceptance ca on ca.contract_version_id = cv.id and ca.party = 'client' where cv.workspace_id = ${m.workspace_id} and cv.client_id = ${m.client_id} order by cv.created_at desc limit 20`
          return {
            ...(meta[0] ?? {}),
            engagements,
            deliverables,
            invoices,
            notifications,
            contractVersions: versions,
          }
        },
      )
      contexts.push({ ...m, ...data })
    }
    return ok(reply, { userId: auth.userId, contexts })
  })

  app.post('/api/v1/portal/contract-versions/:versionId/decision', async (request, reply) => {
    const versionId = uuid.parse((request.params as { versionId: string }).versionId)
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const input = acceptSchema.parse(request.body ?? {})
    const rows = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select public.vendorproof_client_contract_decision(${versionId}, ${auth.userId}, ${input.decision}, ${input.reason ?? null}) as result`,
    )
    const result = rows[0]?.result as { ok: boolean; code?: string; message?: string }
    if (!result?.ok) {
      const status = result?.code === 'NOT_FOUND' ? 404 : result?.code === 'FORBIDDEN' ? 403 : 409
      return fail(
        reply,
        status,
        result?.code ?? 'DECISION_FAILED',
        result?.message ?? 'Decision could not be recorded',
      )
    }
    return ok(reply, { decision: input.decision })
  })

  app.post('/api/v1/portal/deliverables/:deliverableId/decision', async (request, reply) => {
    const deliverableId = uuid.parse((request.params as { deliverableId: string }).deliverableId)
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const input = deliverableDecisionSchema.parse(request.body ?? {})
    const rows = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select public.vendorproof_client_deliverable_decision(${deliverableId}, ${auth.userId}, ${input.decision}, ${input.reason ?? null}) as result`,
    )
    const result = rows[0]?.result as { ok: boolean; code?: string; message?: string }
    if (!result?.ok) {
      const status = result?.code === 'NOT_FOUND' ? 404 : result?.code === 'FORBIDDEN' ? 403 : 409
      return fail(
        reply,
        status,
        result?.code ?? 'DECISION_FAILED',
        result?.message ?? 'Decision could not be recorded',
      )
    }
    return ok(reply, { decision: input.decision })
  })

  app.get('/api/v1/portal/invoices', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const memberships = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select workspace_id, client_id from client_membership where user_id = ${auth.userId} and status = 'active'`,
    )
    const all = []
    for (const m of memberships) {
      const rows = await withDbContext(
        { userId: auth.userId, workspaceId: m.workspace_id },
        (tx) =>
          tx`select ci.id, ci.workspace_id, ci.client_id, ci.project_id, ci.invoice_number, ci.currency, ci.total_minor, ci.status, ci.issued_at, ci.due_date, ci.paid_at, ci.created_at, c.name as client_name from client_invoice ci join client c on c.workspace_id = ci.workspace_id and c.id = ci.client_id where ci.workspace_id = ${m.workspace_id} and ci.client_id = ${m.client_id} order by ci.created_at desc`,
      )
      all.push(...rows)
    }
    return ok(reply, all)
  })

  app.get('/api/v1/portal/invoices/:invoiceId', async (request, reply) => {
    const invoiceId = uuid.parse((request.params as { invoiceId: string }).invoiceId)
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const memberships = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select workspace_id, client_id from client_membership where user_id = ${auth.userId} and status = 'active'`,
    )
    for (const m of memberships) {
      const rows = await withDbContext(
        { userId: auth.userId, workspaceId: m.workspace_id },
        async (tx) => {
          const invoice =
            await tx`select ci.* from client_invoice ci where ci.workspace_id = ${m.workspace_id} and ci.client_id = ${m.client_id} and ci.id = ${invoiceId}`
          if (!invoice.length) return []
          const events =
            await tx`select event_type, party, detail, created_at from client_invoice_event where workspace_id = ${m.workspace_id} and client_invoice_id = ${invoiceId} order by created_at`
          return [{ ...invoice[0], events, lines: invoice[0].snapshot?.lines ?? [] }]
        },
      )
      if (rows.length) return ok(reply, rows[0])
    }
    return fail(reply, 404, 'NOT_FOUND', 'Invoice not found')
  })

  app.post('/api/v1/portal/notifications/:notificationId/read', async (request, reply) => {
    const notificationId = uuid.parse((request.params as { notificationId: string }).notificationId)
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const memberships = await withDbContext(
      { userId: auth.userId },
      (tx) =>
        tx`select workspace_id, client_id from client_membership where user_id = ${auth.userId} and status = 'active'`,
    )
    for (const m of memberships) {
      const updated = await withDbContext(
        { userId: auth.userId, workspaceId: m.workspace_id },
        (tx) =>
          tx`update client_notification set read_at = now() where id = ${notificationId} and workspace_id = ${m.workspace_id} and client_id = ${m.client_id} and (user_id is null or user_id = ${auth.userId}) and read_at is null returning id`,
      )
      if (updated.length) return ok(reply, { read: true })
    }
    return fail(reply, 404, 'NOT_FOUND', 'Notification not found')
  })
}
