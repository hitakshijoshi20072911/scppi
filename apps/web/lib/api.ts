export type ApiEnvelope<T> = { data: T }

export type ApiError = Error & {
  code?: string
  status?: number
  requestId?: string
}

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
  if (!response.ok) {
    throw new VendorProofApiError(payload?.message ?? 'The request could not be completed.', {
      code: payload?.code,
      requestId: payload?.requestId,
      status: response.status,
    })
  }
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
}

export function workspaceApi(workspaceId: string) {
  return {
    clients: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/clients`),
    projects: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/projects`),
    contracts: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/contracts`),
    timeEntries: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/time-entries`),
    milestones: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/milestones`),
    members: () =>
      apiRequest<Record<string, unknown>[]>(`/api/v1/workspaces/${workspaceId}/members`),
  }
}
