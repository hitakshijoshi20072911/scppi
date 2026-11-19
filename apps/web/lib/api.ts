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
  const requestUrl = typeof window === 'undefined' ? `${apiBaseUrl}${path}` : path
  let response: Response | undefined
  let lastError: unknown
  for (let attempt = 0; attempt <= (retry ? 1 : 0); attempt += 1) {
    try {
      response = await fetch(requestUrl, {
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
  if (payload?.code === 'CSRF_INVALID' && !options.signal?.aborted) {
    try {
      const session = await apiRequest<Session>('/api/v1/auth/me', { method: 'GET' })
      if (session?.csrfToken) {
        csrfToken = session.csrfToken
        headers.set('x-csrf-token', csrfToken)
        const retryResponse = await fetch(requestUrl, {
          ...requestOptions,
          method,
          headers,
          credentials: 'include',
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          cache: 'no-store',
        })
        readCsrfHeader(retryResponse)
        const retryPayload = (await retryResponse.json().catch(() => undefined)) as
          | (ApiEnvelope<T> & {
              code?: string
              message?: string
              requestId?: string
              csrfToken?: string
            })
          | undefined
        if (retryPayload?.csrfToken) csrfToken = retryPayload.csrfToken
        if (!retryResponse.ok)
          throw new VendorProofApiError(
            retryPayload?.message ?? 'The request could not be completed.',
            {
              code: retryPayload?.code,
              requestId: retryPayload?.requestId,
              status: retryResponse.status,
            },
          )
        return retryPayload && 'data' in retryPayload ? retryPayload.data : (retryPayload as T)
      }
    } catch (cause) {
      if (cause instanceof VendorProofApiError) throw cause
    }
  }
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
  const update = (resource: string, id: string, body: Record<string, unknown>) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/${resource}/${id}`, {
      method: 'PATCH',
      body,
      retry: false,
    })
  const remove = (resource: string, id: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/${resource}/${id}`, {
      method: 'DELETE',
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
    updateClient: (id: string, body: Record<string, unknown>) => update('clients', id, body),
    updateProject: (id: string, body: Record<string, unknown>) => update('projects', id, body),
    updateContract: (id: string, body: Record<string, unknown>) => update('contracts', id, body),
    updateTimeEntry: (id: string, body: Record<string, unknown>) =>
      update('time-entries', id, body),
    updateMilestone: (id: string, body: Record<string, unknown>) => update('milestones', id, body),
    deleteClient: (id: string) => remove('clients', id),
    deleteProject: (id: string) => remove('projects', id),
    deleteContract: (id: string) => remove('contracts', id),
    deleteTimeEntry: (id: string) => remove('time-entries', id),
    deleteMilestone: (id: string) => remove('milestones', id),
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
    connectSource: (projectId: string, sourceId: string) =>
      apiRequest<{ url: string; expiresInSeconds: number }>(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources/${sourceId}/connect`,
        { method: 'POST', retry: false },
      ),
    verifySource: (projectId: string, sourceId: string) =>
      apiRequest<RecordRow>(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources/${sourceId}/verify`,
        { method: 'POST', retry: false },
      ),
    disconnectSource: (projectId: string, sourceId: string) =>
      apiRequest<RecordRow>(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/sources/${sourceId}/disconnect`,
        { method: 'POST', retry: false },
      ),
    integrations: () => apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/integrations`),
    connectStripe: (apiKey: string) =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/integrations/stripe/connect`, {
        method: 'POST',
        body: { apiKey },
        retry: false,
      }),
    verifyStripe: () =>
      apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/integrations/stripe/verify`, {
        method: 'POST',
        retry: false,
      }),
    disconnectStripe: () =>
      apiRequest<{ disconnected: boolean }>(
        `/api/v1/workspaces/${workspaceId}/integrations/stripe/disconnect`,
        { method: 'POST', retry: false },
      ),
    runs: {
      list: (projectId: string) =>
        apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs`),
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
      classify: (projectId: string, runId: string, runVersion: number) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/classify`,
          { method: 'POST', body: { runVersion }, retry: false },
        ),
      acceptPartial: (projectId: string, runId: string, runVersion: number) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/accept-partial`,
          { method: 'POST', body: { runVersion }, retry: false },
        ),
      decide: (
        projectId: string,
        runId: string,
        itemId: string,
        body: {
          runVersion: number
          decision: 'approve' | 'reject'
          category?: string
          clientDescription?: string
        },
      ) =>
        apiRequest<RecordRow>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/items/${itemId}/decision`,
          { method: 'POST', body, retry: false },
        ),
    },
    projectActivity: (projectId: string) =>
      apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/activity`),
  }
}

export const portalApi = {
  acceptInvitation: (token: string) =>
    apiRequest<{ workspaceId: string; clientId: string; role: string }>(
      '/api/v1/portal/invitations/accept',
      { method: 'POST', body: { token }, retry: false },
    ),
  overview: () => apiRequest<{ userId: string; contexts: RecordRow[] }>('/api/v1/portal/overview'),
  contractDecision: (versionId: string, decision: string, reason?: string) =>
    apiRequest<{ decision: string }>(`/api/v1/portal/contract-versions/${versionId}/decision`, {
      method: 'POST',
      body: { decision, reason },
      retry: false,
    }),
  deliverableDecision: (deliverableId: string, decision: string, reason?: string) =>
    apiRequest<{ decision: string }>(`/api/v1/portal/deliverables/${deliverableId}/decision`, {
      method: 'POST',
      body: { decision, reason },
      retry: false,
    }),
  invoice: (invoiceId: string) => apiRequest<RecordRow>(`/api/v1/portal/invoices/${invoiceId}`),
  checkoutInvoice: (invoiceId: string) =>
    apiRequest<{ url: string; sessionId: string }>(
      `/api/v1/portal/invoices/${invoiceId}/checkout`,
      {
        method: 'POST',
        retry: false,
      },
    ),
  verifyInvoicePayment: (invoiceId: string) =>
    apiRequest<{ status: string }>(`/api/v1/portal/invoices/${invoiceId}/verify-payment`, {
      method: 'POST',
      retry: false,
    }),
  markNotificationRead: (notificationId: string) =>
    apiRequest<{ read: boolean }>(`/api/v1/portal/notifications/${notificationId}/read`, {
      method: 'POST',
      retry: false,
    }),
}

export const providerPortalApi = (workspaceId: string) => ({
  inviteClient: (clientId: string, email: string, role: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/clients/${clientId}/invitations`, {
      method: 'POST',
      body: { email, role },
      retry: false,
    }),
  clientInvitations: (clientId: string) =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/clients/${clientId}/invitations`),
  clientPortal: (clientId: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/clients/${clientId}/portal`),
  revokeInvitation: (clientId: string, invitationId: string) =>
    apiRequest<{ revoked: boolean }>(
      `/api/v1/workspaces/${workspaceId}/clients/${clientId}/invitations/${invitationId}/revoke`,
      { method: 'POST', retry: false },
    ),
  createEngagement: (body: Record<string, unknown>) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/engagements`, {
      method: 'POST',
      body,
      retry: false,
    }),
  engagements: () => apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/engagements`),
  contractVersions: (contractId: string) =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/contracts/${contractId}/versions`),
  createContractVersion: (contractId: string, body: Record<string, unknown>) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/contracts/${contractId}/versions`, {
      method: 'POST',
      body,
      retry: false,
    }),
  providerAcceptVersion: (contractId: string, versionId: string) =>
    apiRequest<{ accepted: boolean }>(
      `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/versions/${versionId}/provider-accept`,
      { method: 'POST', retry: false },
    ),
  createDeliverable: (body: Record<string, unknown>) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/deliverables`, {
      method: 'POST',
      body,
      retry: false,
    }),
  projectDeliverables: (projectId: string) =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/deliverables`),
  submitDeliverable: (deliverableId: string) =>
    apiRequest<{ submitted: boolean }>(
      `/api/v1/workspaces/${workspaceId}/deliverables/${deliverableId}/submit`,
      {
        method: 'POST',
        retry: false,
      },
    ),
  projectLifecycle: (projectId: string, event: string, reason?: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/lifecycle`, {
      method: 'POST',
      body: { event, reason },
      retry: false,
    }),
  issueInvoice: (previewId: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/invoice-previews/${previewId}/issue`, {
      method: 'POST',
      retry: false,
    }),
  clientInvoices: () =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/client-invoices`),
})

export const invoiceApi = (workspaceId: string) => ({
  eligibleRuns: () =>
    apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/invoice-eligible-runs`),
  list: () => apiRequest<RecordRow[]>(`/api/v1/workspaces/${workspaceId}/invoice-previews`),
  get: (invoiceId: string) =>
    apiRequest<RecordRow>(`/api/v1/workspaces/${workspaceId}/invoice-previews/${invoiceId}`),
  create: (projectId: string, runId: string, runVersion: number) =>
    apiRequest<RecordRow>(
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/invoice-previews`,
      { method: 'POST', body: { runVersion }, retry: false },
    ),
  review: (
    invoiceId: string,
    input: {
      decision: 'approve' | 'reject'
      version: number
      contentHash: string
      reason?: string
    },
  ) =>
    apiRequest<RecordRow>(
      `/api/v1/workspaces/${workspaceId}/invoice-previews/${invoiceId}/review`,
      {
        method: 'POST',
        body: input,
        retry: false,
      },
    ),
})
