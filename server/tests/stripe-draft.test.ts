import { describe, expect, it } from 'vitest'
import { createStripeDraftAdapter, type StripeRuntimeExec } from '../src/swytchcode/stripe-draft.js'

const input = {
  tenantId: 'tenant-1',
  vendorProofWorkspaceId: 'd2719a51-747f-4a37-8a4f-9a7491e12708',
  invoicePreviewId: '9ff117f4-3d78-4998-ae13-2951d47305f3',
  contentHash: 'a'.repeat(64),
  testMode: true as const,
  customerEmail: 'vendorproof+test@example.test',
  customerName: 'VendorProof Test Customer',
  currency: 'USD',
  description: 'Approved test draft',
  daysUntilDue: 30,
  totalMinor: 150,
  lines: [
    { id: 'd2719a51-747f-4a37-8a4f-9a7491e12708', description: 'Approved work', amountMinor: 150 },
  ],
}
const metadata = {
  vendorproof_workspace_id: input.vendorProofWorkspaceId,
  invoice_preview_id: input.invoicePreviewId,
  content_hash: input.contentHash,
  test_mode: 'true',
}
const invoice = {
  id: 'in_test_1',
  customer: 'cus_test_1',
  status: 'draft',
  auto_advance: false,
  currency: 'usd',
  total: 150,
  metadata,
}
const invoiceItem = {
  id: 'ii_test_1',
  invoice: invoice.id,
  customer: 'cus_test_1',
  amount: 150,
  currency: 'usd',
  metadata: { ...metadata, vendorproof_line_id: input.lines[0].id },
}

type Calls = unknown[][]
function fakeExec(
  implementation: (method: string, args: Record<string, unknown>, calls: Calls) => unknown,
  calls: Calls = [],
): StripeRuntimeExec {
  return async (method, args, options) => {
    calls.push([method, args, options])
    return implementation(method, args as Record<string, unknown>, calls)
  }
}

describe('Stripe test-mode draft adapter', () => {
  it('creates only a draft invoice and explicitly attaches and verifies each approved line', async () => {
    const calls: Calls = []
    let itemListCount = 0
    const adapter = createStripeDraftAdapter(
      fakeExec((method) => {
        if (method === 'stripe.customer.list')
          return { data: [{ id: 'cus_test_1', email: input.customerEmail }] }
        if (method === 'stripe.invoice.list') return { data: [], has_more: false }
        if (method === 'stripe.invoice.create') return invoice
        if (method === 'stripe.invoiceitem.list') {
          itemListCount += 1
          return { data: itemListCount === 1 ? [] : [invoiceItem], has_more: false }
        }
        if (method === 'stripe.invoiceitem.create') return invoiceItem
        if (method === 'stripe.invoice.get') return invoice
        throw new Error('unexpected provider method')
      }, calls),
    )

    await expect(adapter.createDraft(input)).resolves.toMatchObject({
      invoiceId: invoice.id,
      status: 'draft',
      recovered: false,
    })
    expect(calls.map(([method]) => method)).toEqual([
      'stripe.customer.list',
      'stripe.invoice.list',
      'stripe.invoice.create',
      'stripe.invoiceitem.list',
      'stripe.invoiceitem.create',
      'stripe.invoiceitem.list',
      'stripe.invoice.get',
    ])
    const invoiceCreate = calls[2][1] as {
      body: Record<string, unknown>
      headers: Record<string, string>
    }
    expect(invoiceCreate.body).toMatchObject({
      customer: 'cus_test_1',
      auto_advance: false,
      collection_method: 'send_invoice',
      pending_invoice_items_behavior: 'exclude',
      currency: 'usd',
      metadata,
    })
    expect(invoiceCreate.headers['Idempotency-Key']).toBeTruthy()
    const itemCreate = calls[4][1] as {
      body: Record<string, unknown>
      headers: Record<string, string>
    }
    expect(itemCreate.body).toMatchObject({
      customer: 'cus_test_1',
      invoice: invoice.id,
      amount: 150,
      currency: 'usd',
    })
    expect(itemCreate.headers['Idempotency-Key']).toBeTruthy()
    expect(
      calls.every(([, , options]) => (options as { tenantId: string }).tenantId === input.tenantId),
    ).toBe(true)
  })

  it('recovers only a matching draft and existing line without another write', async () => {
    const calls: Calls = []
    const adapter = createStripeDraftAdapter(
      fakeExec((method) => {
        if (method === 'stripe.customer.list')
          return { data: [{ id: 'cus_test_1', email: input.customerEmail }] }
        if (method === 'stripe.invoice.list') return { data: [invoice], has_more: false }
        if (method === 'stripe.invoiceitem.list') return { data: [invoiceItem], has_more: false }
        if (method === 'stripe.invoice.get') return invoice
        throw new Error(`unexpected write ${method}`)
      }, calls),
    )
    await expect(adapter.createDraft(input)).resolves.toMatchObject({
      recovered: true,
      invoiceId: invoice.id,
    })
    expect(calls.map(([method]) => method)).toEqual([
      'stripe.customer.list',
      'stripe.invoice.list',
      'stripe.invoiceitem.list',
      'stripe.invoiceitem.list',
      'stripe.invoice.get',
    ])
  })

  it('marks an uncertain invoice create as unknown without finalizing or sending it', async () => {
    const calls: Calls = []
    const adapter = createStripeDraftAdapter(
      fakeExec((method) => {
        if (method === 'stripe.customer.list')
          return { data: [{ id: 'cus_test_1', email: input.customerEmail }] }
        if (method === 'stripe.invoice.list') return { data: [], has_more: false }
        if (method === 'stripe.invoice.create')
          throw new Error('private provider payload must not escape')
        throw new Error('unexpected method')
      }, calls),
    )
    await expect(adapter.createDraft(input)).rejects.toMatchObject({
      code: 'draft_unknown',
      message: expect.not.stringContaining('private'),
    })
    expect(calls.map(([method]) => method)).toEqual([
      'stripe.customer.list',
      'stripe.invoice.list',
      'stripe.invoice.create',
    ])
  })

  it('safely recovers an invoice item written before its response was lost', async () => {
    const calls: Calls = []
    let itemCreated = false
    let lostResponse = true
    const adapter = createStripeDraftAdapter(
      fakeExec((method) => {
        if (method === 'stripe.customer.list')
          return { data: [{ id: 'cus_test_1', email: input.customerEmail }] }
        if (method === 'stripe.invoice.list')
          return { data: lostResponse ? [] : [invoice], has_more: false }
        if (method === 'stripe.invoice.create') return invoice
        if (method === 'stripe.invoiceitem.list')
          return { data: itemCreated ? [invoiceItem] : [], has_more: false }
        if (method === 'stripe.invoiceitem.create') {
          itemCreated = true
          lostResponse = false
          throw new Error('response lost after write')
        }
        if (method === 'stripe.invoice.get') return invoice
        throw new Error('unexpected provider method')
      }, calls),
    )
    await expect(adapter.createDraft(input)).rejects.toMatchObject({ code: 'draft_unknown' })
    await expect(adapter.createDraft(input)).resolves.toMatchObject({
      recovered: true,
      invoiceId: invoice.id,
    })
    expect(calls.filter(([method]) => method === 'stripe.invoiceitem.create')).toHaveLength(1)
  })

  it('rejects invalid totals, real customer identities and missing tenant before provider execution', async () => {
    let calls = 0
    const adapter = createStripeDraftAdapter(async () => {
      calls += 1
      return {}
    })
    await expect(adapter.createDraft({ ...input, totalMinor: 149 })).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(adapter.createDraft({ ...input, tenantId: '' })).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(
      adapter.createDraft({ ...input, customerEmail: 'client@example.com' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(calls).toBe(0)
  })
})
