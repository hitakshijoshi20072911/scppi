'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

type ProjectRuns = { project: RecordRow; runs: RecordRow[] }

const today = new Date().toISOString().slice(0, 10)
const monthStart = `${today.slice(0, 7)}-01`

function text(value: unknown, fallback = '—') {
  return typeof value === 'string' && value ? value : fallback
}

export default function EvidencePage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<RecordRow[]>([])
  const [groups, setGroups] = useState<ProjectRuns[]>([])
  const [projectId, setProjectId] = useState('')
  const [periodStart, setPeriodStart] = useState(monthStart)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [selected, setSelected] = useState<{ projectId: string; run: RecordRow } | null>(null)
  const [items, setItems] = useState<RecordRow[]>([])
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const api = workspaceApi(activeWorkspace.id)
      const rows = await api.projects()
      const runGroups = await Promise.all(
        rows.map(async (project) => ({
          project,
          runs: await api.runs.list(String(project.id)),
        })),
      )
      setProjects(rows)
      setGroups(runGroups)
      if (!projectId && rows[0]?.id) setProjectId(String(rows[0].id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence runs could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function createRun(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkspace || !projectId) return
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const run = await workspaceApi(activeWorkspace.id).runs.create(projectId, {
        periodStart,
        periodEnd,
      })
      setMessage('Reconciliation run created. It is not started until you choose Start ingestion.')
      await load()
      setSelected({ projectId, run })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The run could not be created.')
    } finally {
      setPending(false)
    }
  }

  async function actOnRun(
    group: ProjectRuns,
    run: RecordRow,
    action: 'start' | 'classify' | 'accept',
  ) {
    if (!activeWorkspace || !run.id) return
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const api = workspaceApi(activeWorkspace.id)
      const runId = String(run.id)
      const version = Number(run.version ?? 0)
      if (action === 'start') await api.runs.start(String(group.project.id), runId, version)
      else if (action === 'classify')
        await api.runs.classify(String(group.project.id), runId, version)
      else await api.runs.acceptPartial(String(group.project.id), runId, version)
      setMessage(
        action === 'start'
          ? 'Ingestion completed. Review the run status and imported evidence.'
          : action === 'classify'
            ? 'Evidence classification completed.'
            : 'Partial ingestion accepted by this workspace member.',
      )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The run action could not be completed.')
    } finally {
      setPending(false)
    }
  }

  async function openItems(projectIdValue: string, run: RecordRow) {
    if (!activeWorkspace || !run.id) return
    setSelected({ projectId: projectIdValue, run })
    setItems([])
    setError(null)
    try {
      setItems(await workspaceApi(activeWorkspace.id).runs.items(projectIdValue, String(run.id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Run evidence could not be loaded.')
    }
  }

  async function decide(item: RecordRow, decision: 'approve' | 'reject') {
    if (!activeWorkspace || !selected?.run.id || !item.id) return
    let category: string | undefined
    let clientDescription: string | undefined
    if (decision === 'approve') {
      category = window
        .prompt('Evidence category (for example: feature, bugfix, maintenance)')
        ?.trim()
      if (!category) return
      clientDescription = window.prompt('Client-friendly description of the accepted work')?.trim()
      if (!clientDescription) return
    } else if (!window.confirm('Reject this imported evidence item for this run?')) return
    setPending(true)
    setError(null)
    try {
      await workspaceApi(activeWorkspace.id).runs.decide(
        selected.projectId,
        String(selected.run.id),
        String(item.id),
        {
          runVersion: Number(selected.run.version ?? 0),
          decision,
          ...(decision === 'approve' ? { category, clientDescription } : {}),
        },
      )
      setMessage(
        `Evidence ${decision === 'approve' ? 'approved' : 'rejected'} by a workspace member. This does not create time or billing records.`,
      )
      const refreshedRun = await workspaceApi(activeWorkspace.id).runs.get(
        selected.projectId,
        String(selected.run.id),
      )
      setSelected({ ...selected, run: refreshedRun })
      setItems(
        await workspaceApi(activeWorkspace.id).runs.items(
          selected.projectId,
          String(selected.run.id),
        ),
      )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The evidence decision could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / evidence</p>
          <h1>Keep the proof close.</h1>
          <p className="page-lede">
            Create bounded reconciliation runs, inspect imported GitHub metadata, and record human
            decisions. Evidence is never converted into hours.
          </p>
        </div>
        <Link className="button button-light" href="/app/integrations">
          Manage integrations <span>↗</span>
        </Link>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {message && (
        <div className="alert" role="status">
          {message}
          <button onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      <section className="panel panel-large evidence-create-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">New reconciliation</p>
            <h2>Choose a project and period</h2>
          </div>
          <span className="record-status">Backend-backed</span>
        </div>
        <form className="inline-form evidence-run-form" onSubmit={createRun}>
          <select required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={String(project.id)} value={String(project.id)}>
                {text(project.name, 'Unnamed project')}
              </option>
            ))}
          </select>
          <label>
            Period start
            <input
              required
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label>
            Period end
            <input
              required
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </label>
          <button className="button button-dark" disabled={pending || !projectId}>
            {pending ? 'Creating…' : 'Create run'}
          </button>
        </form>
        <p className="project-audit-note">
          A project needs an active contract for the selected period. Repository ingestion requires
          a mapped and verified GitHub source; source setup is available from the project workspace.
        </p>
        {!projects.length && !loading && (
          <p className="panel-copy">Create a project before starting a reconciliation run.</p>
        )}
      </section>

      {loading ? (
        <p className="panel-copy">Loading project runs…</p>
      ) : (
        groups.map((group) => (
          <section
            className="panel panel-large evidence-project-panel"
            key={String(group.project.id)}
          >
            <div className="panel-toolbar">
              <div>
                <p className="eyebrow">Project</p>
                <h2>
                  <Link href={`/app/projects/${encodeURIComponent(String(group.project.id))}`}>
                    {text(group.project.name, 'Unnamed project')}
                  </Link>
                </h2>
              </div>
              <span className="record-status">{group.runs.length} runs</span>
            </div>
            {group.runs.length ? (
              <div className="record-table">
                {group.runs.map((run) => (
                  <div className="record-row" key={String(run.id)}>
                    <div>
                      <strong>
                        {text(run.period_start)} to {text(run.period_end)}
                      </strong>
                      <small>
                        {text(run.completeness, 'unknown completeness')} ·{' '}
                        {Number(run.outstanding_decisions ?? 0)} outstanding decisions · version{' '}
                        {Number(run.version ?? 0)}
                      </small>
                    </div>
                    <div className="record-actions">
                      <span className="record-status">{text(run.status, 'unknown')}</span>
                      {run.status === 'created' && (
                        <button
                          className="text-button"
                          disabled={pending}
                          onClick={() => void actOnRun(group, run, 'start')}
                        >
                          Start ingestion
                        </button>
                      )}
                      {run.status === 'ingested' && (
                        <button
                          className="text-button"
                          disabled={pending}
                          onClick={() => void actOnRun(group, run, 'classify')}
                        >
                          Classify evidence
                        </button>
                      )}
                      {run.status === 'ingested_partial' && (
                        <button
                          className="text-button"
                          disabled={pending}
                          onClick={() => void actOnRun(group, run, 'accept')}
                        >
                          Accept partial ingestion
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => void openItems(String(group.project.id), run)}
                      >
                        View items
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-copy">
                No runs for this project yet. Map and verify a repository before starting ingestion.
              </p>
            )}
          </section>
        ))
      )}

      {selected && (
        <section className="panel panel-large evidence-items-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Imported metadata · {text(selected.run.status)}</p>
              <h2>Run items</h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setSelected(null)
                setItems([])
              }}
            >
              Close
            </button>
          </div>
          <p className="panel-copy">
            Review decisions are auditable. Approving evidence classifies the work; it does not add
            a time entry or make it billable.
          </p>
          {items.length ? (
            <div className="record-table">
              {items.slice(0, 100).map((item) => (
                <div className="record-row" key={String(item.id)}>
                  <div>
                    <strong>{text(item.title, 'Untitled evidence')}</strong>
                    <small>
                      {text(item.item_type)} · {text(item.state)} ·{' '}
                      {text(item.author, 'author unavailable')} · {text(item.provider_created_at)}
                    </small>
                    {typeof item.source_url === 'string' && item.source_url.length > 0 && (
                      <a href={String(item.source_url)} target="_blank" rel="noreferrer">
                        Open source ↗
                      </a>
                    )}
                  </div>
                  <div className="record-actions">
                    <span className="record-status">{text(item.classification_status)}</span>
                    {item.classification_status === 'needs_review' && (
                      <>
                        <button
                          className="text-button"
                          disabled={pending}
                          onClick={() => void decide(item, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          className="text-button"
                          disabled={pending}
                          onClick={() => void decide(item, 'reject')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-copy">
              No classified run items are available yet. Start ingestion, then classify the run.
            </p>
          )}
        </section>
      )}
    </>
  )
}
