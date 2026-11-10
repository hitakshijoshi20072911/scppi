import { createHash } from 'node:crypto'
import { exec as runtimeExec } from '@swytchcode/runtime'

export const STRIPE_DRAFT_METHODS = [
  'stripe.customer.list',
  'stripe.customer.create',
  'stripe.invoice.list',
  'stripe.invoice.create',
  'stripe.invoiceitem.list',
  'stripe.invoiceitem.create',
  'stripe.invoice.get',
] as const

type StripeMethod = (typeof STRIPE_DRAFT_METHODS)[number]
type RuntimeArgs = {
  body?: Record<string, unknown>
  params?: Record<string, unknown>
  headers?: Record<string, string>
}
export type StripeRuntimeExec = (
  canonicalId: StripeMethod,
  args: RuntimeArgs,
  options: { tenantId: string },
) => Promise<unknown>

export interface StripeDraftLine {
  id: string
  description: string
  amountMinor: number
}
export interface StripeDraftInput {
  /** Authenticated provider tenant identity established by the server caller. */
  tenantId: string
  vendorProofWorkspaceId: string
  invoicePreviewId: string
  contentHash: string
  testMode: true
  /** Synthetic-only email; must not identify a real client. */
  customerEmail: string
  customerName: string
  currency: string
  description: string
  daysUntilDue: number
  totalMinor: number
  lines: readonly StripeDraftLine[]
}
export type StripeDraftErrorCode =
  'invalid_input' | 'provider_failure' | 'draft_unknown' | 'draft_mismatch'
export class StripeDraftError extends Error {
  constructor(
    readonly code: StripeDraftErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StripeDraftError'
  }
}
interface StripeInvoice {
  id: string
  customer: string
  status: string
  auto_advance: boolean
  currency: string
  total: number
  metadata: Record<string, string>
}
interface StripeInvoiceItem {
  id: string
  invoice: string
  customer: string
  amount: number
  currency: string
  metadata: Record<string, string>
}
const safeError = () =>
  new StripeDraftError('provider_failure', 'Stripe draft provider operation failed')
const ambiguousError = () =>
  new StripeDraftError('draft_unknown', 'Draft write outcome is unknown; reconcile before retrying')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const stableKey = (kind: string, ...values: string[]) => `vp-${kind}-${digest(values.join('\0'))}`
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
function unwrap(value: unknown): Record<string, unknown> | undefined {
  const object = record(value)
  if (!object) return undefined
  return record(object.data) ?? object
}
function objectList(value: unknown): Record<string, unknown>[] {
  const root = unwrap(value)
  const data = root?.data
  if (Array.isArray(data))
    return data.map(record).filter((item): item is Record<string, unknown> => !!item)
  if (Array.isArray(root?.items))
    return root.items.map(record).filter((item): item is Record<string, unknown> => !!item)
  return []
}
function hasMore(value: unknown): boolean {
  return unwrap(value)?.has_more === true
}
function customerId(value: unknown): string | undefined {
  if (text(value)) return value
  const nested = record(value)
  return text(nested?.id) ? nested.id : undefined
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function validInput(input: StripeDraftInput): void {
  if (
    !input ||
    typeof input !== 'object' ||
    input.testMode !== true ||
    !text(input.tenantId) ||
    input.tenantId.trim() !== input.tenantId ||
    !uuid.test(input.vendorProofWorkspaceId) ||
    !uuid.test(input.invoicePreviewId) ||
    !/^[a-f0-9]{64}$/i.test(input.contentHash) ||
    !text(input.customerEmail) ||
    !/^[^\s@]+@example\.(test|invalid)$/i.test(input.customerEmail) ||
    !text(input.customerName) ||
    !text(input.currency) ||
    !/^[a-z]{3}$/i.test(input.currency) ||
    !text(input.description) ||
    !Number.isSafeInteger(input.daysUntilDue) ||
    input.daysUntilDue < 1 ||
    input.daysUntilDue > 365 ||
    !Number.isSafeInteger(input.totalMinor) ||
    input.totalMinor < 0 ||
    !Array.isArray(input.lines) ||
    input.lines.length === 0 ||
    input.lines.length > 250
  ) {
    throw new StripeDraftError('invalid_input', 'Invalid approved test invoice draft input')
  }
  const ids = new Set<string>()
  let sum = 0
  for (const line of input.lines) {
    if (
      !line ||
      !uuid.test(line.id) ||
      ids.has(line.id) ||
      !text(line.description) ||
      !Number.isSafeInteger(line.amountMinor) ||
      line.amountMinor < 0
    ) {
      throw new StripeDraftError('invalid_input', 'Invalid approved invoice line')
    }
    ids.add(line.id)
    sum += line.amountMinor
    if (!Number.isSafeInteger(sum))
      throw new StripeDraftError('invalid_input', 'Invoice total is unsafe')
  }
  if (sum !== input.totalMinor)
    throw new StripeDraftError('invalid_input', 'Invoice lines do not equal the approved total')
}
function invoiceShape(value: unknown): StripeInvoice | undefined {
  const object = unwrap(value)
  if (
    !object ||
    !text(object.id) ||
    !text(object.status) ||
    typeof object.auto_advance !== 'boolean' ||
    !text(object.currency) ||
    typeof object.total !== 'number' ||
    !record(object.metadata)
  )
    return undefined
  const customer = customerId(object.customer)
  if (!customer) return undefined
  return {
    id: object.id,
    customer,
    status: object.status,
    auto_advance: object.auto_advance,
    currency: object.currency,
    total: object.total,
    metadata: object.metadata as Record<string, string>,
  }
}
function itemShape(value: unknown): StripeInvoiceItem | undefined {
  const object = record(value)
  if (
    !object ||
    !text(object.id) ||
    !text(object.invoice) ||
    !text(object.customer) ||
    typeof object.amount !== 'number' ||
    !text(object.currency) ||
    !record(object.metadata)
  )
    return undefined
  return {
    id: object.id,
    invoice: object.invoice,
    customer: object.customer,
    amount: object.amount,
    currency: object.currency,
    metadata: object.metadata as Record<string, string>,
  }
}

export function createStripeDraftAdapter(
  exec: StripeRuntimeExec = runtimeExec as StripeRuntimeExec,
) {
  const callRead = async (
    method: StripeMethod,
    args: RuntimeArgs,
    tenantId: string,
  ): Promise<unknown> => {
    try {
      return await exec(method, args, { tenantId })
    } catch {
      throw safeError()
    }
  }
  const callWrite = async (
    method: StripeMethod,
    args: RuntimeArgs,
    tenantId: string,
  ): Promise<unknown> => {
    try {
      return await exec(method, args, { tenantId })
    } catch {
      throw ambiguousError()
    }
  }

  async function listAll<T extends StripeInvoice | StripeInvoiceItem>(
    method: 'stripe.invoice.list' | 'stripe.invoiceitem.list',
    params: Record<string, unknown>,
    tenantId: string,
    parse: (value: unknown) => T | undefined,
    maxPages: number,
  ): Promise<T[]> {
    const result: T[] = []
    let startingAfter: string | undefined
    for (let page = 0; page < maxPages; page += 1) {
      const query = {
        ...params,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }
      const response = await callRead(method, { params: query }, tenantId)
      const rows = objectList(response)
      for (const row of rows) {
        const parsed = parse(row)
        if (!parsed)
          throw new StripeDraftError('draft_mismatch', 'Stripe returned an invalid draft record')
        result.push(parsed)
      }
      if (!hasMore(response)) return result
      const last = rows.at(-1)?.id
      if (!text(last))
        throw new StripeDraftError('draft_unknown', 'Stripe draft list pagination is incomplete')
      startingAfter = last
    }
    throw new StripeDraftError(
      'draft_unknown',
      'Stripe draft history exceeds the safe lookup bound',
    )
  }

  async function findCustomer(input: StripeDraftInput, tenantId: string): Promise<string> {
    const response = await callRead(
      'stripe.customer.list',
      { params: { email: input.customerEmail, limit: 1 } },
      tenantId,
    )
    const customer = objectList(response).find(
      (row) =>
        text(row.id) &&
        typeof row.email === 'string' &&
        row.email.toLowerCase() === input.customerEmail.toLowerCase(),
    )
    if (customer && text(customer.id)) return customer.id
    const created = await callWrite(
      'stripe.customer.create',
      {
        body: {
          email: input.customerEmail,
          name: input.customerName,
          metadata: { vendorproof_workspace_id: input.vendorProofWorkspaceId, test_mode: 'true' },
        },
        headers: {
          'Idempotency-Key': stableKey('customer', tenantId, input.customerEmail.toLowerCase()),
        },
      },
      tenantId,
    )
    const object = unwrap(created)
    if (!text(object?.id)) throw ambiguousError()
    return object.id
  }

  async function verifyInvoice(
    invoiceId: string,
    customer: string,
    currency: string,
    total: number,
    metadata: Record<string, string>,
    tenantId: string,
  ): Promise<StripeInvoice> {
    const raw = await callRead('stripe.invoice.get', { params: { invoice: invoiceId } }, tenantId)
    const invoice = invoiceShape(raw)
    if (
      !invoice ||
      invoice.id !== invoiceId ||
      invoice.status !== 'draft' ||
      invoice.auto_advance !== false ||
      invoice.currency.toLowerCase() !== currency ||
      invoice.total !== total ||
      invoice.customer !== customer ||
      Object.entries(metadata).some(([key, value]) => invoice.metadata[key] !== value)
    ) {
      throw new StripeDraftError(
        'draft_mismatch',
        'Stripe invoice did not match the approved draft',
      )
    }
    return invoice
  }

  return {
    async createDraft(input: StripeDraftInput): Promise<{
      invoiceId: string
      customerId: string
      status: 'draft'
      currency: string
      totalMinor: number
      recovered: boolean
    }> {
      validInput(input)
      const tenantId = input.tenantId
      const currency = input.currency.toLowerCase()
      const metadata = {
        vendorproof_workspace_id: input.vendorProofWorkspaceId,
        invoice_preview_id: input.invoicePreviewId,
        content_hash: input.contentHash,
        test_mode: 'true',
      }
      const customer = await findCustomer(input, tenantId)
      const invoiceDrafts = await listAll(
        'stripe.invoice.list',
        { customer, status: 'draft' },
        tenantId,
        invoiceShape,
        5,
      )
      const conflicting = invoiceDrafts.find(
        (invoice) =>
          invoice.metadata.vendorproof_workspace_id === metadata.vendorproof_workspace_id &&
          invoice.metadata.invoice_preview_id === metadata.invoice_preview_id,
      )
      if (
        conflicting &&
        (conflicting.metadata.content_hash !== metadata.content_hash ||
          conflicting.customer !== customer ||
          conflicting.currency.toLowerCase() !== currency ||
          conflicting.metadata.test_mode !== 'true')
      ) {
        throw new StripeDraftError('draft_mismatch', 'A conflicting Stripe draft already exists')
      }
      let invoice = conflicting
      if (!invoice) {
        const created = await callWrite(
          'stripe.invoice.create',
          {
            body: {
              customer,
              auto_advance: false,
              collection_method: 'send_invoice',
              days_until_due: input.daysUntilDue,
              description: input.description,
              currency,
              metadata,
              pending_invoice_items_behavior: 'exclude',
            },
            headers: {
              'Idempotency-Key': stableKey(
                'invoice',
                tenantId,
                input.vendorProofWorkspaceId,
                input.invoicePreviewId,
                input.contentHash,
              ),
            },
          },
          tenantId,
        )
        invoice = invoiceShape(created)
        if (
          !invoice ||
          invoice.status !== 'draft' ||
          invoice.auto_advance !== false ||
          invoice.customer !== customer ||
          invoice.currency.toLowerCase() !== currency ||
          Object.entries(metadata).some(([key, value]) => invoice?.metadata[key] !== value)
        ) {
          throw ambiguousError()
        }
      }

      const existingItems = await listAll(
        'stripe.invoiceitem.list',
        { invoice: invoice.id, customer },
        tenantId,
        itemShape,
        3,
      )
      const itemsByLine = new Map<string, StripeInvoiceItem>()
      for (const item of existingItems) {
        const lineId = item.metadata.vendorproof_line_id
        if (!text(lineId)) continue
        if (itemsByLine.has(lineId))
          throw new StripeDraftError('draft_mismatch', 'Duplicate Stripe invoice line metadata')
        if (
          item.invoice !== invoice.id ||
          item.customer !== customer ||
          item.currency.toLowerCase() !== currency
        ) {
          throw new StripeDraftError(
            'draft_mismatch',
            'Stripe invoice line is attached to an unexpected draft',
          )
        }
        itemsByLine.set(lineId, item)
      }

      for (const line of input.lines) {
        const present = itemsByLine.get(line.id)
        if (present) {
          if (
            present.amount !== line.amountMinor ||
            present.metadata.content_hash !== input.contentHash ||
            present.metadata.invoice_preview_id !== input.invoicePreviewId ||
            present.metadata.test_mode !== 'true'
          ) {
            throw new StripeDraftError(
              'draft_mismatch',
              'Existing Stripe line does not match approved evidence',
            )
          }
          continue
        }
        await callWrite(
          'stripe.invoiceitem.create',
          {
            body: {
              customer,
              invoice: invoice.id,
              amount: line.amountMinor,
              currency,
              description: line.description,
              metadata: { ...metadata, vendorproof_line_id: line.id },
            },
            headers: {
              'Idempotency-Key': stableKey(
                'item',
                tenantId,
                input.vendorProofWorkspaceId,
                input.invoicePreviewId,
                input.contentHash,
                line.id,
              ),
            },
          },
          tenantId,
        )
      }

      const verifiedItems = await listAll(
        'stripe.invoiceitem.list',
        { invoice: invoice.id, customer },
        tenantId,
        itemShape,
        3,
      )
      const verifiedByLine = new Map<string, StripeInvoiceItem>()
      for (const item of verifiedItems) {
        const lineId = item.metadata.vendorproof_line_id
        if (text(lineId)) {
          if (verifiedByLine.has(lineId))
            throw new StripeDraftError('draft_mismatch', 'Duplicate Stripe invoice line metadata')
          verifiedByLine.set(lineId, item)
        }
      }
      for (const line of input.lines) {
        const item = verifiedByLine.get(line.id)
        if (
          !item ||
          item.invoice !== invoice.id ||
          item.customer !== customer ||
          item.amount !== line.amountMinor ||
          item.currency.toLowerCase() !== currency ||
          item.metadata.content_hash !== input.contentHash ||
          item.metadata.invoice_preview_id !== input.invoicePreviewId ||
          item.metadata.test_mode !== 'true'
        ) {
          throw ambiguousError()
        }
      }
      const verified = await verifyInvoice(
        invoice.id,
        customer,
        currency,
        input.totalMinor,
        metadata,
        tenantId,
      )
      return {
        invoiceId: verified.id,
        customerId: customer,
        status: 'draft',
        currency,
        totalMinor: verified.total,
        recovered: !!conflicting,
      }
    },
  }
}

export const stripeDraftAdapter = createStripeDraftAdapter()
