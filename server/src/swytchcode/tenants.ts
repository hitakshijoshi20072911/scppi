import {
  connect as swytchcodeConnect,
  disconnect as swytchcodeDisconnect,
  type ConnectResult,
  type TenantOptions,
} from '@swytchcode/runtime'

export interface SwytchcodeTenantRuntime {
  connect(options: TenantOptions): ConnectResult
  disconnect(options: TenantOptions): void
}

export interface SwytchcodeTenantManager {
  connect(provider: string, workspaceId: string): ConnectResult
  disconnect(provider: string, workspaceId: string): void
}

function tenantOptions(provider: string, workspaceId: string): TenantOptions {
  if (!provider || !workspaceId || workspaceId.trim() !== workspaceId) {
    throw new Error('Authenticated provider workspace is required')
  }
  return { provider, tenantId: workspaceId }
}

/** Uses only the official Swytchcode runtime and requires an explicit workspace tenant. */
export function createSwytchcodeTenantManager(
  runtime: SwytchcodeTenantRuntime = {
    connect: swytchcodeConnect,
    disconnect: swytchcodeDisconnect,
  },
): SwytchcodeTenantManager {
  return {
    connect(provider, workspaceId) {
      const result = runtime.connect(tenantOptions(provider, workspaceId))
      let url: URL
      try {
        url = new URL(result.url)
      } catch {
        throw new Error('Swytchcode returned an invalid connection URL')
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Swytchcode returned an invalid connection URL')
      }
      return { ...result, url: url.toString() }
    },
    disconnect(provider, workspaceId) {
      runtime.disconnect(tenantOptions(provider, workspaceId))
    },
  }
}

export const swytchcodeTenantManager = createSwytchcodeTenantManager()
