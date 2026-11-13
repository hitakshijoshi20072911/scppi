import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { TransactionSql } from 'postgres'
import { z } from 'zod'
import { getDatabase } from '../../db/client.js'
import { createAuditedSwytchcodeExecutor } from '../../db/repositories/provider-execution.js'
import { config } from '../../platform/config.js'
import { swytchcodeTenantManager } from '../../swytchcode/tenants.js'
import {
  classifyWorkItem,
  type ScopeKeywordRule,
} from '../../modules/reconciliation/classification.js'
import {
  ReconciliationTransitionError,
  transitionReconciliation,
  type ReconciliationState,
} from '../../modules/reconciliation/state-machine.js'
import { authenticate, requireContext, setDbContext } from '../../modules/core.js'
import { GithubAdapter } from '../../providers/github/adapter.js'
import { unavailableExecutor, type SwytchcodeExecutor } from '../../swytchcode/executor.js'
const uuid = z.string().uuid()
const paramsSchema = z.object({ workspaceId: uuid, projectId: uuid }).strict()
const sourceParamsSchema = z.object({ workspaceId: uuid, projectId: uuid, sourceId: uuid }).strict()
const contractParamsSchema = z
  .object({ workspaceId: uuid, projectId: uuid, contractId: uuid })
  .strict()
const runParamsSchema = z.object({ workspaceId: uuid, projectId: uuid, runId: uuid }).strict()
const itemParamsSchema = z
  .object({ workspaceId: uuid, projectId: uuid, runId: uuid, itemId: uuid })
  .strict()
const repositorySchema = z
  .object({
    provider: z.literal('github'),
    owner: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_.-]+$/),
    repo: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_.-]+$/),
  })
  .strict()
const createRunSchema = z
  .object({
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
  })
  .strict()
const versionSchema = z.object({ runVersion: z.number().int().nonnegative() }).strict()
const scopeRulesSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            category: z
              .string()
              .trim()
              .min(1)
              .max(64)
              .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
            keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
const decisionSchema = z
  .object({
    runVersion: z.number().int().nonnegative(),
    decision: z.enum(['approve', 'reject']),
    category: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
      .optional(),
    clientDescription: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

function fail(statusCode: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { statusCode, code })
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    fail(422, 'VALIDATION_ERROR', 'Request did not match the expected schema')
  }
  return result.data
}

function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}

async function withWorkspace<T>(
  request: FastifyRequest,
  workspaceId: string,
  action: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const { auth } = await requireContext(request, workspaceId, 'read')
  const result = await getDatabase().begin(async (tx) => {
    await setDbContext(tx, { userId: auth.userId, sessionId: auth.sessionId, workspaceId })
    return action(tx)
  })
  // postgres-js unwraps query arrays from transaction callbacks; the service callback owns T.
  return result as unknown as T
}

function transitionError(error: unknown): never {
  if (error instanceof ReconciliationTransitionError) {
    const statusCode = error.code === 'VERSION_CONFLICT' ? 409 : 422
    fail(statusCode, error.code, error.message)
  }
  throw error
}

function dbState(row: unknown): ReconciliationState {
  if (typeof row !== 'object' || row === null)
    fail(500, 'INVALID_RUN_STATE', 'Stored run state is invalid')
  const values = row as Record<string, unknown>
  if (
    typeof values.status !== 'string' ||
    typeof values.version !== 'number' ||
    typeof values.outstanding_decisions !== 'number'
  )
    fail(500, 'INVALID_RUN_STATE', 'Stored run state is invalid')
  return {
    status: values.status as ReconciliationState['status'],
    version: values.version,
    outstandingDecisions: values.outstanding_decisions,
  }
}

function localDateToUtc(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new Error('Invalid date')
  const desiredUtc = Date.UTC(year, month - 1, day)
  let estimate = desiredUtc
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(estimate))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((entry) => entry.type === type)?.value)
    const representedUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    )
    estimate += desiredUtc - representedUtc
  }
  return new Date(estimate)
}

function isInPeriod(value: string, start: Date, end: Date): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime()
}

function evidenceHash(item: {
  externalId: string
  type: string
  title: string
  state: string
  author: string
  url: string
  createdAt: string
  updatedAt: string
}): string {
  return createHash('sha256').update(JSON.stringify(item)).digest('hex')
}

function safeCorrelationId(request: FastifyRequest): string {
  return createHash('sha256').update(request.id).digest('hex').slice(0, 48)
}

export interface Phase2RouteOptions {
  executor?: SwytchcodeExecutor
}

export async function phase2Routes(app: FastifyInstance, options: Phase2RouteOptions = {}) {
  const providerExecutor = options.executor ?? unavailableExecutor
  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return
    const origin = request.headers.origin
    if (origin && origin !== config.API_CORS_ORIGIN && !config.API_CORS_ORIGINS.includes(origin))
      fail(403, 'FORBIDDEN_ORIGIN', 'Origin is not allowed')
    const auth = await authenticate(request)
    if (auth && request.headers['x-csrf-token'] !== auth.csrfToken)
      fail(403, 'CSRF_INVALID', 'CSRF validation failed')
  })
  app.get('/api/v1/workspaces/:workspaceId/projects/:projectId/sources', async (request, reply) => {
    const { workspaceId, projectId } = parse(paramsSchema, request.params)
    await requireContext(request, workspaceId, 'read')
    const sources = await withWorkspace(
      request,
      workspaceId,
      async (tx) =>
        tx`select id, provider, repository_owner, repository_name, repository_url, connection_status, created_at, updated_at from source_connection where workspace_id = ${workspaceId} and project_id = ${projectId} order by created_at`,
    )
    return ok(reply, sources)
  })

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/sources',
    async (request, reply) => {
      const { workspaceId, projectId } = parse(paramsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(repositorySchema, request.body)
      try {
        const result = await withWorkspace(request, workspaceId, async (tx) => {
          const [project] =
            await tx`select id from project where workspace_id = ${workspaceId} and id = ${projectId} and status = 'active'`
          if (!project) fail(404, 'NOT_FOUND', 'Project not found')
          const repositoryUrl = `https://github.com/${body.owner}/${body.repo}`
          const [source] =
            await tx`insert into source_connection (workspace_id, project_id, provider, repository_owner, repository_name, repository_url, connection_status, created_by) values (${workspaceId}, ${projectId}, 'github', ${body.owner}, ${body.repo}, ${repositoryUrl}, 'not_connected', ${auth.userId}) returning id, provider, repository_owner, repository_name, repository_url, connection_status, created_at`
          await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'source.mapped', 'source_connection', ${source.id}, ${JSON.stringify(source)}, ${safeCorrelationId(request)})`
          return source
        })
        return ok(reply, result, 201)
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          fail(409, 'SOURCE_ALREADY_MAPPED', 'This repository is already mapped to the project')
        throw error
      }
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/sources/:sourceId/connect',
    async (request, reply) => {
      const { workspaceId, projectId, sourceId } = parse(sourceParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      if (!config.SWYTCHCODE_TOKEN)
        fail(503, 'SWYTCHCODE_NOT_CONFIGURED', 'Swytchcode is not configured on this server')
      const source = await withWorkspace(request, workspaceId, async (tx) => {
        const [row] =
          await tx`select id, provider, repository_owner, repository_name, connection_status from source_connection where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${sourceId}`
        if (!row) fail(404, 'NOT_FOUND', 'Repository source not found')
        if (row.connection_status === 'disabled')
          fail(409, 'SOURCE_DISABLED', 'Disabled repository sources cannot be connected')
        return row
      })
      try {
        const result = swytchcodeTenantManager.connect(source.provider, workspaceId)
        await withWorkspace(
          request,
          workspaceId,
          async (tx) =>
            tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'source.connection_initiated', 'source_connection', ${source.id}, ${JSON.stringify({ provider: source.provider, repository: `${source.repository_owner}/${source.repository_name}` })}, ${safeCorrelationId(request)})`,
        )
        return ok(reply, { url: result.url, expiresInSeconds: 600 })
      } catch {
        fail(503, 'SWYTCHCODE_CONNECTION_FAILED', 'GitHub connection could not be started')
      }
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/sources/:sourceId/verify',
    async (request, reply) => {
      const { workspaceId, projectId, sourceId } = parse(sourceParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      if (!config.SWYTCHCODE_TOKEN)
        fail(503, 'SWYTCHCODE_NOT_CONFIGURED', 'Swytchcode is not configured on this server')
      const source = await withWorkspace(request, workspaceId, async (tx) => {
        const [row] =
          await tx`select id, provider, repository_owner, repository_name, connection_status from source_connection where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${sourceId}`
        if (!row) fail(404, 'NOT_FOUND', 'Repository source not found')
        if (row.connection_status === 'disabled')
          fail(409, 'SOURCE_DISABLED', 'Disabled repository sources cannot be verified')
        return row
      })
      try {
        await new GithubAdapter(
          createAuditedSwytchcodeExecutor(providerExecutor, source.id),
        ).listPullRequests(
          { workspaceId },
          { owner: source.repository_owner, repo: source.repository_name, perPage: 1, maxPages: 1 },
        )
      } catch {
        fail(
          409,
          'GITHUB_VERIFICATION_FAILED',
          'GitHub consent or repository access is not verified',
        )
      }
      const updated = await withWorkspace(request, workspaceId, async (tx) => {
        const [row] =
          await tx`update source_connection set connection_status = 'connected', connected_at = coalesce(connected_at, now()), updated_at = now() where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${sourceId} returning id, provider, repository_owner, repository_name, repository_url, connection_status, connected_at, updated_at`
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'source.connection_verified', 'source_connection', ${sourceId}, ${JSON.stringify({ provider: 'github', verification: 'read_repository' })}, ${safeCorrelationId(request)})`
        return row
      })
      return ok(reply, updated)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/sources/:sourceId/disconnect',
    async (request, reply) => {
      const { workspaceId, projectId, sourceId } = parse(sourceParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const source = await withWorkspace(request, workspaceId, async (tx) => {
        const [row] =
          await tx`select id, provider, connection_status from source_connection where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${sourceId}`
        if (!row) fail(404, 'NOT_FOUND', 'Repository source not found')
        return row
      })
      if (!config.SWYTCHCODE_TOKEN)
        fail(503, 'SWYTCHCODE_NOT_CONFIGURED', 'Swytchcode is not configured on this server')
      try {
        swytchcodeTenantManager.disconnect(source.provider, workspaceId)
      } catch {
        fail(503, 'SWYTCHCODE_DISCONNECT_FAILED', 'GitHub connection could not be revoked')
      }
      const updated = await withWorkspace(request, workspaceId, async (tx) => {
        const [row] =
          await tx`update source_connection set connection_status = 'not_connected', connected_at = null, updated_at = now() where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${sourceId} returning id, provider, repository_owner, repository_name, repository_url, connection_status, connected_at, updated_at`
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'source.connection_revoked', 'source_connection', ${sourceId}, ${JSON.stringify({ provider: source.provider })}, ${safeCorrelationId(request)})`
        return row
      })
      return ok(reply, updated)
    },
  )

  app.put(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/contracts/:contractId/scope-rules',
    async (request, reply) => {
      const { workspaceId, projectId, contractId } = parse(contractParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(scopeRulesSchema, request.body)
      const result = await withWorkspace(request, workspaceId, async (tx) => {
        const [project] =
          await tx`select id from project where workspace_id = ${workspaceId} and id = ${projectId} and status = 'active'`
        if (!project) fail(404, 'NOT_FOUND', 'Project not found')
        const [contract] =
          await tx`select id from contract where workspace_id = ${workspaceId} and id = ${contractId} and project_id = ${projectId} and status = 'active'`
        if (!contract)
          fail(
            409,
            'ACTIVE_CONTRACT_REQUIRED',
            'An active project contract is required before scope rules can be set',
          )
        const [used] =
          await tx`select id from billing_run where workspace_id = ${workspaceId} and contract_id = ${contract.id} limit 1`
        if (used)
          fail(
            409,
            'SCOPE_RULES_LOCKED',
            'Scope rules are immutable after a reconciliation run uses this contract',
          )
        const parsedRules: ScopeKeywordRule[] = body.rules.map((rule, index) => ({
          id: `scope-${index + 1}`,
          category: rule.category,
          keywords: rule.keywords,
        }))
        const validation = classifyWorkItem(
          { id: 'scope-validation', title: 'scope rule validation' },
          parsedRules,
        )
        if (validation.reason === 'invalid_rules')
          fail(422, 'INVALID_SCOPE_RULES', 'Scope rules contain duplicate or invalid keywords')
        await tx`delete from scope_rule where workspace_id = ${workspaceId} and project_id = ${projectId} and contract_id = ${contract.id}`
        const stored = []
        for (const rule of body.rules) {
          const [row] =
            await tx`insert into scope_rule (workspace_id, project_id, contract_id, category, keywords, created_by) values (${workspaceId}, ${projectId}, ${contract.id}, ${rule.category}, ${JSON.stringify(rule.keywords)}::jsonb, ${auth.userId}) returning id, category, keywords, enabled`
          stored.push(row)
        }
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'scope_rules.replaced', 'project', ${projectId}, ${JSON.stringify({ count: stored.length, contractId: contract.id })}, ${safeCorrelationId(request)})`
        return stored
      })
      return ok(reply, result)
    },
  )

  app.post('/api/v1/workspaces/:workspaceId/projects/:projectId/runs', async (request, reply) => {
    const { workspaceId, projectId } = parse(paramsSchema, request.params)
    const { auth } = await requireContext(request, workspaceId, 'read')
    const body = parse(createRunSchema, request.body)
    if (body.periodEnd <= body.periodStart)
      fail(422, 'INVALID_PERIOD', 'periodEnd must be later than periodStart')
    const periodDays =
      (Date.parse(`${body.periodEnd}T00:00:00Z`) - Date.parse(`${body.periodStart}T00:00:00Z`)) /
      86_400_000
    if (periodDays > 366)
      fail(422, 'INVALID_PERIOD', 'Reconciliation periods cannot exceed 366 days')
    const result = await withWorkspace(request, workspaceId, async (tx) => {
      const [project] =
        await tx`select id, time_zone from project where workspace_id = ${workspaceId} and id = ${projectId} and status = 'active'`
      if (!project) fail(404, 'NOT_FOUND', 'Project not found')
      try {
        new Intl.DateTimeFormat('en', { timeZone: project.time_zone as string })
      } catch {
        fail(422, 'INVALID_PROJECT_TIME_ZONE', 'Project time zone is not a valid IANA zone')
      }
      const [contract] =
        await tx`select id from contract where workspace_id = ${workspaceId} and project_id = ${projectId} and status = 'active' and effective_date <= ${body.periodStart} and (end_date is null or end_date >= (${body.periodEnd}::date - 1)) order by effective_date desc limit 1`
      if (!contract)
        fail(
          409,
          'ACTIVE_CONTRACT_REQUIRED',
          'An active contract covering the reconciliation period is required',
        )
      const storedRules =
        await tx`select id, category, keywords from scope_rule where workspace_id = ${workspaceId} and project_id = ${projectId} and contract_id = ${contract.id} and enabled = true order by created_at, id`
      const rulesSnapshot = storedRules.map((rule) => ({
        id: String(rule.id),
        category: String(rule.category),
        keywords: Array.isArray(rule.keywords) ? rule.keywords : [],
      }))
      const [run] =
        await tx`insert into billing_run (workspace_id, project_id, contract_id, period_start, period_end, time_zone, scope_rules_snapshot, status, completeness, version, created_by) values (${workspaceId}, ${projectId}, ${contract.id}, ${body.periodStart}, ${body.periodEnd}, ${project.time_zone}, ${JSON.stringify(rulesSnapshot)}::jsonb, 'created', 'unknown', 0, ${auth.userId}) returning id, project_id, contract_id, period_start, period_end, time_zone, status, completeness, version, created_at`
      await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.created', 'billing_run', ${run.id}, ${JSON.stringify(run)}, ${safeCorrelationId(request)})`
      return run
    })
    return ok(reply, result, 201)
  })

  app.get('/api/v1/workspaces/:workspaceId/projects/:projectId/runs', async (request, reply) => {
    const { workspaceId, projectId } = parse(paramsSchema, request.params)
    await requireContext(request, workspaceId, 'read')
    const runs = await withWorkspace(request, workspaceId, async (tx) => {
      const [project] =
        await tx`select id from project where workspace_id = ${workspaceId} and id = ${projectId}`
      if (!project) fail(404, 'NOT_FOUND', 'Project not found')
      return tx`select id, project_id, contract_id, period_start, period_end, time_zone, status, completeness, version, outstanding_decisions, accepted_partial_at, created_at, updated_at from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} order by created_at desc limit 100`
    })
    return ok(reply, runs)
  })

  app.get(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      await requireContext(request, workspaceId, 'read')
      const [run] = await withWorkspace(
        request,
        workspaceId,
        async (tx) =>
          tx`select id, project_id, period_start, period_end, time_zone, status, completeness, version, outstanding_decisions, accepted_partial_at, created_at, updated_at from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId}`,
      )
      if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
      return ok(reply, run)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/start',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'read')
      const body = parse(versionSchema, request.body)
      const correlationId = safeCorrelationId(request)
      let snapshot: {
        run: { id: string; period_start: string; period_end: string; time_zone: string }
        sources: Array<{
          id: string
          repository_owner: string
          repository_name: string
          connection_status: string
        }>
        state: ReconciliationState
      }
      try {
        snapshot = await withWorkspace(request, workspaceId, async (tx) => {
          const [run] =
            await tx`select id, project_id, period_start, period_end, time_zone, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
          if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
          const sources =
            await tx`select id, repository_owner, repository_name, connection_status from source_connection where workspace_id = ${workspaceId} and project_id = ${projectId} and connection_status <> 'disabled' order by created_at`
          if (sources.length === 0)
            fail(
              409,
              'SOURCE_REQUIRED',
              'Map at least one GitHub repository before starting ingestion',
            )
          const state = transitionReconciliation(
            dbState(run),
            { type: 'start-ingestion' },
            body.runVersion,
          )
          await tx`update billing_run set status = ${state.status}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion}`
          for (const source of sources) {
            await tx`insert into run_source (workspace_id, run_id, source_connection_id, status, started_at, correlation_id) values (${workspaceId}, ${runId}, ${source.id}, 'pending', now(), ${correlationId}) on conflict (workspace_id, run_id, source_connection_id) do nothing`
          }
          await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.ingestion_started', 'billing_run', ${runId}, ${JSON.stringify({ version: state.version, sourceCount: sources.length })}, ${correlationId})`
          return {
            run: {
              id: String(run.id),
              period_start: String(run.period_start),
              period_end: String(run.period_end),
              time_zone: String(run.time_zone),
            },
            sources: sources.map((source) => ({
              id: String(source.id),
              repository_owner: String(source.repository_owner),
              repository_name: String(source.repository_name),
              connection_status: String(source.connection_status),
            })),
            state,
          }
        })
      } catch (error) {
        transitionError(error)
      }

      const start = localDateToUtc(
        String(snapshot.run.period_start).slice(0, 10),
        snapshot.run.time_zone,
      )
      const end = localDateToUtc(
        String(snapshot.run.period_end).slice(0, 10),
        snapshot.run.time_zone,
      )
      let successfulSources = 0
      let failedSources = 0
      let itemsImported = 0
      for (const source of snapshot.sources) {
        if (source.connection_status !== 'connected') {
          failedSources += 1
          await withWorkspace(request, workspaceId, async (tx) => {
            await tx`update run_source set status = 'failed', error_code = 'PROVIDER_NOT_CONNECTED', completed_at = now() where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${source.id}`
          })
          continue
        }

        try {
          const result = await new GithubAdapter(
            createAuditedSwytchcodeExecutor(providerExecutor, source.id),
          ).listPullRequests(
            { workspaceId },
            {
              owner: source.repository_owner,
              repo: source.repository_name,
              perPage: 100,
              maxPages: 10,
            },
          )
          const inPeriod = result.items.filter((item) => isInPeriod(item.createdAt, start, end))
          const github = new GithubAdapter(
            createAuditedSwytchcodeExecutor(providerExecutor, source.id),
          )
          const commits = []
          let commitsComplete = true
          for (const pullRequest of inPeriod) {
            const commitResult = await github.listPullRequestCommits(
              { workspaceId },
              {
                owner: source.repository_owner,
                repo: source.repository_name,
                pullNumber: Number(pullRequest.externalId),
                pullRequestId: pullRequest.externalId,
              },
            )
            commits.push(
              ...commitResult.items.filter((item) => isInPeriod(item.createdAt, start, end)),
            )
            commitsComplete = commitsComplete && commitResult.complete
          }
          const importedItems = [...inPeriod, ...commits]
          await withWorkspace(request, workspaceId, async (tx) => {
            for (const item of importedItems) {
              const hash = evidenceHash(item)
              const relatedExternalId =
                'relatedPullRequestId' in item ? item.relatedPullRequestId : null
              const repositoryExternalId =
                'repositoryExternalId' in item ? (item.repositoryExternalId ?? null) : null
              await tx`insert into work_item (workspace_id, project_id, source_connection_id, provider, external_id, item_type, title, state, author, source_url, provider_created_at, provider_updated_at, content_hash, related_external_id, repository_external_id) values (${workspaceId}, ${projectId}, ${source.id}, 'github', ${item.externalId}, ${item.type}, ${item.title}, ${item.state}, ${item.author}, ${item.url}, ${item.createdAt}, ${item.updatedAt}, ${hash}, ${relatedExternalId}, ${repositoryExternalId}) on conflict (workspace_id, source_connection_id, provider, external_id) do update set title = excluded.title, state = excluded.state, author = excluded.author, source_url = excluded.source_url, provider_created_at = excluded.provider_created_at, provider_updated_at = excluded.provider_updated_at, content_hash = excluded.content_hash, related_external_id = excluded.related_external_id, repository_external_id = excluded.repository_external_id, last_seen_at = now(), updated_at = now() where work_item.content_hash <> excluded.content_hash`
            }
            const complete = result.complete && commitsComplete
            await tx`update run_source set status = ${complete ? 'succeeded' : 'failed'}, items_received = ${importedItems.length}, error_code = ${complete ? null : 'PAGE_LIMIT_REACHED'}, completed_at = now() where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${source.id}`
          })
          itemsImported += importedItems.length
          if (result.complete && commitsComplete) successfulSources += 1
          else failedSources += 1
        } catch {
          failedSources += 1
          await withWorkspace(request, workspaceId, async (tx) => {
            await tx`update run_source set status = 'failed', error_code = 'PROVIDER_READ_FAILED', completed_at = now() where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${source.id}`
          })
        }
      }

      let finalState: ReconciliationState
      try {
        finalState = transitionReconciliation(
          { ...snapshot.state, status: 'ingesting' },
          {
            type: 'ingestion-complete',
            completeness: failedSources === 0 ? 'complete' : 'partial',
          },
          snapshot.state.version,
        )
      } catch (error) {
        transitionError(error)
      }
      const summary = await withWorkspace(request, workspaceId, async (tx) => {
        const [updated] =
          await tx`update billing_run set status = ${finalState.status}, completeness = ${failedSources === 0 ? 'complete' : 'partial'}, version = ${finalState.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${snapshot.state.version} returning id, status, completeness, version`
        if (!updated)
          fail(
            409,
            'VERSION_CONFLICT',
            'Reconciliation run changed while ingestion was in progress',
          )
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.ingestion_completed', 'billing_run', ${runId}, ${JSON.stringify({ status: updated.status, sourceCount: snapshot.sources.length, successfulSources, failedSources, itemsImported })}, ${correlationId})`
        return updated
      })
      return ok(reply, { ...summary, successfulSources, failedSources, itemsImported })
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/retry-source',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(versionSchema.extend({ sourceId: uuid }).strict(), request.body)
      const snapshot = await withWorkspace(request, workspaceId, async (tx) => {
        const [run] =
          await tx`select id, project_id, period_start, period_end, time_zone, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
        if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
        let state: ReconciliationState
        try {
          state = transitionReconciliation(
            dbState(run),
            { type: 'retry-failed-source' },
            body.runVersion,
          )
        } catch (error) {
          transitionError(error)
        }
        const [source] =
          await tx`select s.id, s.repository_owner, s.repository_name, s.connection_status, rs.status as run_source_status from source_connection s join run_source rs on rs.workspace_id = s.workspace_id and rs.source_connection_id = s.id where s.workspace_id = ${workspaceId} and s.project_id = ${projectId} and rs.run_id = ${runId} and s.id = ${body.sourceId} for update`
        if (!source || source.run_source_status !== 'failed')
          fail(404, 'FAILED_SOURCE_NOT_FOUND', 'Failed source not found for this run')
        if (source.connection_status === 'disabled')
          fail(409, 'SOURCE_DISABLED', 'Disabled repository sources cannot be retried')
        await tx`update billing_run set status = ${state.status}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion}`
        await tx`update run_source set status = 'pending', error_code = null, started_at = now(), completed_at = null, correlation_id = ${safeCorrelationId(request)} where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${body.sourceId}`
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.source_retry_started', 'billing_run', ${runId}, ${JSON.stringify({ sourceId: body.sourceId, version: state.version })}, ${safeCorrelationId(request)})`
        return {
          run: {
            period_start: String(run.period_start),
            period_end: String(run.period_end),
            time_zone: String(run.time_zone),
          },
          source: {
            id: String(source.id),
            repository_owner: String(source.repository_owner),
            repository_name: String(source.repository_name),
            connection_status: String(source.connection_status),
          },
          state,
        }
      })

      let imported = 0
      let errorCode: string | null = null
      let sourceReadComplete = false
      if (snapshot.source.connection_status !== 'connected') {
        errorCode = 'PROVIDER_NOT_CONNECTED'
      } else {
        try {
          const readResult = await new GithubAdapter(
            createAuditedSwytchcodeExecutor(providerExecutor, snapshot.source.id),
          ).listPullRequests(
            { workspaceId },
            {
              owner: snapshot.source.repository_owner,
              repo: snapshot.source.repository_name,
              state: 'all',
              perPage: 100,
              maxPages: 10,
            },
          )
          const start = localDateToUtc(
            String(snapshot.run.period_start).slice(0, 10),
            snapshot.run.time_zone,
          )
          const end = localDateToUtc(
            String(snapshot.run.period_end).slice(0, 10),
            snapshot.run.time_zone,
          )
          const inPeriod = readResult.items.filter((item) => isInPeriod(item.createdAt, start, end))
          const github = new GithubAdapter(
            createAuditedSwytchcodeExecutor(providerExecutor, snapshot.source.id),
          )
          const commits = []
          let commitsComplete = true
          for (const pullRequest of inPeriod) {
            const commitResult = await github.listPullRequestCommits(
              { workspaceId },
              {
                owner: snapshot.source.repository_owner,
                repo: snapshot.source.repository_name,
                pullNumber: Number(pullRequest.externalId),
                pullRequestId: pullRequest.externalId,
              },
            )
            commits.push(
              ...commitResult.items.filter((item) => isInPeriod(item.createdAt, start, end)),
            )
            commitsComplete = commitsComplete && commitResult.complete
          }
          const importedItems = [...inPeriod, ...commits]
          await withWorkspace(request, workspaceId, async (tx) => {
            for (const item of importedItems) {
              const hash = evidenceHash(item)
              const relatedExternalId =
                'relatedPullRequestId' in item ? item.relatedPullRequestId : null
              const repositoryExternalId =
                'repositoryExternalId' in item ? (item.repositoryExternalId ?? null) : null
              await tx`insert into work_item (workspace_id, project_id, source_connection_id, provider, external_id, item_type, title, state, author, source_url, provider_created_at, provider_updated_at, content_hash, related_external_id, repository_external_id) values (${workspaceId}, ${projectId}, ${snapshot.source.id}, 'github', ${item.externalId}, ${item.type}, ${item.title}, ${item.state}, ${item.author}, ${item.url}, ${item.createdAt}, ${item.updatedAt}, ${hash}, ${relatedExternalId}, ${repositoryExternalId}) on conflict (workspace_id, source_connection_id, provider, external_id) do update set title = excluded.title, state = excluded.state, author = excluded.author, source_url = excluded.source_url, provider_created_at = excluded.provider_created_at, provider_updated_at = excluded.provider_updated_at, content_hash = excluded.content_hash, related_external_id = excluded.related_external_id, repository_external_id = excluded.repository_external_id, last_seen_at = now(), updated_at = now() where work_item.content_hash <> excluded.content_hash`
            }
            await tx`update run_source set items_received = ${importedItems.length} where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${body.sourceId}`
          })
          imported = importedItems.length
          sourceReadComplete = readResult.complete && commitsComplete
          if (!sourceReadComplete) errorCode = 'PAGE_LIMIT_REACHED'
        } catch {
          errorCode = 'PROVIDER_READ_FAILED'
        }
      }

      const result = await withWorkspace(request, workspaceId, async (tx) => {
        await tx`update run_source set status = ${sourceReadComplete ? 'succeeded' : 'failed'}, error_code = ${errorCode}, completed_at = now() where workspace_id = ${workspaceId} and run_id = ${runId} and source_connection_id = ${body.sourceId}`
        const [remaining] =
          await tx`select count(*)::int as count from run_source where workspace_id = ${workspaceId} and run_id = ${runId} and status <> 'succeeded'`
        const completeness = Number(remaining.count) === 0 ? 'complete' : 'partial'
        let state: ReconciliationState
        try {
          state = transitionReconciliation(
            snapshot.state,
            { type: 'ingestion-complete', completeness },
            snapshot.state.version,
          )
        } catch (error) {
          transitionError(error)
        }
        const [updated] =
          await tx`update billing_run set status = ${state.status}, completeness = ${completeness}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${snapshot.state.version} returning id, status, completeness, version`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Reconciliation run changed while retrying the source')
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.source_retry_completed', 'billing_run', ${runId}, ${JSON.stringify({ sourceId: body.sourceId, status: updated.status, errorCode, itemsImported: imported })}, ${safeCorrelationId(request)})`
        return updated
      })
      return ok(reply, { ...result, itemsImported: imported, sourceErrorCode: errorCode })
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/accept-partial',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(versionSchema, request.body)
      const result = await withWorkspace(request, workspaceId, async (tx) => {
        const [run] =
          await tx`select id, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
        if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
        let state: ReconciliationState
        try {
          state = transitionReconciliation(
            dbState(run),
            { type: 'accept-partial' },
            body.runVersion,
          )
        } catch (error) {
          transitionError(error)
        }
        const [updated] =
          await tx`update billing_run set status = ${state.status}, version = ${state.version}, accepted_partial_at = now(), accepted_partial_by = ${auth.userId}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion} returning id, status, completeness, version, accepted_partial_at`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Reconciliation run changed; reload before retrying')
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.partial_accepted', 'billing_run', ${runId}, ${JSON.stringify({ version: state.version })}, ${safeCorrelationId(request)})`
        return updated
      })
      return ok(reply, result)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/classify',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'read')
      const body = parse(versionSchema, request.body)
      const result = await withWorkspace(request, workspaceId, async (tx) => {
        const [run] =
          await tx`select id, project_id, period_start, period_end, time_zone, scope_rules_snapshot, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
        if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
        let state = dbState(run)
        try {
          if (state.status === 'ingested')
            state = transitionReconciliation(state, { type: 'begin-matching' }, body.runVersion)
          else if (state.status === 'ingested_partial')
            fail(
              409,
              'PARTIAL_ACCEPTANCE_REQUIRED',
              'A workspace administrator must explicitly accept partial ingestion first',
            )
          if (state.status === 'matching')
            state = transitionReconciliation(state, { type: 'begin-classifying' }, state.version)
          if (state.status !== 'classifying')
            fail(409, 'INVALID_STATE', 'Run is not ready for classification')
        } catch (error) {
          transitionError(error)
        }
        const start = localDateToUtc(String(run.period_start).slice(0, 10), run.time_zone)
        const end = localDateToUtc(String(run.period_end).slice(0, 10), run.time_zone)
        const rows =
          await tx`select distinct w.id, w.title from work_item w join run_source rs on rs.workspace_id = w.workspace_id and rs.source_connection_id = w.source_connection_id where rs.workspace_id = ${workspaceId} and rs.run_id = ${runId} and w.project_id = ${projectId} and w.provider_created_at >= ${start.toISOString()} and w.provider_created_at < ${end.toISOString()} order by w.id limit 10000`
        const storedRules = Array.isArray(run.scope_rules_snapshot)
          ? (run.scope_rules_snapshot as Array<{ id: string; category: string; keywords: unknown }>)
          : []
        const rules: ScopeKeywordRule[] = storedRules.map((rule) => ({
          id: String(rule.id),
          category: String(rule.category),
          keywords: Array.isArray(rule.keywords) ? (rule.keywords as string[]) : [],
        }))
        let outstanding = 0
        for (const item of rows) {
          const classification = classifyWorkItem(
            { id: String(item.id), title: String(item.title) },
            rules,
          )
          if (classification.outcome === 'needs_review') outstanding += 1
          await tx`insert into run_item (workspace_id, run_id, work_item_id, classification_status, category, matched_rule_id, reason) values (${workspaceId}, ${runId}, ${item.id}, ${classification.outcome}, ${classification.category}, ${classification.ruleId}, ${classification.reason}) on conflict (workspace_id, run_id, work_item_id) do nothing`
        }
        state = transitionReconciliation(
          state,
          { type: 'classification-complete', outstandingDecisions: outstanding },
          state.version,
        )
        const [updated] =
          await tx`update billing_run set status = ${state.status}, outstanding_decisions = ${state.outstandingDecisions}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion} returning id, status, version, outstanding_decisions`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Reconciliation run changed; reload before retrying')
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.classified', 'billing_run', ${runId}, ${JSON.stringify({ status: updated.status, itemCount: rows.length, outstandingDecisions: outstanding })}, ${safeCorrelationId(request)})`
        return updated
      })
      return ok(reply, result)
    },
  )

  app.get(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/items',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      await requireContext(request, workspaceId, 'read')
      const items = await withWorkspace(
        request,
        workspaceId,
        async (tx) =>
          tx`select ri.id, ri.work_item_id, ri.classification_status, ri.category, ri.reason, ri.client_description, ri.human_decision_at, w.item_type, w.title, w.state, w.author, w.source_url, w.provider_created_at from run_item ri join work_item w on w.workspace_id = ri.workspace_id and w.id = ri.work_item_id where ri.workspace_id = ${workspaceId} and ri.run_id = ${runId} and w.project_id = ${projectId} order by w.provider_created_at, w.id limit 10000`,
      )
      return ok(reply, items)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/items/:itemId/decision',
    async (request, reply) => {
      const { workspaceId, projectId, runId, itemId } = parse(itemParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'approve')
      const body = parse(decisionSchema, request.body)
      if (body.decision === 'approve' && (!body.category || !body.clientDescription))
        fail(
          422,
          'HUMAN_DECISION_REQUIRED',
          'Approval requires a category and client-friendly description',
        )
      const result = await withWorkspace(request, workspaceId, async (tx) => {
        const [run] =
          await tx`select id, project_id, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
        if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
        const [item] =
          await tx`select ri.id, ri.classification_status, ri.category, ri.matched_rule_id, ri.reason from run_item ri join work_item w on w.workspace_id = ri.workspace_id and w.id = ri.work_item_id where ri.workspace_id = ${workspaceId} and ri.run_id = ${runId} and ri.id = ${itemId} and w.project_id = ${projectId} for update`
        if (!item) fail(404, 'NOT_FOUND', 'Review item not found')
        if (item.classification_status !== 'needs_review')
          fail(
            409,
            'ITEM_NOT_REVIEWABLE',
            'Only items requiring human review can receive a decision',
          )
        let state: ReconciliationState
        try {
          state = transitionReconciliation(
            dbState(run),
            { type: 'record-human-decision', decision: body.decision, humanId: auth.userId },
            body.runVersion,
          )
        } catch (error) {
          transitionError(error)
        }
        const finalStatus = body.decision === 'approve' ? 'approved' : 'rejected'
        await tx`update run_item set classification_status = ${finalStatus}, category = ${body.decision === 'approve' ? (body.category ?? null) : item.category}, client_description = ${body.decision === 'approve' ? (body.clientDescription ?? null) : null}, human_decision_by = ${auth.userId}, human_decision_at = now(), updated_at = now() where workspace_id = ${workspaceId} and id = ${itemId}`
        const [updated] =
          await tx`update billing_run set status = ${state.status}, outstanding_decisions = ${state.outstandingDecisions}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion} returning id, status, version, outstanding_decisions`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Reconciliation run changed; reload before retrying')
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'run_item.human_decision', 'run_item', ${itemId}, ${JSON.stringify({ decision: body.decision, classificationStatus: finalStatus, category: body.category ?? null })}, ${safeCorrelationId(request)})`
        return updated
      })
      return ok(reply, result)
    },
  )

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/cancel',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParamsSchema, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(versionSchema, request.body)
      const result = await withWorkspace(request, workspaceId, async (tx) => {
        const [run] =
          await tx`select id, project_id, status, version, outstanding_decisions from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
        if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
        let state: ReconciliationState
        try {
          state = transitionReconciliation(dbState(run), { type: 'cancel' }, body.runVersion)
        } catch (error) {
          transitionError(error)
        }
        const [updated] =
          await tx`update billing_run set status = ${state.status}, version = ${state.version}, updated_at = now() where workspace_id = ${workspaceId} and id = ${runId} and version = ${body.runVersion} returning id, status, version`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Reconciliation run changed; reload before retrying')
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id) values (${workspaceId}, ${auth.userId}, 'reconciliation.cancelled', 'billing_run', ${runId}, ${JSON.stringify({ version: state.version })}, ${safeCorrelationId(request)})`
        return updated
      })
      return ok(reply, result)
    },
  )
}
