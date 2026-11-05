import { createHash } from 'node:crypto'

export type InvoiceSource = {
  id: string
  kind: 'time_entry' | 'milestone'
  status: string
  description: string
  workDate: string
  quantity: number
  amountMinor: number
  currency: string
  contractId: string
  clientId: string
  projectId: string
  sourceUpdatedAt: string
}

export type InvoicePreviewInput = {
  workspaceId: string
  billingRunId: string
  runVersion: number
  completeness: 'complete' | 'partial'
  billingTimeZone: string
  clientId: string
  clientName: string
  projectId: string
  projectName: string
  contractId: string
  contractTitle: string
  billingModel: 'hourly' | 'fixed_milestone'
  currency: string
  hourlyRateMinor: number | null
  contractValueMinor: number | null
  acceptedContractMilestonesMinor: number | null
  periodStart: string
  periodEnd: string
  sources: InvoiceSource[]
}

export type InvoicePreviewLine = {
  sourceId: string
  sourceKind: InvoiceSource['kind']
  description: string
  serviceDate: string
  quantity: number
  unitAmountMinor: number
  amountMinor: number
  currency: string
  sourceUpdatedAt: string
}

export type InvoicePreview = {
  version: 1
  workspaceId: string
  billingRunId: string
  runVersion: number
  completeness: 'complete' | 'partial'
  billingTimeZone: string
  acceptedContractMilestonesMinor: number | null
  clientId: string
  clientName: string
  projectId: string
  projectName: string
  contractId: string
  contractTitle: string
  billingModel: InvoicePreviewInput['billingModel']
  currency: string
  contractValueMinor: number | null
  periodStart: string
  periodEnd: string
  lines: InvoicePreviewLine[]
  subtotalMinor: number
  contentHash: string
}

export class InvoicePreviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'InvoicePreviewError'
  }
}

function requireSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new InvoicePreviewError(
      'INVALID_BILLING_DATA',
      `${label} must be a non-negative safe integer`,
    )
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

export function buildInvoicePreview(input: InvoicePreviewInput): InvoicePreview {
  if (input.periodEnd <= input.periodStart)
    throw new InvoicePreviewError('INVALID_PERIOD', 'Invoice period must have a later end date')
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw new InvoicePreviewError(
      'INVALID_CURRENCY',
      'Invoice currency must be a three-letter uppercase code',
    )
  if (input.billingModel === 'hourly') {
    if (input.hourlyRateMinor === null)
      throw new InvoicePreviewError('INVALID_BILLING_DATA', 'Hourly contract has no rate')
    requireSafeInteger(input.hourlyRateMinor, 'Hourly rate')
  } else {
    if (input.contractValueMinor === null)
      throw new InvoicePreviewError(
        'INVALID_BILLING_DATA',
        'Fixed-price contract has no contract value',
      )
    requireSafeInteger(input.contractValueMinor, 'Contract value')
    if (input.acceptedContractMilestonesMinor === null)
      throw new InvoicePreviewError(
        'INVALID_BILLING_DATA',
        'Fixed-price contract accepted-milestone total is missing',
      )
    requireSafeInteger(input.acceptedContractMilestonesMinor, 'Accepted milestone total')
    if (input.acceptedContractMilestonesMinor > input.contractValueMinor)
      throw new InvoicePreviewError(
        'CONTRACT_VALUE_EXCEEDED',
        'Accepted milestones exceed the fixed-price contract value',
      )
  }
  const seen = new Set<string>()
  const eligible = input.sources.filter((source) => {
    if (
      source.contractId !== input.contractId ||
      source.projectId !== input.projectId ||
      source.clientId !== input.clientId
    )
      throw new InvoicePreviewError(
        'RELATIONSHIP_MISMATCH',
        'Billing evidence does not match the selected contract, project, and client',
      )
    if (source.currency !== input.currency)
      throw new InvoicePreviewError(
        'CURRENCY_MISMATCH',
        'Billing evidence currency differs from the contract currency',
      )
    const expectedKind = input.billingModel === 'hourly' ? 'time_entry' : 'milestone'
    if (source.kind !== expectedKind)
      throw new InvoicePreviewError(
        'BILLING_MODEL_MISMATCH',
        'Billing evidence type does not match the contract billing model',
      )
    const eligibleStatus =
      source.kind === 'time_entry' ? source.status === 'approved' : source.status === 'accepted'
    if (!eligibleStatus) return false
    if (source.workDate < input.periodStart || source.workDate >= input.periodEnd) return false
    if (!source.id || seen.has(source.id))
      throw new InvoicePreviewError(
        'DUPLICATE_SOURCE',
        'A billing evidence source appears more than once',
      )
    seen.add(source.id)
    return true
  })
  const lines = eligible
    .map((source): InvoicePreviewLine => {
      requireSafeInteger(source.quantity, 'Quantity')
      if (source.quantity === 0)
        throw new InvoicePreviewError('INVALID_BILLING_DATA', 'Quantity must be greater than zero')
      requireSafeInteger(source.amountMinor, 'Source amount')
      if (source.description.trim().length === 0 || source.description.length > 6000)
        throw new InvoicePreviewError(
          'INVALID_BILLING_DATA',
          'Invoice line description is empty or exceeds 6000 characters',
        )
      const unitAmountMinor =
        input.billingModel === 'hourly' ? (input.hourlyRateMinor as number) : source.amountMinor
      const product = source.quantity * unitAmountMinor
      if (!Number.isSafeInteger(product))
        throw new InvoicePreviewError(
          'AMOUNT_OVERFLOW',
          'Billing amount exceeds safe integer precision',
        )
      const amountMinor =
        input.billingModel === 'hourly'
          ? Math.floor(product / 60) + (product % 60 >= 30 ? 1 : 0)
          : source.amountMinor
      requireSafeInteger(amountMinor, 'Line amount')
      return {
        sourceId: source.id,
        sourceKind: source.kind,
        description: source.description.trim(),
        serviceDate: source.workDate,
        quantity: source.quantity,
        unitAmountMinor,
        amountMinor,
        currency: input.currency,
        sourceUpdatedAt: source.sourceUpdatedAt,
      }
    })
    .sort((a, b) => {
      if (a.serviceDate !== b.serviceDate) return a.serviceDate < b.serviceDate ? -1 : 1
      if (a.sourceId === b.sourceId) return 0
      return a.sourceId < b.sourceId ? -1 : 1
    })
  if (lines.length === 0)
    throw new InvoicePreviewError(
      'NO_ELIGIBLE_EVIDENCE',
      'No approved billing evidence falls within the selected period',
    )
  const subtotalMinor = lines.reduce((sum, line) => {
    const total = sum + line.amountMinor
    if (!Number.isSafeInteger(total))
      throw new InvoicePreviewError(
        'AMOUNT_OVERFLOW',
        'Invoice total exceeds safe integer precision',
      )
    return total
  }, 0)
  if (!Number.isSafeInteger(input.runVersion) || input.runVersion < 0)
    throw new InvoicePreviewError('INVALID_BILLING_DATA', 'Reconciliation version is invalid')
  const payload = {
    version: 1 as const,
    workspaceId: input.workspaceId,
    billingRunId: input.billingRunId,
    runVersion: input.runVersion,
    completeness: input.completeness,
    billingTimeZone: input.billingTimeZone,
    acceptedContractMilestonesMinor: input.acceptedContractMilestonesMinor,
    clientId: input.clientId,
    clientName: input.clientName,
    projectId: input.projectId,
    projectName: input.projectName,
    contractId: input.contractId,
    contractTitle: input.contractTitle,
    billingModel: input.billingModel,
    currency: input.currency,
    contractValueMinor: input.contractValueMinor,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lines,
    subtotalMinor,
  }
  const contentHash = createHash('sha256').update(canonicalJson(payload)).digest('hex')
  if (
    input.billingModel === 'fixed_milestone' &&
    subtotalMinor > (input.acceptedContractMilestonesMinor as number)
  )
    throw new InvoicePreviewError(
      'INVALID_BILLING_DATA',
      'Invoice lines exceed the contract accepted milestone total',
    )
  return { ...payload, contentHash }
}
