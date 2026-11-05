import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { TransactionSql } from 'postgres'
import { z } from 'zod'
import { getDatabase } from '../../db/client.js'
import { config } from '../../platform/config.js'
import { authenticate, requireContext } from '../../modules/core.js'
import {
  buildInvoicePreview,
  canonicalJson,
  InvoicePreviewError,
  type InvoicePreviewInput,
  type InvoiceSource,
} from '../../modules/billing/invoice-preview.js'

const uuid = z.string().uuid()
const runParams = z.object({ workspaceId: uuid, projectId: uuid, runId: uuid }).strict()
const invoiceParams = z.object({ workspaceId: uuid, invoiceId: uuid }).strict()
const createSchema = z.object({ runVersion: z.number().int().nonnegative() }).strict()
const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    version: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .strict()
  .refine((body) => body.decision !== 'reject' || !!body.reason, {
    message: 'A rejection reason is required',
  })

function fail(statusCode: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { statusCode, code })
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) fail(422, 'VALIDATION_ERROR', 'Request did not match the expected schema')
  return result.data
}
function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}
function requestHash(request: FastifyRequest): string {
  return createHash('sha256').update(request.id).digest('hex').slice(0, 48)
}
async function withWorkspace<T>(
  workspaceId: string,
  action: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const result = await getDatabase().begin(async (tx) => {
    await tx`select set_config('app.workspace_id', ${workspaceId}, true)`
    return action(tx)
  })
  return result as unknown as T
}

async function currentPreviewInput(
  tx: TransactionSql,
  workspaceId: string,
  projectId: string,
  runId: string,
): Promise<InvoicePreviewInput> {
  const [row] = await tx`
    select br.id as billing_run_id, br.project_id, br.contract_id,
      to_char(br.period_start, 'YYYY-MM-DD') as period_start, to_char(br.period_end, 'YYYY-MM-DD') as period_end,
      br.status as run_status, br.completeness, br.accepted_partial_at, br.version as run_version, br.time_zone as billing_time_zone,
      p.name as project_name, p.client_id, p.status as project_status,
      c.name as client_name, c.status as client_status,
      ct.title as contract_title, ct.client_id as contract_client_id, ct.project_id as contract_project_id,
      ct.billing_model, ct.currency, ct.hourly_rate_minor, ct.contract_value_minor, ct.status as contract_status,
      to_char(ct.effective_date, 'YYYY-MM-DD') as effective_date, to_char(ct.end_date, 'YYYY-MM-DD') as end_date
    from billing_run br
    join project p on p.workspace_id = br.workspace_id and p.id = br.project_id
    join client c on c.workspace_id = p.workspace_id and c.id = p.client_id
    join contract ct on ct.workspace_id = br.workspace_id and ct.id = br.contract_id
    where br.workspace_id = ${workspaceId} and br.project_id = ${projectId} and br.id = ${runId}
    for share of br, p, c, ct
  `
  if (!row) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
  if (row.run_status !== 'ready_for_approval')
    fail(409, 'RECONCILIATION_NOT_READY', 'Reconciliation must be ready for invoice review')
  if (row.project_status !== 'active' || row.client_status !== 'active')
    fail(
      409,
      'ACTIVE_BILLING_RELATIONSHIP_REQUIRED',
      'An active client and project are required for invoicing',
    )
  if (row.completeness !== 'complete' && row.completeness !== 'partial')
    fail(409, 'RECONCILIATION_INCOMPLETE', 'Reconciliation completeness has not been established')
  if (
    String(row.contract_client_id) !== String(row.client_id) ||
    (row.contract_project_id && String(row.contract_project_id) !== String(row.project_id))
  )
    fail(
      409,
      'CONTRACT_RELATIONSHIP_MISMATCH',
      'The reconciliation contract does not belong to this client and project',
    )
  if (row.completeness === 'partial' && !row.accepted_partial_at)
    fail(409, 'PARTIAL_NOT_ACCEPTED', 'A partial reconciliation must be explicitly accepted first')
  const lastIncludedDate = new Date(
    Date.parse(`${String(row.period_end).slice(0, 10)}T00:00:00Z`) - 86_400_000,
  )
    .toISOString()
    .slice(0, 10)
  if (
    row.contract_status !== 'active' ||
    String(row.effective_date).slice(0, 10) > String(row.period_start).slice(0, 10) ||
    (row.end_date && String(row.end_date).slice(0, 10) < lastIncludedDate)
  )
    fail(409, 'ACTIVE_CONTRACT_REQUIRED', 'An active contract must cover the full invoice period')
  const start = String(row.period_start).slice(0, 10)
  const end = String(row.period_end).slice(0, 10)
  const sources: InvoiceSource[] = []
  let acceptedContractMilestonesMinor: number | null = null
  if (row.billing_model === 'hourly') {
    const timeEntries = await tx`
      select te.id, te.status, te.description, to_char(te.work_date, 'YYYY-MM-DD') as work_date, te.duration_minutes, te.billable,
        te.contract_id, te.project_id, te.updated_at
      from time_entry te
      where te.workspace_id = ${workspaceId} and te.project_id = ${projectId} and te.contract_id = ${row.contract_id}
        and te.status = 'approved' and te.billable = true and te.work_date >= ${start}::date and te.work_date < ${end}::date
      order by te.work_date, te.id for update of te
    `
    for (const item of timeEntries)
      sources.push({
        id: String(item.id),
        kind: 'time_entry',
        status: String(item.status),
        description: String(item.description),
        workDate: String(item.work_date).slice(0, 10),
        quantity: Number(item.duration_minutes),
        amountMinor: 0,
        currency: String(row.currency),
        contractId: String(item.contract_id),
        clientId: String(row.client_id),
        projectId: String(item.project_id),
        sourceUpdatedAt: new Date(item.updated_at as string).toISOString(),
      })
  } else if (row.billing_model === 'fixed_milestone') {
    const [contractTotals] = await tx`
      select coalesce(sum(m.amount_minor), 0)::text as accepted_total_minor,
        coalesce(bool_and(m.currency = ${String(row.currency)}), true) as currencies_match
      from milestone m
      join project mp on mp.workspace_id = m.workspace_id and mp.id = m.project_id
      where m.workspace_id = ${workspaceId} and m.contract_id = ${row.contract_id}
        and m.status = 'accepted' and mp.client_id = ${row.contract_client_id}
        and (${row.contract_project_id}::uuid is null or m.project_id = ${row.contract_project_id})
    `
    if (!contractTotals.currencies_match)
      fail(409, 'CURRENCY_MISMATCH', 'Accepted milestone currencies do not match the contract')
    acceptedContractMilestonesMinor = Number(contractTotals.accepted_total_minor)
    const milestones = await tx`
      select m.id, m.status, m.title, m.description, m.amount_minor, m.currency, m.contract_id, m.project_id,
        to_char((m.accepted_at at time zone ${String(row.billing_time_zone)})::date, 'YYYY-MM-DD') as service_date, m.updated_at
      from milestone m join project p on p.workspace_id = m.workspace_id and p.id = m.project_id
      where m.workspace_id = ${workspaceId} and m.project_id = ${projectId} and m.contract_id = ${row.contract_id}
        and m.status = 'accepted' and (m.accepted_at at time zone ${String(row.billing_time_zone)})::date >= ${start}::date and (m.accepted_at at time zone ${String(row.billing_time_zone)})::date < ${end}::date
      order by m.accepted_at, m.id for update of m
    `
    for (const item of milestones)
      sources.push({
        id: String(item.id),
        kind: 'milestone',
        status: String(item.status),
        description: `${String(item.title)}${item.description ? ` — ${String(item.description)}` : ''}`,
        workDate: String(item.service_date),
        quantity: 1,
        amountMinor: Number(item.amount_minor),
        currency: String(item.currency),
        contractId: String(item.contract_id),
        clientId: String(row.client_id),
        projectId: String(item.project_id),
        sourceUpdatedAt: new Date(item.updated_at as string).toISOString(),
      })
  } else {
    fail(
      409,
      'UNSUPPORTED_BILLING_MODEL',
      'Contract billing model is not supported for invoice previews',
    )
  }
  return {
    workspaceId,
    billingRunId: String(row.billing_run_id),
    runVersion: Number(row.run_version),
    completeness: row.completeness as 'complete' | 'partial',
    billingTimeZone: String(row.billing_time_zone),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    contractId: String(row.contract_id),
    contractTitle: String(row.contract_title),
    billingModel: row.billing_model as InvoicePreviewInput['billingModel'],
    currency: String(row.currency),
    hourlyRateMinor: row.hourly_rate_minor === null ? null : Number(row.hourly_rate_minor),
    contractValueMinor: row.contract_value_minor === null ? null : Number(row.contract_value_minor),
    acceptedContractMilestonesMinor,
    periodStart: start,
    periodEnd: end,
    sources,
  }
}
function domainPreview(input: InvoicePreviewInput) {
  try {
    return buildInvoicePreview(input)
  } catch (error) {
    if (error instanceof InvoicePreviewError) fail(409, error.code, error.message)
    throw error
  }
}

export async function phase3Routes(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return
    const origin = request.headers.origin
    if (origin && origin !== config.API_CORS_ORIGIN)
      fail(403, 'FORBIDDEN_ORIGIN', 'Origin is not allowed')
    const auth = await authenticate(request)
    if (auth && request.headers['x-csrf-token'] !== auth.csrfToken)
      fail(403, 'CSRF_INVALID', 'CSRF validation failed')
  })

  app.get('/api/v1/workspaces/:workspaceId/invoice-eligible-runs', async (request, reply) => {
    const params = z.object({ workspaceId: uuid }).strict().parse(request.params)
    await requireContext(request, params.workspaceId, 'read')
    const runs = await withWorkspace(
      params.workspaceId,
      async (tx) => tx`
      select br.id, br.project_id, br.contract_id, br.period_start, br.period_end, br.version,
        br.completeness, br.accepted_partial_at, p.name as project_name, c.name as client_name
      from billing_run br
      join project p on p.workspace_id = br.workspace_id and p.id = br.project_id
      join client c on c.workspace_id = p.workspace_id and c.id = p.client_id
      join contract ct on ct.workspace_id = br.workspace_id and ct.id = br.contract_id and ct.status = 'active'
      where br.workspace_id = ${params.workspaceId} and br.status = 'ready_for_approval'
        and (br.completeness = 'complete' or br.accepted_partial_at is not null)
        and not exists (select 1 from invoice_preview ip where ip.workspace_id = br.workspace_id and ip.billing_run_id = br.id and ip.status in ('preview','approved'))
      order by br.period_end desc, br.created_at desc limit 100
    `,
    )
    return ok(reply, runs)
  })

  app.post(
    '/api/v1/workspaces/:workspaceId/projects/:projectId/runs/:runId/invoice-previews',
    async (request, reply) => {
      const { workspaceId, projectId, runId } = parse(runParams, request.params)
      const { auth } = await requireContext(request, workspaceId, 'write')
      const body = parse(createSchema, request.body)
      try {
        const result = await withWorkspace(workspaceId, async (tx) => {
          const [run] =
            await tx`select id, version from billing_run where workspace_id = ${workspaceId} and project_id = ${projectId} and id = ${runId} for update`
          if (!run) fail(404, 'NOT_FOUND', 'Reconciliation run not found')
          if (Number(run.version) !== body.runVersion)
            fail(
              409,
              'VERSION_CONFLICT',
              'Reconciliation changed; reload before creating a preview',
            )
          const input = await currentPreviewInput(tx, workspaceId, projectId, runId)
          const preview = domainPreview(input)
          const [invoice] = await tx`
          insert into invoice_preview (workspace_id, project_id, contract_id, billing_run_id, period_start, period_end, currency, subtotal_minor, content_hash, snapshot, created_by)
          values (${workspaceId}, ${projectId}, ${input.contractId}, ${runId}, ${input.periodStart}, ${input.periodEnd}, ${input.currency}, ${preview.subtotalMinor}, ${preview.contentHash}, ${JSON.stringify(preview)}::jsonb, ${auth.userId})
          returning id, status, version, period_start, period_end, currency, subtotal_minor, content_hash, snapshot, created_at
        `
          for (const line of preview.lines) {
            await tx`insert into invoice_line (workspace_id, invoice_id, source_kind, source_id, description, service_date, quantity, unit_amount_minor, amount_minor, currency, source_updated_at)
            values (${workspaceId}, ${invoice.id}, ${line.sourceKind}, ${line.sourceId}, ${line.description}, ${line.serviceDate}, ${line.quantity}, ${line.unitAmountMinor}, ${line.amountMinor}, ${line.currency}, ${line.sourceUpdatedAt})`
            await tx`insert into invoice_evidence_claim (workspace_id, invoice_id, source_kind, source_id) values (${workspaceId}, ${invoice.id}, ${line.sourceKind}, ${line.sourceId})`
          }
          await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
          values (${workspaceId}, ${auth.userId}, 'invoice.preview_created', 'invoice_preview', ${invoice.id}, ${JSON.stringify({ contentHash: preview.contentHash, billingRunId: runId, lineCount: preview.lines.length, subtotalMinor: preview.subtotalMinor })}, ${requestHash(request)})`
          const lines =
            await tx`select id, source_kind, source_id, description, service_date, quantity, unit_amount_minor, amount_minor, currency from invoice_line where workspace_id = ${workspaceId} and invoice_id = ${invoice.id} order by service_date, id`
          return { ...invoice, lines }
        })
        return ok(reply, result, 201)
      } catch (error) {
        const databaseError = error as { code?: string; constraint_name?: string }
        if (
          databaseError.code === '23505' &&
          databaseError.constraint_name === 'invoice_preview_one_open_per_run'
        )
          fail(
            409,
            'INVOICE_PREVIEW_ALREADY_EXISTS',
            'This reconciliation already has an open or approved invoice preview',
          )
        if (
          databaseError.code === '23505' &&
          databaseError.constraint_name === 'invoice_evidence_one_active_claim'
        )
          fail(
            409,
            'EVIDENCE_ALREADY_RESERVED',
            'One or more evidence records are already included in another active invoice preview',
          )
        throw error
      }
    },
  )

  app.get('/api/v1/workspaces/:workspaceId/invoice-previews', async (request, reply) => {
    const params = z.object({ workspaceId: uuid }).strict().parse(request.params)
    await requireContext(request, params.workspaceId, 'read')
    const invoices = await withWorkspace(
      params.workspaceId,
      async (tx) => tx`
      select ip.id, ip.project_id, ip.contract_id, ip.billing_run_id, ip.period_start, ip.period_end,
        ip.currency, ip.subtotal_minor, ip.content_hash, ip.status, ip.version, ip.approved_at, ip.created_at,
        p.name as project_name, c.name as client_name
      from invoice_preview ip
      join project p on p.workspace_id = ip.workspace_id and p.id = ip.project_id
      join client c on c.workspace_id = p.workspace_id and c.id = p.client_id
      where ip.workspace_id = ${params.workspaceId} order by ip.created_at desc limit 100
    `,
    )
    return ok(reply, invoices)
  })

  app.get('/api/v1/workspaces/:workspaceId/invoice-previews/:invoiceId', async (request, reply) => {
    const { workspaceId, invoiceId } = parse(invoiceParams, request.params)
    await requireContext(request, workspaceId, 'read')
    const result = await withWorkspace(workspaceId, async (tx) => {
      const [invoice] =
        await tx`select id, project_id, contract_id, billing_run_id, period_start, period_end, currency, subtotal_minor, content_hash, status, version, snapshot, approved_by, approved_at, rejection_reason, created_at from invoice_preview where workspace_id = ${workspaceId} and id = ${invoiceId}`
      if (!invoice) fail(404, 'NOT_FOUND', 'Invoice preview not found')
      const lines =
        await tx`select id, source_kind, source_id, description, service_date, quantity, unit_amount_minor, amount_minor, currency, source_updated_at from invoice_line where workspace_id = ${workspaceId} and invoice_id = ${invoiceId} order by service_date, id`
      const reviews =
        await tx`select decision, content_hash, reason, created_at from invoice_review where workspace_id = ${workspaceId} and invoice_id = ${invoiceId} order by created_at, id`
      return { ...invoice, lines, reviews }
    })
    return ok(reply, result)
  })

  app.post(
    '/api/v1/workspaces/:workspaceId/invoice-previews/:invoiceId/review',
    async (request, reply) => {
      const { workspaceId, invoiceId } = parse(invoiceParams, request.params)
      const { auth, role } = await requireContext(request, workspaceId, 'approve')
      if (role !== 'owner')
        fail(404, 'NOT_FOUND', 'Invoice approval is restricted to the workspace owner')
      if (Date.now() - auth.authenticatedAt.getTime() > 15 * 60_000)
        fail(403, 'RECENT_AUTH_REQUIRED', 'Sign in again before reviewing this invoice')
      const body = parse(reviewSchema, request.body)
      const result = await withWorkspace(workspaceId, async (tx) => {
        const [invoice] =
          await tx`select id, project_id, billing_run_id, content_hash, snapshot, status, version from invoice_preview where workspace_id = ${workspaceId} and id = ${invoiceId} for update`
        if (!invoice) fail(404, 'NOT_FOUND', 'Invoice preview not found')
        if (invoice.status !== 'preview')
          fail(
            409,
            'INVALID_INVOICE_STATE',
            'Only an unreviewed invoice preview can be approved or rejected',
          )
        if (Number(invoice.version) !== body.version)
          fail(409, 'VERSION_CONFLICT', 'Invoice preview changed; reload before reviewing')
        if (invoice.content_hash !== body.contentHash)
          fail(
            409,
            'CONTENT_HASH_MISMATCH',
            'The reviewed invoice content does not match the stored preview',
          )
        let reviewHash = String(invoice.content_hash)
        if (body.decision === 'approve') {
          const input = await currentPreviewInput(
            tx,
            workspaceId,
            String(invoice.project_id),
            String(invoice.billing_run_id),
          )
          const current = domainPreview(input)
          if (
            current.contentHash !== invoice.content_hash ||
            canonicalJson(invoice.snapshot) !== canonicalJson(current)
          )
            fail(
              409,
              'PREVIEW_STALE',
              'Billing evidence or contract details changed; create a new invoice preview',
            )
          const storedLines = await tx`
            select source_kind, source_id, description, to_char(service_date, 'YYYY-MM-DD') as service_date,
              quantity, unit_amount_minor, amount_minor, currency, source_updated_at
            from invoice_line where workspace_id = ${workspaceId} and invoice_id = ${invoiceId}
            order by service_date, source_id for update
          `
          const expectedLines = current.lines.map((line) => ({
            source_kind: line.sourceKind,
            source_id: line.sourceId,
            description: line.description,
            service_date: line.serviceDate,
            quantity: line.quantity,
            unit_amount_minor: line.unitAmountMinor,
            amount_minor: line.amountMinor,
            currency: line.currency,
            source_updated_at: line.sourceUpdatedAt,
          }))
          const persistedLines = storedLines.map((line) => ({
            source_kind: String(line.source_kind),
            source_id: String(line.source_id),
            description: String(line.description),
            service_date: String(line.service_date),
            quantity: Number(line.quantity),
            unit_amount_minor: Number(line.unit_amount_minor),
            amount_minor: Number(line.amount_minor),
            currency: String(line.currency),
            source_updated_at: new Date(line.source_updated_at as string).toISOString(),
          }))
          if (canonicalJson(expectedLines) !== canonicalJson(persistedLines))
            fail(
              409,
              'PREVIEW_LINE_INTEGRITY_FAILED',
              'Stored invoice lines do not match the immutable preview; approval is blocked',
            )
          reviewHash = current.contentHash
        }
        if (body.decision === 'approve') {
          const [updated] =
            await tx`update invoice_preview set status = 'approved', approved_by = ${auth.userId}, approved_at = now(), approval_hash = ${reviewHash}, version = version + 1, updated_at = now()
          where workspace_id = ${workspaceId} and id = ${invoiceId} and status = 'preview' and version = ${body.version}
          returning id, status, version, content_hash, approved_at`
          if (!updated)
            fail(409, 'VERSION_CONFLICT', 'Invoice preview changed; reload before reviewing')
          await tx`insert into invoice_review (workspace_id, invoice_id, actor_user_id, decision, content_hash) values (${workspaceId}, ${invoiceId}, ${auth.userId}, 'approve', ${reviewHash})`
          await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
          values (${workspaceId}, ${auth.userId}, 'invoice.approved', 'invoice_preview', ${invoiceId}, ${JSON.stringify({ contentHash: reviewHash, version: Number(updated.version) })}, ${requestHash(request)})`
          return updated
        }
        const rejectionReason = body.reason
        if (!rejectionReason)
          fail(422, 'REJECTION_REASON_REQUIRED', 'A rejection reason is required')
        const [updated] =
          await tx`update invoice_preview set status = 'rejected', rejection_reason = ${rejectionReason}, version = version + 1, updated_at = now()
        where workspace_id = ${workspaceId} and id = ${invoiceId} and status = 'preview' and version = ${body.version}
        returning id, status, version, content_hash, rejection_reason`
        if (!updated)
          fail(409, 'VERSION_CONFLICT', 'Invoice preview changed; reload before reviewing')
        await tx`update invoice_evidence_claim set status = 'released', released_at = now() where workspace_id = ${workspaceId} and invoice_id = ${invoiceId} and status = 'reserved'`
        await tx`insert into invoice_review (workspace_id, invoice_id, actor_user_id, decision, content_hash, reason) values (${workspaceId}, ${invoiceId}, ${auth.userId}, 'reject', ${reviewHash}, ${rejectionReason})`
        await tx`insert into audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
        values (${workspaceId}, ${auth.userId}, 'invoice.rejected', 'invoice_preview', ${invoiceId}, ${JSON.stringify({ contentHash: reviewHash, reason: rejectionReason, version: Number(updated.version) })}, ${requestHash(request)})`
        return updated
      })
      return ok(reply, result)
    },
  )
}
