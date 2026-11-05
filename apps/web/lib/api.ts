export type ApiEnvelope<T> = { data: T }
export type ApiError = Error & { code?: string; status?: number; requestId?: string }
const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '')
const apiBaseUrl = configuredApiBaseUrl || null
let csrfToken: string | undefined
let sessionExpiryNotified = false

function readCsrfHeader(response: Response) {
  const header = response.headers.get('x-csrf-token')
  if (header) csrfToken = header
}

export function getApiBaseUrl() {
  return apiBaseUrl
}

export class VendorProofApiError extends Error {
  code?: string
  status?: number
  requestId?: string
  constructor(message: string, details: Partial<ApiError> = {}) {
    super(message)
    this.name = 'VendorProofApiError'
    Object.assign(this, details)
  }
}

function configurationError() {
  return new VendorProofApiError(
    'VendorProof is not configured for this environment. The public demo remains available, but workspace API actions are disabled until NEXT_PUBLIC_API_BASE_URL is set.',
    { code: 'API_NOT_CONFIGURED', status: 503 },
  )
}

function notifySessionExpiry() {
  if (sessionExpiryNotified || typeof window === 'undefined') return
  sessionExpiryNotified = true
  window.dispatchEvent(new CustomEvent('vendorproof:session-expired'))
}

export async function apiRequest<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown; retry?: boolean } = {},
): Promise<T> {
  if (!apiBaseUrl) throw configurationError()
  const method = options.method ?? 'GET'
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (csrfToken && method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', csrfToken)
  const { retry = method === 'GET', ...requestOptions } = options
  let response: Response | undefined
  let lastError: unknown
  for (let attempt = 0; attempt <= (retry ? 1 : 0); attempt += 1) {
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...requestOptions,
        method,
        headers,
        credentials: 'include',
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
      })
      break
    } catch (cause) {
      lastError = cause
      if (attempt === 0 && retry && !options.signal?.aborted) continue
      throw new VendorProofApiError(
        'The API could not be reached. Check the workspace configuration or try again.',
        { code: 'API_UNREACHABLE' },
      )
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : configurationError()
  readCsrfHeader(response)
  const payload = (await response.json().catch(() => undefined)) as
    | (ApiEnvelope<T> & { code?: string; message?: string; requestId?: string; csrfToken?: string })
    | undefined
  if (payload?.csrfToken) csrfToken = payload.csrfToken
  if (response.status === 401) notifySessionExpiry()
  if (!response.ok)
    throw new VendorProofApiError(payload?.message ?? 'The request could not be completed.', {
      code: payload?.code,
      requestId: payload?.requestId,
      status: response.status,
    })
  sessionExpiryNotified = false
  return payload && 'data' in payload ? payload.data : (payload as T)
}

export type User = { id: string; email: string; name: string; status?: string }
export type Workspace = {
  id: string
  name: string
  slug: string
  role?: 'owner' | 'admin' | 'member'
  status?: string
}
export type Session = { user: User; workspaces: Workspace[]; csrfToken?: string }
export type RecordRow = Record<string, unknown> & {
  id?: string
  name?: string
  title?: string
  status?: string
  created_at?: string
}
export const authApi = {
  register: (body: { email: string; name: string; password: string; workspaceName?: string }) =>
    apiRequest<{ user: User; workspace: Workspace; csrfToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body,
      retry: false,
    }),
  login: (body: { email: string; password: string }) =>
    apiRequest<{ user: User; csrfToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body,
      retry: false,
    }),
  me: () => apiRequest<Session>('/api/v1/auth/me'),
  logout: () =>
    apiRequest<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST', retry: false }),
  createWorkspace: (body: { name: string; slug?: string }) =>
    apiRequest<Workspace>('/api/v1/workspaces', { method: 'POST', body, retry: false }),
}
export function workspaceApi(workspaceId: string) {
  const collection = (name: string, signal?: AbortSignal) =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/${name}`, { signal })
  const transition = (resource: string, id: string, body?: Record<string, unknown>) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/${resource}/${id}`, {
      method: 'POST',
      body,
      retry: false,
    })
  return {
    clients: (signal?: AbortSignal) => collection('clients', signal),
    projects: (signal?: AbortSignal) => collection('projects', signal),
    contracts: (signal?: AbortSignal) => collection('contracts', signal),
    timeEntries: (signal?: AbortSignal) => collection('time-entries', signal),
    milestones: (signal?: AbortSignal) => collection('milestones', signal),
    members: (signal?: AbortSignal) => collection('members', signal),
    auditEvents: (signal?: AbortSignal) => collection('audit-events', signal),
    createClient: (body: { name: string; contactEmail?: string | null; notes?: string | null }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/clients`, {
        method: 'POST',
        body,
        retry: false,
      }),
    createProject: (body: {
      clientId: string
      name: string
      description?: string | null
      startDate?: string | null
      targetEndDate?: string | null
    }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        body,
        retry: false,
      }),
    createContract: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/contracts`, {
        method: 'POST',
        body,
        retry: false,
      }),
    createTimeEntry: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/time-entries`, {
        method: 'POST',
        body,
        retry: false,
      }),
    createMilestone: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/milestones`, {
        method: 'POST',
        body,
        retry: false,
      }),
    activateContract: (id: string) => transition('contracts', `${id}/activate`),
    submitTimeEntry: (id: string) => transition('time-entries', `${id}/submit`),
    approveTimeEntry: (id: string) => transition('time-entries', `${id}/approve`),
    completeMilestone: (id: string) => transition('milestones', `${id}/complete`),
    acceptMilestone: (id: string) => transition('milestones', `${id}/accept`),
    sources: (projectId: string, signal?: AbortSignal) =>
      apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources`, {
        signal,
      }),
    mapSource: (projectId: string, body: { provider: 'github'; owner: string; repo: string }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources`, {
        method: 'POST',
        body,
        retry: false,
      }),
    runs: {
      create: (projectId: string, body: { periodStart: string; periodEnd: string }) =>
        apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs`, {
          method: 'POST',
          body,
          retry: false,
        }),
      get: (projectId: string, runId: string) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}`,
        ),
      items: (projectId: string, runId: string) =>
        apiRequest<RecordRow[]>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/items`,
        ),
      start: (projectId: string, runId: string, runVersion: number) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/start`,
          { method: 'POST', body: { runVersion }, retry: false },
        ),
    },
  }
}
