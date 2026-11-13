'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

type ProjectData = {
  project: RecordRow
  client?: RecordRow
  contracts: RecordRow[]
  timeEntries: RecordRow[]
  milestones: RecordRow[]
  sources: RecordRow[]
  runs: RecordRow[]
  events: RecordRow[]
}

function label(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function dateLabel(value: unknown) {
  if (typeof value !== 'string' || !value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const { activeWorkspace } = useAuth()
  const [data, setData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [runItems, setRunItems] = useState<RecordRow[]>([])
  const [busyRun, setBusyRun] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!activeWorkspace || !projectId) return
    setLoading(true)
    setError(null)
    const api = workspaceApi(activeWorkspace.id)
    try {
      const [projects, clients, contracts, timeEntries, milestones, sources, runs, events] =
        await Promise.all([
          api.projects(),
          api.clients(),
          api.contracts(),
          api.timeEntries(),
          api.milestones(),
          api.sources(projectId),
          api.runs.list(projectId),
          api.projectActivity(projectId),
        ])
      const project = projects.find((row) => String(row.id) === projectId)
      if (!project) {
        setData(null)
        setError('This project was not found in the active workspace.')
        return
      }
      const projectContracts = contracts.filter((row) => String(row.project_id ?? '') === projectId)
      const projectEntries = timeEntries.filter((row) => String(row.project_id ?? '') === projectId)
      const projectMilestones = milestones.filter(
        (row) => String(row.project_id ?? '') === projectId,
      )
      const projectRuns = runs.filter((row) => String(row.project_id ?? '') === projectId)
      setData({
        project,
        client: clients.find((row) => String(row.id) === String(project.client_id)),
        contracts: projectContracts,
        timeEntries: projectEntries,
        milestones: projectMilestones,
        sources,
        runs: projectRuns,
        events,
      })
      setNotice(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project details could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const activity = useMemo(() => data?.events.slice(0, 30) ?? [], [data])

  async function showRun(runId: string) {
    if (!activeWorkspace || !projectId) return
    setSelectedRun(runId)
    setRunItems([])
    try {
      setRunItems(await workspaceApi(activeWorkspace.id).runs.items(projectId, runId))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Run evidence could not be loaded.')
    }
  }

  async function progressRun(run: RecordRow, action: 'start' | 'classify') {
    if (!activeWorkspace || !projectId || !run.id) return
    setBusyRun(String(run.id))
    setNotice(null)
    try {
      const api = workspaceApi(activeWorkspace.id)
      const version = Number(run.version ?? 0)
      if (action === 'start') await api.runs.start(projectId, String(run.id), version)
      else await api.runs.classify(projectId, String(run.id), version)
      setNotice(
        action === 'start'
          ? 'Ingestion finished. Reloading run status…'
          : 'Evidence was classified.',
      )
      await load()
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'The reconciliation action could not be completed.',
      )
    } finally {
      setBusyRun(null)
    }
  }

  if (loading && !data) return <div className="screen-state">Loading project workspace…</div>
  if (!data) {
    return (
      <section className="panel panel-large">
        <p className="eyebrow">Project workspace</p>
        <h1>{error ?? 'Project unavailable'}</h1>
        <Link className="button button-light" href="/app/projects">
          Back to projects
        </Link>
      </section>
    )
  }

  return (
    <>
      <nav className="project-breadcrumb" aria-label="Breadcrumb">
        <Link href="/app/projects">Projects</Link>
        <span>/</span>
        <span>{label(data.project.name, 'Project')}</span>
      </nav>
      <header className="page-heading project-detail-heading">
        <div>
          <p className="eyebrow">Project / {label(data.client?.name, 'Client not linked')}</p>
          <h1>{label(data.project.name, 'Unnamed project')}</h1>
          <p className="page-lede">
            {label(
              data.project.description,
              'A focused workspace for contracts, approved work, repository evidence and the project activity trail.',
            )}
          </p>
        </div>
        <Link
          className="button button-dark"
          href={`/app/integrations?projectId=${encodeURIComponent(projectId)}`}
        >
          Connect repository <span>↗</span>
        </Link>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <section className="project-stat-grid" aria-label="Project record counts">
        <article>
          <span>Contracts</span>
          <strong>{data.contracts.length}</strong>
          <Link href="/app/contracts">Open contracts</Link>
        </article>
        <article>
          <span>Time entries</span>
          <strong>{data.timeEntries.length}</strong>
          <Link href="/app/records">Review records</Link>
        </article>
        <article>
          <span>Milestones</span>
          <strong>{data.milestones.length}</strong>
          <Link href="/app/records">Review records</Link>
        </article>
        <article>
          <span>Evidence runs</span>
          <strong>{data.runs.length}</strong>
          <Link href="/app/evidence">Open evidence</Link>
        </article>
      </section>

      <section className="project-detail-grid">
        <article className="panel panel-large">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Delivery records</p>
              <h2>Work attached to this project</h2>
            </div>
            <Link className="text-link" href="/app/records">
              Add or review records →
            </Link>
          </div>
          <div className="project-record-columns">
            <div>
              <h3>Contracts</h3>
              {data.contracts.length ? (
                data.contracts.map((row) => (
                  <div className="project-mini-row" key={String(row.id)}>
                    <strong>{label(row.title, label(row.reference, 'Contract'))}</strong>
                    <span>
                      {label(row.status, 'draft')} · {label(row.billing_model)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No project-specific contracts yet.</p>
              )}
            </div>
            <div>
              <h3>Time entries</h3>
              {data.timeEntries.slice(0, 5).length ? (
                data.timeEntries.slice(0, 5).map((row) => (
                  <div className="project-mini-row" key={String(row.id)}>
                    <strong>{label(row.description, 'Time record')}</strong>
                    <span>
                      {label(row.work_date)} · {label(row.status, 'draft')}
                    </span>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No time entries for this project yet.</p>
              )}
            </div>
            <div>
              <h3>Milestones</h3>
              {data.milestones.slice(0, 5).length ? (
                data.milestones.slice(0, 5).map((row) => (
                  <div className="project-mini-row" key={String(row.id)}>
                    <strong>{label(row.title, 'Milestone')}</strong>
                    <span>
                      {label(row.status, 'draft')} · due {label(row.due_date, 'not set')}
                    </span>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No milestones for this project yet.</p>
              )}
            </div>
          </div>
        </article>

        <article className="panel panel-quiet">
          <p className="eyebrow">Connected repository sources</p>
          <h2>{data.sources.length ? `${data.sources.length} mapped` : 'No repository mapped'}</h2>
          <p className="panel-copy">
            Only bounded GitHub metadata is imported. Repository activity is evidence, never
            billable time.
          </p>
          {data.sources.map((source) => (
            <div className="project-mini-row" key={String(source.id)}>
              <strong>
                {label(source.repository_owner)}/{label(source.repository_name)}
              </strong>
              <span>{label(source.connection_status, 'not connected')}</span>
            </div>
          ))}
          <Link
            className="button button-light"
            href={`/app/integrations?projectId=${encodeURIComponent(projectId)}`}
          >
            {data.sources.length ? 'Manage sources' : 'Map a repository'}
          </Link>
        </article>
      </section>

      <section className="panel panel-large project-runs-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Evidence processing</p>
            <h2>Reconciliation runs</h2>
          </div>
          <Link className="text-link" href="/app/evidence">
            Evidence center →
          </Link>
        </div>
        {data.runs.length ? (
          data.runs.map((run) => (
            <div className="record-row" key={String(run.id)}>
              <div>
                <strong>
                  {label(run.period_start)} to {label(run.period_end)}
                </strong>
                <small>
                  {label(run.completeness, 'not started')} ·{' '}
                  {Number(run.outstanding_decisions ?? 0)} decisions need review · updated{' '}
                  {dateLabel(run.updated_at ?? run.created_at)}
                </small>
              </div>
              <div className="record-actions">
                <span className="record-status">{label(run.status, 'created')}</span>
                {run.status === 'created' && (
                  <button
                    className="button button-ghost"
                    disabled={busyRun === String(run.id)}
                    onClick={() => void progressRun(run, 'start')}
                  >
                    {busyRun === String(run.id) ? 'Starting…' : 'Start ingestion'}
                  </button>
                )}
                {run.status === 'ingested' && (
                  <button
                    className="button button-ghost"
                    disabled={busyRun === String(run.id)}
                    onClick={() => void progressRun(run, 'classify')}
                  >
                    {busyRun === String(run.id) ? 'Classifying…' : 'Classify evidence'}
                  </button>
                )}
                <button className="text-button" onClick={() => void showRun(String(run.id))}>
                  View evidence
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="panel-copy">
            No reconciliation runs yet. Create and process one from the evidence center after a
            repository is connected.
          </p>
        )}
        {selectedRun && (
          <div className="run-evidence-list">
            <div className="panel-toolbar">
              <h3>Run evidence</h3>
              <button className="text-button" onClick={() => setSelectedRun(null)}>
                Close
              </button>
            </div>
            {runItems.length ? (
              runItems.slice(0, 50).map((item) => (
                <div className="project-mini-row" key={String(item.id)}>
                  <strong>{label(item.title, 'Untitled evidence')}</strong>
                  <span>
                    {label(item.item_type)} · {label(item.classification_status)} ·{' '}
                    {label(item.state)}
                  </span>
                </div>
              ))
            ) : (
              <p className="panel-copy">No classified items are visible in this run yet.</p>
            )}
          </div>
        )}
      </section>

      <section className="panel panel-large project-activity-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Workspace audit</p>
            <h2>Project activity trail</h2>
          </div>
          <Link className="text-link" href="/app/settings">
            Workspace audit →
          </Link>
        </div>
        {activity.length ? (
          <div className="project-timeline">
            {activity.map((event) => (
              <article key={String(event.id)}>
                <span className="timeline-dot" />
                <div>
                  <strong>{label(event.action, 'Activity').replaceAll('.', ' ')}</strong>
                  <small>
                    {label(event.entity_type)} · {dateLabel(event.created_at)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-copy">
            No matching project audit events are available in the current workspace activity window.
          </p>
        )}
        <p className="project-audit-note">
          Activity is drawn from the workspace audit log. This view intentionally omits raw provider
          payloads, credentials and before/after record contents.
        </p>
      </section>
    </>
  )
}
