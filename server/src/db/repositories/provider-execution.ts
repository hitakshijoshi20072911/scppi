import { createHash } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import { getDatabase } from '../client.js'
import {
  SwytchcodeExecutorError,
  type SwytchcodeExecutionRequest,
  type SwytchcodeExecutor,
} from '../../swytchcode/executor.js'

const sensitiveKeyPattern = /(token|secret|password|authorization|api[_-]?key|credential)/i

function requestDigest(request: SwytchcodeExecutionRequest): string {
  const safeInput: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(request.input)) {
    safeInput[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : value
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        methodId: request.methodId,
        workspaceId: request.identity.workspaceId,
        input: safeInput,
      }),
    )
    .digest('hex')
}

async function withWorkspace<T>(workspaceId: string, action: (tx: TransactionSql) => Promise<T>) {
  const result = await getDatabase().begin(async (tx) => {
    await tx`select set_config('app.workspace_id', ${workspaceId}, true)`
    return action(tx)
  })
  return result as unknown as T
}

function responseSummary(value: unknown): Record<string, string | number> {
  if (Array.isArray(value)) return { kind: 'array', itemCount: value.length }
  if (value === null) return { kind: 'null' }
  if (typeof value === 'object') return { kind: 'object' }
  return { kind: typeof value }
}

/** Wrap a server-reviewed transport so each bounded, allowlisted read is auditable. */
export function createAuditedSwytchcodeExecutor(
  executor: SwytchcodeExecutor,
  sourceConnectionId: string,
): SwytchcodeExecutor {
  return {
    async execute(request) {
      const digest = requestDigest(request)
      const [execution] = await withWorkspace(
        request.identity.workspaceId,
        async (tx) =>
          tx`insert into provider_execution (workspace_id, source_connection_id, provider, canonical_method_id, status, request_hash, correlation_id) values (${request.identity.workspaceId}, ${sourceConnectionId}, 'github', ${request.methodId}, 'pending', ${digest}, ${digest}) returning id`,
      )
      try {
        const response = await executor.execute(request)
        await withWorkspace(
          request.identity.workspaceId,
          async (tx) =>
            tx`update provider_execution set status = 'succeeded', response_summary = ${JSON.stringify(responseSummary(response))}::jsonb, completed_at = now() where workspace_id = ${request.identity.workspaceId} and id = ${execution.id}`,
        )
        return response
      } catch (error) {
        const errorCode = error instanceof SwytchcodeExecutorError ? error.code : 'EXECUTOR_FAILURE'
        await withWorkspace(
          request.identity.workspaceId,
          async (tx) =>
            tx`update provider_execution set status = 'failed', error_code = ${errorCode}, completed_at = now() where workspace_id = ${request.identity.workspaceId} and id = ${execution.id}`,
        )
        throw error
      }
    },
  }
}
