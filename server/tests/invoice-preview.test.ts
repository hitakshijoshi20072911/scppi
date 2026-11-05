import { describe, expect, it } from 'vitest'
import {
  buildInvoicePreview,
  canonicalJson,
  InvoicePreviewError,
  type InvoicePreviewInput,
} from '../src/modules/billing/invoice-preview.js'

const base: InvoicePreviewInput = {
  workspaceId: 'workspace-1',
  billingRunId: 'run-1',
  runVersion: 2,
  completeness: 'complete',
  billingTimeZone: 'UTC',
  clientId: 'client-1',
  clientName: 'Northwind Studio',
  projectId: 'project-1',
  projectName: 'Portal rebuild',
  contractId: 'contract-1',
  contractTitle: 'Hourly support',
  billingModel: 'hourly',
  currency: 'USD',
  hourlyRateMinor: 10_000,
  contractValueMinor: null,
  acceptedContractMilestonesMinor: null,
  periodStart: '2026-10-01',
  periodEnd: '2026-11-01',
  sources: [
    {
      id: 'time-1',
      kind: 'time_entry',
      status: 'approved',
      description: 'API implementation',
      workDate: '2026-10-10',
      quantity: 60,
      amountMinor: 0,
      currency: 'USD',
      contractId: 'contract-1',
      clientId: 'client-1',
      projectId: 'project-1',
      sourceUpdatedAt: '2026-10-12T12:00:00.000Z',
    },
  ],
}

function expectDomainError(code: string, action: () => unknown) {
  try {
    action()
    throw new Error('Expected the domain operation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(InvoicePreviewError)
    expect((error as InvoicePreviewError).code).toBe(code)
  }
}

describe('deterministic invoice preview', () => {
  it('calculates hourly amounts using integer minor units and half-up rounding', () => {
    const preview = buildInvoicePreview({
      ...base,
      sources: [{ ...base.sources[0], quantity: 1 }],
    })
    expect(preview.lines[0].amountMinor).toBe(167)
    expect(preview.subtotalMinor).toBe(167)
    expect(preview.contentHash).toMatch(/^[0-9a-f]{64}$/)
    const halfMinor = buildInvoicePreview({
      ...base,
      hourlyRateMinor: 1,
      sources: [{ ...base.sources[0], quantity: 30 }],
    })
    const belowHalf = buildInvoicePreview({
      ...base,
      hourlyRateMinor: 1,
      sources: [{ ...base.sources[0], quantity: 29 }],
    })
    expect(halfMinor.subtotalMinor).toBe(1)
    expect(belowHalf.subtotalMinor).toBe(0)
  })

  it('orders lines deterministically and produces the same hash regardless of input order', () => {
    const second = { ...base.sources[0], id: 'time-2', workDate: '2026-10-09' }
    const forward = buildInvoicePreview({ ...base, sources: [base.sources[0], second] })
    const reverse = buildInvoicePreview({ ...base, sources: [second, base.sources[0]] })
    expect(forward.lines.map((line) => line.sourceId)).toEqual(['time-2', 'time-1'])
    expect(forward.contentHash).toBe(reverse.contentHash)
  })

  it('includes only approved evidence in the half-open invoice period', () => {
    const preview = buildInvoicePreview({
      ...base,
      sources: [
        base.sources[0],
        { ...base.sources[0], id: 'pending', status: 'submitted' },
        { ...base.sources[0], id: 'before', workDate: '2026-09-30' },
        { ...base.sources[0], id: 'at-end', workDate: '2026-11-01' },
      ],
    })
    expect(preview.lines.map((line) => line.sourceId)).toEqual(['time-1'])
  })

  it('creates fixed milestone lines only for accepted milestones', () => {
    const milestone = {
      ...base.sources[0],
      id: 'milestone-1',
      kind: 'milestone' as const,
      status: 'accepted',
      description: 'Discovery milestone',
      quantity: 1,
      amountMinor: 125_050,
    }
    const preview = buildInvoicePreview({
      ...base,
      billingModel: 'fixed_milestone',
      hourlyRateMinor: null,
      contractValueMinor: 200_000,
      acceptedContractMilestonesMinor: 125_050,
      sources: [milestone],
    })
    expect(preview.lines[0]).toMatchObject({
      quantity: 1,
      unitAmountMinor: 125_050,
      amountMinor: 125_050,
    })
    expect(preview.subtotalMinor).toBe(125_050)
    expect(() =>
      buildInvoicePreview({
        ...base,
        billingModel: 'fixed_milestone',
        hourlyRateMinor: null,
        contractValueMinor: 100_000,
        acceptedContractMilestonesMinor: 125_050,
        sources: [milestone],
      }),
    ).toThrowError(expect.objectContaining({ code: 'CONTRACT_VALUE_EXCEEDED' }))
  })

  it('binds the hash to the reconciliation version', () => {
    const preview = buildInvoicePreview(base)
    const changedRun = buildInvoicePreview({ ...base, runVersion: base.runVersion + 1 })
    expect(changedRun.contentHash).not.toBe(preview.contentHash)
  })

  it('rejects wrong workspace relationships, currency mismatch, and duplicate evidence', () => {
    expectDomainError('RELATIONSHIP_MISMATCH', () =>
      buildInvoicePreview({
        ...base,
        sources: [{ ...base.sources[0], projectId: 'other-project' }],
      }),
    )
    expectDomainError('CURRENCY_MISMATCH', () =>
      buildInvoicePreview({ ...base, sources: [{ ...base.sources[0], currency: 'EUR' }] }),
    )
    expectDomainError('DUPLICATE_SOURCE', () =>
      buildInvoicePreview({ ...base, sources: [base.sources[0], base.sources[0]] }),
    )
  })

  it('rejects empty periods, zero eligible evidence, invalid money, and overflow', () => {
    expectDomainError('INVALID_PERIOD', () =>
      buildInvoicePreview({ ...base, periodEnd: base.periodStart }),
    )
    expectDomainError('NO_ELIGIBLE_EVIDENCE', () => buildInvoicePreview({ ...base, sources: [] }))
    expectDomainError('INVALID_BILLING_DATA', () =>
      buildInvoicePreview({ ...base, hourlyRateMinor: -1 }),
    )
    expectDomainError('AMOUNT_OVERFLOW', () =>
      buildInvoicePreview({
        ...base,
        sources: [{ ...base.sources[0], quantity: Number.MAX_SAFE_INTEGER }],
      }),
    )
  })

  it('hashes canonical object keys consistently while retaining array order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }))
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })
})
