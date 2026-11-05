'use client'

import { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

export default function IntegrationsPage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<RecordRow[]>([])
  const [sources, setSources] = useState<RecordRow[]>([])
  const [projectId, setProjectId] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    if (!activeWorkspace) return
    const api = workspaceApi(activeWorkspace.id)
    api
      .projects()
      .then(async (rows) => {
        setProjects(rows)
        const all = await Promise.all(rows.map((project) => api.sources(String(project.id))))
        setSources(all.flat())
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Integration status could not be loaded.',
        ),
      )
  }
  useEffect(load, [activeWorkspace])
  async function mapRepository(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
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
          {error} <button onClick={load}>Retry</button>
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
                  <span className="record-status">
                    {String(source.connection_status ?? 'not_connected')}
                  </span>
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
          <p className="eyebrow">Stripe / draft invoices</p>
          <h2>Not connected.</h2>
          <p className="panel-copy">
            Stripe methods are schema-verified but owner authentication and sandbox execution are
            still pending. No invoice screen or connection-success state is shown here.
          </p>
          <span className="status-badge">Not configured</span>
          <p className="coming-soon">
            Connection controls will appear after the verified backend integration is available.
          </p>
        </article>
      </section>
    </>
  )
}
