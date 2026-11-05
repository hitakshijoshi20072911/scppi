import { createHash } from 'node:crypto'
import { exec as swytchcodeExec } from '@swytchcode/runtime'
import {
  githubCommitGet2InputSchema,
  githubPullCommitsGetInputSchema,
  githubPullGet1InputSchema,
  githubPullGetInputSchema,
} from '../providers/github/schemas.js'
import { config } from '../platform/config.js'

export const VERIFIED_GITHUB_READ_METHOD_IDS = [
  'github.pull.get',
  'github.pull.get1',
  'github.pull.commits.get',
  'github.commit.get2',
] as const

export type VerifiedGithubReadMethodId = (typeof VERIFIED_GITHUB_READ_METHOD_IDS)[number]

export interface ExecutorIdentity {
  /** Server-established identity. Never sourced from provider input or request headers. */
  readonly workspaceId: string
}

export interface SwytchcodeExecutionRequest {
  readonly methodId: VerifiedGithubReadMethodId
  readonly input: Readonly<Record<string, string | number | boolean | null>>
  readonly identity: ExecutorIdentity
}

export interface ValidatedSwytchcodeExecutionRequest extends SwytchcodeExecutionRequest {
  readonly correlationId: string
}

export interface SwytchcodeTransport {
  execute(request: ValidatedSwytchcodeExecutionRequest): Promise<unknown>
}

const runtimeTimeoutMs = 90_000

/** Production transport for the official Swytchcode runtime. */
export function createSwytchcodeRuntimeTransport(): SwytchcodeTransport | undefined {
  if (!config.SWYTCHCODE_TOKEN) return undefined

  return {
    async execute(request) {
      return swytchcodeExec(
        request.methodId,
        { params: request.input as Record<string, string> },
        { tenantId: request.identity.workspaceId, timeoutMs: runtimeTimeoutMs },
      )
    },
  }
}

export interface SwytchcodeExecutor {
  execute(request: SwytchcodeExecutionRequest): Promise<unknown>
}

export type SwytchcodeExecutorErrorCode =
  | 'EXECUTOR_UNAVAILABLE'
  | 'UNSUPPORTED_METHOD'
  | 'INVALID_EXECUTOR_INPUT'
  | 'INVALID_EXECUTOR_IDENTITY'
  | 'EXECUTOR_FAILURE'

export class SwytchcodeExecutorError extends Error {
  constructor(
    readonly code: SwytchcodeExecutorErrorCode,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'SwytchcodeExecutorError'
  }
}

const inputSchemas = {
  'github.pull.get': githubPullGetInputSchema,
  'github.pull.get1': githubPullGet1InputSchema,
  'github.pull.commits.get': githubPullCommitsGetInputSchema,
  'github.commit.get2': githubCommitGet2InputSchema,
} as const

const sensitiveKeyPattern = /(token|secret|password|authorization|api[_-]?key|credential)/i
const maximumInputKeys = 16
const maximumInputStringLength = 512
const maximumInputKeyLength = 64
const maximumWorkspaceIdLength = 128

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isBoundedInput(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.length > maximumInputKeys) return false
  return keys.every((key) => {
    if (key.length === 0 || key.length > maximumInputKeyLength) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor)) return false
    const child = descriptor.value
    if (typeof child === 'string') return child.length <= maximumInputStringLength
    if (typeof child === 'number') return Number.isFinite(child)
    return child === null || typeof child === 'boolean'
  })
}

function correlationSafeInput(value: unknown): Record<string, unknown> | string {
  if (!isPlainRecord(value)) return '[INVALID_OBJECT]'
  const safe: Record<string, unknown> = {}
  for (const key of Object.keys(value).slice(0, maximumInputKeys)) {
    if (sensitiveKeyPattern.test(key)) {
      safe[key] = '[REDACTED]'
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor)) {
      safe[key] = '[UNREADABLE]'
      continue
    }
    const child = descriptor.value
    if (typeof child === 'string') safe[key] = child.slice(0, maximumInputStringLength)
    else if (typeof child === 'number' && Number.isFinite(child)) safe[key] = child
    else if (typeof child === 'boolean' || child === null) safe[key] = child
    else safe[key] = '[NON_PRIMITIVE]'
  }
  return safe
}

function requestCorrelationId(methodId: unknown, identity: unknown, input: unknown): string {
  const workspaceId =
    isPlainRecord(identity) && typeof identity.workspaceId === 'string'
      ? identity.workspaceId.slice(0, maximumWorkspaceIdLength)
      : '[INVALID_WORKSPACE]'
  const safeMethod = typeof methodId === 'string' ? methodId.slice(0, 128) : '[INVALID_METHOD]'
  const requestDigestMaterial = JSON.stringify({
    methodId: safeMethod,
    workspaceId,
    input: correlationSafeInput(input),
  })
  return createHash('sha256').update(requestDigestMaterial).digest('hex')
}

function isVerifiedMethodId(value: unknown): value is VerifiedGithubReadMethodId {
  return typeof value === 'string' && Object.hasOwn(inputSchemas, value)
}

function validateIdentity(value: unknown): ExecutorIdentity {
  if (!isPlainRecord(value)) {
    throw new SwytchcodeExecutorError(
      'INVALID_EXECUTOR_IDENTITY',
      'Authenticated workspace identity is required',
    )
  }
  const workspaceId = value.workspaceId
  if (
    typeof workspaceId !== 'string' ||
    workspaceId.trim().length === 0 ||
    workspaceId.length > maximumWorkspaceIdLength ||
    /[\r\n\u0000-\u001f]/.test(workspaceId)
  ) {
    throw new SwytchcodeExecutorError(
      'INVALID_EXECUTOR_IDENTITY',
      'Authenticated workspace identity is invalid',
    )
  }
  return Object.freeze({ workspaceId })
}

/**
 * Wrap an injected runtime transport. This wrapper does not select a CLI syntax,
 * invoke a shell, or make a provider HTTP/SDK request.
 */
export function createSwytchcodeExecutor(transport?: SwytchcodeTransport): SwytchcodeExecutor {
  return {
    async execute(request: SwytchcodeExecutionRequest): Promise<unknown> {
      const rawRequest: unknown = request
      const candidate = isPlainRecord(rawRequest) ? rawRequest : {}
      const methodId = candidate.methodId
      const input = candidate.input
      const identityValue = candidate.identity
      const correlationId = requestCorrelationId(methodId, identityValue, input)

      if (!isPlainRecord(rawRequest)) {
        throw new SwytchcodeExecutorError(
          'INVALID_EXECUTOR_INPUT',
          'Executor request must be an object',
          correlationId,
        )
      }

      if (!isVerifiedMethodId(methodId)) {
        throw new SwytchcodeExecutorError(
          'UNSUPPORTED_METHOD',
          'Requested provider method is not in the verified read allowlist',
          correlationId,
        )
      }

      let identity: ExecutorIdentity
      try {
        identity = validateIdentity(identityValue)
      } catch {
        throw new SwytchcodeExecutorError(
          'INVALID_EXECUTOR_IDENTITY',
          'Authenticated workspace identity is invalid',
          correlationId,
        )
      }

      if (!isBoundedInput(input)) {
        throw new SwytchcodeExecutorError(
          'INVALID_EXECUTOR_INPUT',
          'Provider input must be a bounded flat object',
          correlationId,
        )
      }
      const parsed = inputSchemas[methodId].safeParse(input)
      if (!parsed.success) {
        throw new SwytchcodeExecutorError(
          'INVALID_EXECUTOR_INPUT',
          'Provider input does not match the verified method schema',
          correlationId,
        )
      }
      if (!transport) {
        throw new SwytchcodeExecutorError(
          'EXECUTOR_UNAVAILABLE',
          'Swytchcode runtime is unavailable; no provider request was made',
          correlationId,
        )
      }

      const validatedRequest: ValidatedSwytchcodeExecutionRequest = Object.freeze({
        methodId,
        input: Object.freeze({ ...parsed.data }) as Readonly<
          Record<string, string | number | boolean | null>
        >,
        identity,
        correlationId,
      })
      try {
        return await transport.execute(validatedRequest)
      } catch {
        throw new SwytchcodeExecutorError(
          'EXECUTOR_FAILURE',
          'Swytchcode execution failed',
          correlationId,
        )
      }
    },
  }
}

/** Fail-closed default until a reviewed, verified Swytchcode runtime is injected. */
export const unavailableExecutor: SwytchcodeExecutor = createSwytchcodeExecutor()

/** Uses the production runtime when configured, otherwise fails closed. */
export const productionExecutor: SwytchcodeExecutor = createSwytchcodeExecutor(
  createSwytchcodeRuntimeTransport(),
)
