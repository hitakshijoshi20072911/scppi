export const STATE_MACHINE_LIMITS = {
  outstandingDecisions: 10_000,
  version: Number.MAX_SAFE_INTEGER - 1,
  humanId: 128,
} as const

export const RECONCILIATION_STATES = [
  'created',
  'ingesting',
  'ingested',
  'ingested_partial',
  'matching',
  'classifying',
  'needs_review',
  'ready_for_approval',
  'cancelled',
] as const

export type ReconciliationStatus = (typeof RECONCILIATION_STATES)[number]
export type HumanReviewDecision = 'approve' | 'reject'

export interface ReconciliationState {
  status: ReconciliationStatus
  version: number
  outstandingDecisions: number
}

export type ReconciliationAction =
  | { type: 'start-ingestion' }
  | { type: 'ingestion-complete'; completeness: 'complete' | 'partial' }
  | { type: 'retry-failed-source' }
  | { type: 'begin-matching' }
  | { type: 'accept-partial' }
  | { type: 'begin-classifying' }
  | { type: 'classification-complete'; outstandingDecisions: number }
  | { type: 'edit-after-review'; outstandingDecisions: number }
  | {
      type: 'record-human-decision'
      decision: HumanReviewDecision
      humanId: string
    }
  | { type: 'cancel' }

export type TransitionErrorCode =
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE'
  | 'INVALID_ACTION'
  | 'INVALID_DECISION'
  | 'OUTSTANDING_DECISIONS'
  | 'INVALID_STATE_DATA'
  | 'VERSION_EXHAUSTED'

export class ReconciliationTransitionError extends Error {
  constructor(
    public readonly code: TransitionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReconciliationTransitionError'
  }
}

const VALID_STATUSES: ReadonlySet<string> = new Set(RECONCILIATION_STATES)
const SAFE_HUMAN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:@-]*$/
const ACTION_KEYS: Readonly<Record<string, readonly string[]>> = {
  'start-ingestion': ['type'],
  'ingestion-complete': ['type', 'completeness'],
  'retry-failed-source': ['type'],
  'begin-matching': ['type'],
  'accept-partial': ['type'],
  'begin-classifying': ['type'],
  'classification-complete': ['type', 'outstandingDecisions'],
  'edit-after-review': ['type', 'outstandingDecisions'],
  'record-human-decision': ['type', 'decision', 'humanId'],
  cancel: ['type'],
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

export function createReconciliationState(): ReconciliationState {
  return { status: 'created', version: 0, outstandingDecisions: 0 }
}

function assertValidState(state: ReconciliationState): void {
  if (
    typeof state !== 'object' ||
    state === null ||
    !hasExactKeys(state, ['status', 'version', 'outstandingDecisions']) ||
    !VALID_STATUSES.has(state.status) ||
    !Number.isSafeInteger(state.version) ||
    state.version < 0 ||
    state.version > STATE_MACHINE_LIMITS.version ||
    !Number.isSafeInteger(state.outstandingDecisions) ||
    state.outstandingDecisions < 0 ||
    state.outstandingDecisions > STATE_MACHINE_LIMITS.outstandingDecisions ||
    (state.status !== 'needs_review' && state.outstandingDecisions !== 0)
  ) {
    throw new ReconciliationTransitionError('INVALID_STATE_DATA', 'State data is invalid.')
  }
}

function validateDecisionCount(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > STATE_MACHINE_LIMITS.outstandingDecisions
  ) {
    throw new ReconciliationTransitionError(
      'INVALID_ACTION',
      'Decision count must be a bounded non-negative integer.',
    )
  }
}

function isDecisionAction(
  action: ReconciliationAction,
): action is Extract<ReconciliationAction, { type: 'record-human-decision' }> {
  return action.type === 'record-human-decision'
}

/**
 * Applies one domain event without side effects. expectedVersion provides optimistic concurrency;
 * every accepted action increments the version exactly once.
 */
export function transitionReconciliation(
  state: ReconciliationState,
  action: ReconciliationAction,
  expectedVersion: number,
): ReconciliationState {
  assertValidState(state)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new ReconciliationTransitionError('INVALID_ACTION', 'Expected version is invalid.')
  }
  if (expectedVersion !== state.version) {
    throw new ReconciliationTransitionError(
      'VERSION_CONFLICT',
      'The reconciliation version has changed; reload before retrying.',
    )
  }
  if (state.version >= STATE_MACHINE_LIMITS.version) {
    throw new ReconciliationTransitionError(
      'VERSION_EXHAUSTED',
      'Version cannot be incremented safely.',
    )
  }
  if (typeof action !== 'object' || action === null || typeof action.type !== 'string') {
    throw new ReconciliationTransitionError('INVALID_ACTION', 'An explicit action is required.')
  }
  const actionKeys = ACTION_KEYS[action.type]
  if (actionKeys === undefined || !hasExactKeys(action, actionKeys)) {
    throw new ReconciliationTransitionError(
      'INVALID_ACTION',
      'Action shape is invalid or unsupported.',
    )
  }

  let status: ReconciliationStatus
  let outstandingDecisions = 0
  switch (action.type) {
    case 'start-ingestion':
      if (state.status !== 'created') throw invalidTransition(state.status, action.type)
      status = 'ingesting'
      break
    case 'ingestion-complete':
      if (state.status !== 'ingesting') throw invalidTransition(state.status, action.type)
      if (action.completeness === 'complete') status = 'ingested'
      else if (action.completeness === 'partial') status = 'ingested_partial'
      else
        throw new ReconciliationTransitionError(
          'INVALID_ACTION',
          'Ingestion completeness is invalid.',
        )
      break
    case 'retry-failed-source':
      if (state.status !== 'ingested_partial') throw invalidTransition(state.status, action.type)
      status = 'ingesting'
      break
    case 'begin-matching':
      if (state.status !== 'ingested') throw invalidTransition(state.status, action.type)
      status = 'matching'
      break
    case 'accept-partial':
      if (state.status !== 'ingested_partial') throw invalidTransition(state.status, action.type)
      status = 'matching'
      break
    case 'begin-classifying':
      if (state.status !== 'matching') throw invalidTransition(state.status, action.type)
      status = 'classifying'
      break
    case 'classification-complete':
      if (state.status !== 'classifying') throw invalidTransition(state.status, action.type)
      validateDecisionCount(action.outstandingDecisions)
      outstandingDecisions = action.outstandingDecisions
      status = outstandingDecisions === 0 ? 'ready_for_approval' : 'needs_review'
      break
    case 'edit-after-review':
      if (state.status !== 'ready_for_approval') throw invalidTransition(state.status, action.type)
      validateDecisionCount(action.outstandingDecisions)
      if (action.outstandingDecisions === 0) {
        throw new ReconciliationTransitionError(
          'INVALID_ACTION',
          'An edit after review must create at least one outstanding decision.',
        )
      }
      outstandingDecisions = action.outstandingDecisions
      status = 'needs_review'
      break
    case 'record-human-decision':
      if (state.status !== 'needs_review') throw invalidTransition(state.status, action.type)
      if (
        !isDecisionAction(action) ||
        (action.decision !== 'approve' && action.decision !== 'reject') ||
        typeof action.humanId !== 'string' ||
        action.humanId.length === 0 ||
        action.humanId.length > STATE_MACHINE_LIMITS.humanId ||
        !SAFE_HUMAN_ID.test(action.humanId)
      ) {
        throw new ReconciliationTransitionError(
          'INVALID_DECISION',
          'A valid human identity and explicit approve/reject decision are required.',
        )
      }
      if (state.outstandingDecisions === 0) {
        throw new ReconciliationTransitionError(
          'OUTSTANDING_DECISIONS',
          'There is no outstanding decision to resolve.',
        )
      }
      outstandingDecisions = state.outstandingDecisions - 1
      status = outstandingDecisions === 0 ? 'ready_for_approval' : 'needs_review'
      break
    case 'cancel':
      if (
        state.status !== 'created' &&
        state.status !== 'needs_review' &&
        state.status !== 'ready_for_approval'
      ) {
        throw invalidTransition(state.status, action.type)
      }
      status = 'cancelled'
      break
    default:
      throw new ReconciliationTransitionError('INVALID_ACTION', 'Action is not supported.')
  }

  return { status, version: state.version + 1, outstandingDecisions }
}

function invalidTransition(
  status: ReconciliationStatus,
  action: string,
): ReconciliationTransitionError {
  return new ReconciliationTransitionError(
    'INVALID_STATE',
    `Action '${action}' is not valid from state '${status}'.`,
  )
}
