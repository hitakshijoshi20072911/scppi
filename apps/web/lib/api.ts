export type ApiEnvelope<T> = { data: T }
export type ApiError = Error & { code?: string; status?: number; requestId?: string }
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)
let csrfToken: string | undefined
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
export async function apiRequest<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (csrfToken && method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', csrfToken)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })
  readCsrfHeader(response)
  const payload = (await response.json().catch(() => undefined)) as
    | (ApiEnvelope<T> & { code?: string; message?: string; requestId?: string; csrfToken?: string })
    | undefined
  if (payload?.csrfToken) csrfToken = payload.csrfToken
  if (!response.ok)
    throw new VendorProofApiError(payload?.message ?? 'The request could not be completed.', {
      code: payload?.code,
      requestId: payload?.requestId,
      status: response.status,
    })
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
    }),
  login: (body: { email: string; password: string }) =>
    apiRequest<{ user: User; csrfToken: string }>('/api/v1/auth/login', { method: 'POST', body }),
  me: () => apiRequest<Session>('/api/v1/auth/me'),
  logout: () => apiRequest<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
  createWorkspace: (body: { name: string; slug?: string }) =>
    apiRequest<Workspace>('/api/v1/workspaces', { method: 'POST', body }),
}
export function workspaceApi(workspaceId: string) {
  const collection = (name: string) =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/${name}`)
  return {
    clients: () => collection('clients'),
    projects: () => collection('projects'),
    contracts: () => collection('contracts'),
    timeEntries: () => collection('time-entries'),
    milestones: () => collection('milestones'),
    members: () => collection('members'),
    auditEvents: () => collection('audit-events'),
    createClient: (body: { name: string; contactEmail?: string | null; notes?: string | null }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/clients`, { method: 'POST', body }),
    createProject: (body: {
      clientId: string
      name: string
      description?: string | null
      startDate?: string | null
      targetEndDate?: string | null
    }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects`, { method: 'POST', body }),
    createContract: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/contracts`, {
        method: 'POST',
        body,
      }),
    createTimeEntry: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/time-entries`, {
        method: 'POST',
        body,
      }),
    createMilestone: (body: Record<string, unknown>) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/milestones`, {
        method: 'POST',
        body,
      }),
    sources: (projectId: string) =>
      apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources`),
    mapSource: (projectId: string, body: { owner: string; repo: string }) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources`, {
        method: 'POST',
        body,
      }),
    runs: {
      create: (projectId: string, body: { periodStart: string; periodEnd: string }) =>
        apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs`, {
          method: 'POST',
          body,
        }),
      get: (projectId: string, runId: string) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}`,
        ),
      items: (projectId: string, runId: string) =>
        apiRequest<RecordRow[]>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/items`,
        ),
    },
  }
}
