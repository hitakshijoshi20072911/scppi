'use client'

import { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

type RetryAction = {
  source: RecordRow
  action: 'connect' | 'verify' | 'disconnect'
}

export default function IntegrationsPage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<RecordRow[]>([])
  const [sources, setSources] = useState<RecordRow[]>([])
  const [projectId, setProjectId] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null)
  const load = () => {
    if (!activeWorkspace) return
    const api = workspaceApi(activeWorkspace.id)
    api
      .projects()
      .then(async (rows) => {
        setProjects(rows)
        const requestedProject = new URLSearchParams(window.location.search).get('projectId')
        if (requestedProject && rows.some((project) => String(project.id) === requestedProject))
          setProjectId(requestedProject)
        const all = await Promise.all(rows.map((project) => api.sources(String(project.id))))
        setSources(
          all.flatMap((projectSources, index) =>
            projectSources.map((source) => ({
              ...source,
              project_id: String(rows[index]?.id),
            })),
          ),
        )
        setRetryAction(null)
      })
      .catch((cause) => {
        setRetryAction(null)
        setError(cause instanceof Error ? cause.message : 'Integration status could not be loaded.')
      })
  }
  useEffect(load, [activeWorkspace])
  async function mapRepository(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    setRetryAction(null)
    try {
      await workspaceApi(activeWorkspace.id).mapSource(projectId, {
        provider: 'github',
        owner,
        repo,
      })
      setOwner('')
      setRepo('')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repository could not be mapped.')
    } finally {
      setPending(false)
    }
  }
  async function connectSource(source: RecordRow) {
    if (!activeWorkspace || !source.id || !source.project_id) return
    const popup = window.open('', 'vendorproof-github-connect', 'width=520,height=720')
    setPending(true)
    setError(null)
    setRetryAction(null)
    try {
      const result = await workspaceApi(activeWorkspace.id).connectSource(
        String(source.project_id),
        String(source.id),
      )
      if (popup) popup.location.href = result.url
      else window.location.href = result.url
    } catch (cause) {
      popup?.close()
      setRetryAction({ source, action: 'connect' })
      setError(cause instanceof Error ? cause.message : 'GitHub connection could not be started.')
    } finally {
      setPending(false)
    }
  }
  async function verifySource(source: RecordRow) {
    if (!activeWorkspace || !source.id || !source.project_id) return
    setPending(true)
    setError(null)
    setRetryAction(null)
    try {
      await workspaceApi(activeWorkspace.id).verifySource(
        String(source.project_id),
        String(source.id),
      )
      load()
    } catch (cause) {
      setRetryAction({ source, action: 'verify' })
      setError(cause instanceof Error ? cause.message : 'GitHub access could not be verified.')
    } finally {
      setPending(false)
    }
  }
  async function disconnectSource(source: RecordRow) {
    if (!activeWorkspace || !source.id || !source.project_id) return
    setPending(true)
    setError(null)
    setRetryAction(null)
    try {
      await workspaceApi(activeWorkspace.id).disconnectSource(
        String(source.project_id),
        String(source.id),
      )
      load()
    } catch (cause) {
      setRetryAction({ source, action: 'disconnect' })
      setError(cause instanceof Error ? cause.message : 'GitHub connection could not be revoked.')
    } finally {
      setPending(false)
    }
  }
  function retryFailedAction() {
    if (!retryAction) return load()
    if (retryAction.action === 'connect') return void connectSource(retryAction.source)
    if (retryAction.action === 'verify') return void verifySource(retryAction.source)
    return void disconnectSource(retryAction.source)
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / integrations</p>
          <h1>Provider boundaries.</h1>
          <p className="page-lede">
            See what is configured, what is mapped, and what still requires owner authentication.
          </p>
        </div>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}{' '}
          <button onClick={retryFailedAction}>
            {retryAction ? `Retry ${retryAction.action}` : 'Retry status'}
          </button>
        </div>
      )}
      <section className="integration-grid">
        <article className="panel panel-large">
          <div className="integration-heading">
            <span className="integration-icon">GH</span>
            <div>
              <p className="eyebrow">GitHub / read evidence</p>
              <h2>Repository mapping</h2>
            </div>
            <span className="record-status">{sources.length ? 'Mapped' : 'Not connected'}</span>
          </div>
          <p className="panel-copy">
            Mapping stores the repository relationship. It does not claim OAuth consent or provider
            execution; those remain owner-controlled until authenticated.
          </p>
          <div className="record-table">
            {sources.length ? (
              sources.map((source) => (
                <div className="record-row" key={String(source.id)}>
                  <div>
                    <strong>
                      {String(source.repository_owner)}/{String(source.repository_name)}
                    </strong>
                    <small>Project source · last sync unavailable until provider auth</small>
                  </div>
                  <div className="record-actions">
                    <span className="record-status">
                      {String(source.connection_status ?? 'not_connected')}
                    </span>
                    {source.connection_status === 'connected' ? (
                      <button
                        className="button button-ghost"
                        disabled={pending}
                        onClick={() => disconnectSource(source)}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <>
                        <button
                          className="button button-ghost"
                          disabled={pending}
                          onClick={() => connectSource(source)}
                        >
                          {pending ? 'Connecting…' : 'Connect GitHub'}
                        </button>
                        <button
                          className="button button-ghost"
                          disabled={pending}
                          onClick={() => verifySource(source)}
                        >
                          Verify access
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="panel-copy">No repositories mapped yet.</p>
            )}
          </div>
          <form className="inline-form" onSubmit={mapRepository}>
            <select required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Project to map</option>
              {projects.map((project) => (
                <option key={String(project.id)} value={String(project.id)}>
                  {String(project.name)}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
            <input
              required
              placeholder="repository"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <button className="button button-dark" disabled={pending}>
              {pending ? 'Mapping…' : 'Map repository'}
            </button>
          </form>
        </article>
        <article className="panel panel-quiet">
          <p className="eyebrow">Stripe / test-mode drafts</p>
          <h2>Setup required.</h2>
          <p className="panel-copy">
            VendorProof will only create an approved test-mode draft. The Swytchcode Stripe methods
            and API route are deliberately disabled until a test credential is verified and
            idempotent recovery is implemented.
          </p>
          <span className="status-badge">Not connected · not verified</span>
          <p className="coming-soon">
            No live or financial action is available from this workspace.
          </p>
          <button className="button button-ghost" disabled aria-describedby="stripe-setup-note">
            Connect Stripe test account
          </button>
          <small id="stripe-setup-note" className="provider-setup-note">
            Connect remains unavailable until server-side test-mode verification and a safe
            draft-only API path are complete.
          </small>
        </article>
        <article className="panel panel-quiet">
          <p className="eyebrow">Google Calendar / reminders</p>
          <h2>Setup required.</h2>
          <p className="panel-copy">
            Calendar reminders will be restricted to a VendorProof-created calendar. The provider
            methods remain disabled until trusted calendar ownership is stored and live OAuth is
            verified.
          </p>
          <span className="status-badge">Not connected · not verified</span>
          <p className="coming-soon">
            Planned least-privilege access: read calendar list and manage only app-created
            calendars/events.
          </p>
          <button className="button button-ghost" disabled aria-describedby="calendar-setup-note">
            Connect Google Calendar
          </button>
          <small id="calendar-setup-note" className="provider-setup-note">
            No Gmail, Drive or Contacts access is requested. Connection is unavailable until backend
            ownership safeguards are implemented.
          </small>
        </article>
      </section>
    </>
  )
}
