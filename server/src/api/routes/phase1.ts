import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getDatabase } from '../../db/client.js'
import {
  audit,
  authenticate,
  clearSessionCookie,
  createSession,
  hashPassword,
  normaliseEmail,
  requireContext,
  setSessionCookie,
  slugify,
  validatePassword,
  verifyPassword,
} from '../../modules/core.js'

const uuid = z.string().uuid()
const workspaceParams = z.object({ workspaceId: uuid })
const resourceParams = z.object({ workspaceId: uuid, id: uuid })
const registerSchema = z
  .object({
    email: z.string().email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(128),
    workspaceName: z.string().trim().min(2).max(160).optional(),
  })
  .strict()
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) }).strict()
const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    contactEmail: z.string().email().max(320).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
  })
  .strict()
const projectSchema = z
  .object({
    clientId: uuid,
    name: z.string().trim().min(1).max(160),
    description: z.string().max(5000).optional().nullable(),
    startDate: z.string().date().optional().nullable(),
    targetEndDate: z.string().date().optional().nullable(),
  })
  .strict()
const contractSchema = z
  .object({
    clientId: uuid,
    projectId: uuid.optional().nullable(),
    reference: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    description: z.string().max(5000).optional().nullable(),
    billingModel: z.enum(['hourly', 'fixed_milestone']),
    currency: z.string().regex(/^[A-Z]{3}$/),
    hourlyRateMinor: z.number().int().nonnegative().optional(),
    contractValueMinor: z.number().int().nonnegative().optional(),
    effectiveDate: z.string().date(),
    endDate: z.string().date().optional().nullable(),
  })
  .strict()
const timeSchema = z
  .object({
    projectId: uuid,
    contractId: uuid.optional().nullable(),
    userId: uuid.optional(),
    workDate: z.string().date(),
    durationMinutes: z.number().int().positive().max(1440),
    description: z.string().trim().min(3).max(2000),
    billable: z.boolean().optional(),
  })
  .strict()
const milestoneSchema = z
  .object({
    projectId: uuid,
    contractId: uuid,
    title: z.string().trim().min(1).max(160),
    description: z.string().max(5000).optional().nullable(),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    dueDate: z.string().date().optional().nullable(),
  })
  .strict()
const rejectSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict()
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const error = new Error('Invalid request')
    ;(error as Error & { statusCode: number; code: string; details: unknown }).statusCode = 422
    ;(error as Error & { code: string }).code = 'VALIDATION_ERROR'
    ;(error as Error & { details: unknown }).details = result.error.flatten()
    throw error
  }
  return result.data
}
function params(request: FastifyRequest) {
  return resourceParams.parse(request.params)
}
function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}
async function ensureWorkspaceRelation(
  workspaceId: string,
  clientId: string,
  projectId?: string | null,
  contractId?: string | null,
) {
  const db = getDatabase()
  const [client] =
    await db`select id from client where workspace_id = ${workspaceId} and id = ${clientId} and status <> 'archived'`
  if (!client)
    throw Object.assign(new Error('Related client not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  if (projectId) {
    const [project] =
      await db`select id from project where workspace_id = ${workspaceId} and id = ${projectId} and client_id = ${clientId}`
    if (!project)
      throw Object.assign(new Error('Related project not found'), {
        statusCode: 422,
        code: 'RELATIONSHIP_MISMATCH',
      })
  }
  if (contractId) {
    const [contract] =
      await db`select id from contract where workspace_id = ${workspaceId} and id = ${contractId} and (project_id is null or project_id = ${projectId ?? null})`
    if (!contract)
      throw Object.assign(new Error('Related contract not found'), {
        statusCode: 422,
        code: 'RELATIONSHIP_MISMATCH',
      })
  }
}
async function requireRole(
  request: FastifyRequest,
  workspaceId: string,
  permission: 'read' | 'write' | 'approve' | 'manage',
) {
  return requireContext(request, workspaceId, permission)
}

export async function phase1Routes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = parse(registerSchema, request.body)
    if (!validatePassword(input.password))
      throw Object.assign(
        new Error('Password must be at least 12 characters and include letters and numbers'),
        { statusCode: 422, code: 'INVALID_PASSWORD' },
      )
    const db = getDatabase()
    const email = normaliseEmail(input.email)
    try {
      const result = await db.begin(async (tx) => {
        const [user] =
          await tx`insert into app_user (email, name, password_hash) values (${email}, ${input.name}, ${await hashPassword(input.password)}) returning id, email, name, status, created_at`
        const name = input.workspaceName ?? `${input.name}'s workspace`
        let slug = slugify(name) || `workspace-${user.id.slice(0, 8)}`
        const [existing] = await tx`select id from workspace where slug = ${slug}`
        if (existing) slug = `${slug}-${user.id.slice(0, 8)}`
        const [workspace] =
          await tx`insert into workspace (name, slug, owner_id) values (${name}, ${slug}, ${user.id}) returning id, name, slug, status`
        await tx`insert into membership (workspace_id, user_id, role) values (${workspace.id}, ${user.id}, 'owner')`
        return { user, workspace }
      })
      const session = await createSession(result.user.id as string)
      setSessionCookie(reply, session.token)
      reply.header('x-csrf-token', session.csrfToken)
      await audit(
        result.workspace.id as string,
        result.user.id as string,
        'workspace.created',
        'workspace',
        result.workspace.id as string,
        result.workspace,
        request.id,
      )
      return ok(
        reply,
        { user: result.user, workspace: result.workspace, csrfToken: session.csrfToken },
        201,
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw Object.assign(new Error('An account with that email already exists'), {
          statusCode: 409,
          code: 'DUPLICATE_EMAIL',
        })
      throw error
    }
  })
  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = parse(loginSchema, request.body)
    const [user] =
      await getDatabase()`select id, email, name, password_hash, status from app_user where email = ${normaliseEmail(input.email)}`
    if (
      !user ||
      user.status !== 'active' ||
      !(await verifyPassword(input.password, user.password_hash as string))
    )
      throw Object.assign(new Error('Invalid email or password'), {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      })
    await getDatabase()`update app_user set last_login_at = now(), updated_at = now() where id = ${user.id}`
    const session = await createSession(user.id as string)
    setSessionCookie(reply, session.token)
    reply.header('x-csrf-token', session.csrfToken)
    return ok(reply, {
      user: { id: user.id, email: user.email, name: user.name },
      csrfToken: session.csrfToken,
    })
  })
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const auth = await authenticate(request)
    if (auth) await (await import('../../modules/core.js')).revokeSession(auth)
    clearSessionCookie(reply)
    return ok(reply, { loggedOut: true })
  })
  app.get('/api/v1/auth/me', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth)
      throw Object.assign(new Error('Authentication required'), {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      })
    const [user] =
      await getDatabase()`select id, email, name, status, created_at, last_login_at from app_user where id = ${auth.userId}`
    const workspaces =
      await getDatabase()`select w.id, w.name, w.slug, m.role from workspace w join membership m on m.workspace_id = w.id where m.user_id = ${auth.userId} and m.status = 'active'`
    return ok(reply, { user, workspaces, csrfToken: auth.csrfToken })
  })

  app.post('/api/v1/workspaces', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth)
      throw Object.assign(new Error('Authentication required'), {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      })
    const body = parse(
      z
        .object({
          name: z.string().trim().min(2).max(160),
          slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .optional(),
        })
        .strict(),
      request.body,
    )
    const db = getDatabase()
    const slug = body.slug ?? slugify(body.name)
    const result = await db.begin(async (tx) => {
      const [workspace] =
        await tx`insert into workspace (name, slug, owner_id) values (${body.name}, ${slug}, ${auth.userId}) returning id, name, slug, status`
      await tx`insert into membership (workspace_id, user_id, role) values (${workspace.id}, ${auth.userId}, 'owner')`
      return workspace
    })
    await audit(
      result.id as string,
      auth.userId,
      'workspace.created',
      'workspace',
      result.id as string,
      result,
      request.id,
    )
    return ok(reply, result, 201)
  })
  app.get('/api/v1/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    await requireRole(request, workspaceId, 'read')
    return ok(
      reply,
      await getDatabase()`select m.id, m.user_id, u.email, u.name, m.role, m.status, m.created_at from membership m join app_user u on u.id = m.user_id where m.workspace_id = ${workspaceId} and m.status = 'active' order by m.created_at`,
    )
  })
  app.post('/api/v1/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'manage')
    const body = parse(
      z.object({ email: z.string().email(), role: z.enum(['admin', 'member']) }).strict(),
      request.body,
    )
    const [user] =
      await getDatabase()`select id from app_user where email = ${normaliseEmail(body.email)} and status = 'active'`
    if (!user)
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' })
    const [member] =
      await getDatabase()`insert into membership (workspace_id, user_id, role) values (${workspaceId}, ${user.id}, ${body.role}) returning id, user_id, role, status`
    await audit(
      workspaceId,
      auth.userId,
      'membership.created',
      'membership',
      member.id as string,
      member,
      request.id,
    )
    return ok(reply, member, 201)
  })

  const collection = async (
    request: FastifyRequest,
    reply: FastifyReply,
    table: string,
    permission: 'read' | 'write' = 'read',
  ) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    await requireRole(request, workspaceId, permission)
    const rows = await getDatabase().unsafe(
      `select * from ${table} where workspace_id = $1 order by created_at desc`,
      [workspaceId],
    )
    return ok(reply, rows)
  }
  app.get('/api/v1/workspaces/:workspaceId/clients', (r, p) => collection(r, p, 'client'))
  app.get('/api/v1/workspaces/:workspaceId/projects', (r, p) => collection(r, p, 'project'))
  app.get('/api/v1/workspaces/:workspaceId/contracts', (r, p) => collection(r, p, 'contract'))
  app.get('/api/v1/workspaces/:workspaceId/time-entries', (r, p) => collection(r, p, 'time_entry'))
  app.get('/api/v1/workspaces/:workspaceId/milestones', (r, p) => collection(r, p, 'milestone'))

  app.post('/api/v1/workspaces/:workspaceId/clients', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'write')
    const b = parse(clientSchema, request.body)
    const [row] =
      await getDatabase()`insert into client (workspace_id, name, contact_email, notes) values (${workspaceId}, ${b.name}, ${b.contactEmail ?? null}, ${b.notes ?? null}) returning *`
    await audit(
      workspaceId,
      auth.userId,
      'client.created',
      'client',
      row.id as string,
      row,
      request.id,
    )
    return ok(reply, row, 201)
  })
  app.post('/api/v1/workspaces/:workspaceId/projects', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'write')
    const b = parse(projectSchema, request.body)
    const [client] =
      await getDatabase()`select id from client where workspace_id = ${workspaceId} and id = ${b.clientId} and status = 'active'`
    if (!client)
      throw Object.assign(new Error('Client not found'), { statusCode: 404, code: 'NOT_FOUND' })
    const [row] =
      await getDatabase()`insert into project (workspace_id, client_id, name, description, start_date, target_end_date, created_by, updated_by) values (${workspaceId}, ${b.clientId}, ${b.name}, ${b.description ?? null}, ${b.startDate ?? null}, ${b.targetEndDate ?? null}, ${auth.userId}, ${auth.userId}) returning *`
    await audit(
      workspaceId,
      auth.userId,
      'project.created',
      'project',
      row.id as string,
      row,
      request.id,
    )
    return ok(reply, row, 201)
  })
  app.post('/api/v1/workspaces/:workspaceId/contracts', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'write')
    const b = parse(contractSchema, request.body)
    if (b.billingModel === 'hourly' && b.hourlyRateMinor === undefined)
      throw Object.assign(new Error('Hourly contracts require hourlyRateMinor'), {
        statusCode: 422,
        code: 'INVALID_CONTRACT',
      })
    if (b.billingModel === 'fixed_milestone' && b.contractValueMinor === undefined)
      throw Object.assign(new Error('Fixed contracts require contractValueMinor'), {
        statusCode: 422,
        code: 'INVALID_CONTRACT',
      })
    await ensureWorkspaceRelation(workspaceId, b.clientId, b.projectId)
    const [row] =
      await getDatabase()`insert into contract (workspace_id, client_id, project_id, reference, title, description, billing_model, currency, hourly_rate_minor, contract_value_minor, effective_date, end_date, created_by) values (${workspaceId}, ${b.clientId}, ${b.projectId ?? null}, ${b.reference}, ${b.title}, ${b.description ?? null}, ${b.billingModel}, ${b.currency}, ${b.hourlyRateMinor ?? null}, ${b.contractValueMinor ?? null}, ${b.effectiveDate}, ${b.endDate ?? null}, ${auth.userId}) returning *`
    await audit(
      workspaceId,
      auth.userId,
      'contract.created',
      'contract',
      row.id as string,
      row,
      request.id,
    )
    return ok(reply, row, 201)
  })
  app.post('/api/v1/workspaces/:workspaceId/time-entries', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'write')
    const b = parse(timeSchema, request.body)
    const [project] =
      await getDatabase()`select id, status from project where workspace_id = ${workspaceId} and id = ${b.projectId}`
    if (!project || project.status === 'archived')
      throw Object.assign(new Error('Project unavailable'), {
        statusCode: 422,
        code: 'INVALID_PROJECT',
      })
    if (b.contractId)
      await ensureWorkspaceRelation(
        workspaceId,
        (await getDatabase()`select client_id from project where id = ${b.projectId}`)[0]
          ?.client_id as string,
        b.projectId,
        b.contractId,
      )
    const [row] =
      await getDatabase()`insert into time_entry (workspace_id, project_id, contract_id, user_id, work_date, duration_minutes, description, billable) values (${workspaceId}, ${b.projectId}, ${b.contractId ?? null}, ${b.userId ?? auth.userId}, ${b.workDate}, ${b.durationMinutes}, ${b.description}, ${b.billable ?? true}) returning *`
    await audit(
      workspaceId,
      auth.userId,
      'time_entry.created',
      'time_entry',
      row.id as string,
      row,
      request.id,
    )
    return ok(reply, row, 201)
  })
  app.post('/api/v1/workspaces/:workspaceId/milestones', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    const { auth } = await requireRole(request, workspaceId, 'write')
    const b = parse(milestoneSchema, request.body)
    const [project] =
      await getDatabase()`select id from project where workspace_id = ${workspaceId} and id = ${b.projectId}`
    if (!project)
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'NOT_FOUND' })
    const [contract] =
      await getDatabase()`select id, billing_model, currency from contract where workspace_id = ${workspaceId} and id = ${b.contractId} and project_id = ${b.projectId}`
    if (
      !contract ||
      contract.billing_model !== 'fixed_milestone' ||
      contract.currency !== b.currency
    )
      throw Object.assign(new Error('Contract relationship or currency is invalid'), {
        statusCode: 422,
        code: 'RELATIONSHIP_MISMATCH',
      })
    const [row] =
      await getDatabase()`insert into milestone (workspace_id, project_id, contract_id, title, description, amount_minor, currency, due_date, created_by) values (${workspaceId}, ${b.projectId}, ${b.contractId}, ${b.title}, ${b.description ?? null}, ${b.amountMinor}, ${b.currency}, ${b.dueDate ?? null}, ${auth.userId}) returning *`
    await audit(
      workspaceId,
      auth.userId,
      'milestone.created',
      'milestone',
      row.id as string,
      row,
      request.id,
    )
    return ok(reply, row, 201)
  })

  app.post('/api/v1/workspaces/:workspaceId/contracts/:id/activate', async (request, reply) =>
    transition(request, reply, 'contract', 'active', 'write'),
  )
  app.post('/api/v1/workspaces/:workspaceId/contracts/:id/complete', async (request, reply) =>
    transition(request, reply, 'contract', 'completed', 'write'),
  )
  app.post('/api/v1/workspaces/:workspaceId/time-entries/:id/submit', async (request, reply) =>
    transition(request, reply, 'time_entry', 'submitted', 'write'),
  )
  app.post('/api/v1/workspaces/:workspaceId/time-entries/:id/approve', async (request, reply) =>
    transition(request, reply, 'time_entry', 'approved', 'approve'),
  )
  app.post('/api/v1/workspaces/:workspaceId/time-entries/:id/reject', async (request, reply) => {
    const { workspaceId, id: entryId } = params(request)
    const { auth } = await requireRole(request, workspaceId, 'approve')
    const b = parse(rejectSchema, request.body)
    const [row] =
      await getDatabase()`update time_entry set status = 'rejected', rejection_reason = ${b.reason}, reviewer_id = ${auth.userId}, reviewed_at = now(), updated_at = now() where workspace_id = ${workspaceId} and id = ${entryId} and status = 'submitted' returning *`
    if (!row)
      throw Object.assign(new Error('Invalid time-entry transition'), {
        statusCode: 409,
        code: 'INVALID_STATE',
      })
    await audit(
      workspaceId,
      auth.userId,
      'time_entry.rejected',
      'time_entry',
      entryId,
      row,
      request.id,
    )
    return ok(reply, row)
  })
  app.post('/api/v1/workspaces/:workspaceId/milestones/:id/complete', async (request, reply) =>
    transition(request, reply, 'milestone', 'completed', 'write'),
  )
  app.post('/api/v1/workspaces/:workspaceId/milestones/:id/accept', async (request, reply) =>
    transition(request, reply, 'milestone', 'accepted', 'approve'),
  )
  app.get('/api/v1/workspaces/:workspaceId/audit-events', async (request, reply) => {
    const { workspaceId } = parse(workspaceParams, request.params)
    await requireRole(request, workspaceId, 'read')
    return ok(
      reply,
      await getDatabase()`select id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id, created_at from audit_event where workspace_id = ${workspaceId} order by created_at desc limit 100`,
    )
  })
}

async function transition(
  request: FastifyRequest,
  reply: FastifyReply,
  table: 'contract' | 'time_entry' | 'milestone',
  next: string,
  permission: 'write' | 'approve',
) {
  const { workspaceId, id: entityId } = params(request)
  const { auth } = await requireRole(request, workspaceId, permission)
  const allowed: Record<string, Record<string, string[]>> = {
    contract: { active: ['draft'], completed: ['active'] },
    time_entry: { submitted: ['draft', 'rejected'], approved: ['submitted'] },
    milestone: { completed: ['draft', 'in_progress'], accepted: ['completed'] },
  }
  const previous = allowed[table][next] ?? []
  const extra =
    table === 'time_entry' && next === 'approved'
      ? ', reviewer_id = $2, reviewed_at = now()'
      : table === 'milestone' && next === 'completed'
        ? ', completed_by = $2, completed_at = now()'
        : table === 'milestone' && next === 'accepted'
          ? ', accepted_by = $2, accepted_at = now()'
          : ''
  const query = `update ${table} set status = $1, updated_at = now()${extra} where workspace_id = $3 and id = $4 and status = any($5::varchar[]) returning *`
  const [row] = await getDatabase().unsafe(query, [
    next,
    auth.userId,
    workspaceId,
    entityId,
    previous,
  ])
  if (!row)
    throw Object.assign(new Error('Invalid state transition or record not found'), {
      statusCode: 409,
      code: 'INVALID_STATE',
    })
  await audit(workspaceId, auth.userId, `${table}.${next}`, table, entityId, row, request.id)
  return ok(reply, row)
}
