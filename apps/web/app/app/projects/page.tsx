'use client'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'
export default function ProjectsPage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<RecordRow[] | null>(null)
  const [clients, setClients] = useState<RecordRow[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', clientId: '', description: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const load = () => {
    if (activeWorkspace)
      Promise.all([
        workspaceApi(activeWorkspace.id).projects(),
        workspaceApi(activeWorkspace.id).clients(),
      ])
        .then(([p, c]) => {
          setProjects(p)
          setClients(c)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Projects could not be loaded.'))
  }
  useEffect(load, [activeWorkspace])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    try {
      await workspaceApi(activeWorkspace.id).createProject({
        name: form.name,
        clientId: form.clientId,
        description: form.description || null,
      })
      setOpen(false)
      setForm({ name: '', clientId: '', description: '' })
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project could not be created.')
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / projects</p>
          <h1>Project clarity.</h1>
          <p className="page-lede">
            Projects are where contracts, time records, milestones, and evidence meet.
          </p>
        </div>
        <button className="button button-dark" onClick={() => setOpen(true)}>
          New project <span>＋</span>
        </button>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error} <button onClick={load}>Retry</button>
        </div>
      )}
      <section className="panel panel-quiet">
        <p className="eyebrow">Live records</p>
        <h2>
          {projects === null
            ? 'Loading projects…'
            : projects.length
              ? `${projects.length} project${projects.length === 1 ? '' : 's'} in this workspace`
              : 'No projects yet.'}
        </h2>
        {projects?.length ? (
          <div className="record-table">
            {projects.map((project) => (
              <div className="record-row" key={String(project.id)}>
                <div>
                  <strong>{String(project.name ?? 'Unnamed project')}</strong>
                  <small>{String(project.description ?? 'No description')}</small>
                </div>
                <div className="record-actions">
                  <span className="record-status">{String(project.status ?? 'active')}</span>
                  {project.status !== 'archived' && (
                    <>
                      <button
                        className="text-button"
                        onClick={async () => {
                          const name = window.prompt('Project name', String(project.name ?? ''))
                          if (name === null || !name.trim() || !activeWorkspace) return
                          try {
                            await workspaceApi(activeWorkspace.id).updateProject(
                              String(project.id),
                              { name },
                            )
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Project could not be updated.',
                            )
                          }
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (!window.confirm('Archive this project?')) return
                          try {
                            await workspaceApi(activeWorkspace!.id).deleteProject(
                              String(project.id),
                            )
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Project could not be archived.',
                            )
                          }
                        }}
                      >
                        Archive
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>
            Create a client first, then add the project that will hold its evidence and approved
            records.
          </p>
        )}
      </section>
      <Link href="/app/clients" className="button button-light">
        Open clients <span>↗</span>
      </Link>
      {open && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <button className="modal-close" type="button" onClick={() => setOpen(false)}>
              ×
            </button>
            <p className="eyebrow">New project</p>
            <h2>Give evidence a home.</h2>
            <label>
              Project name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Client
              <select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={String(client.id)} value={String(client.id)}>
                    {String(client.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description <span className="optional">optional</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <button className="button button-dark button-wide" disabled={pending}>
              {pending ? 'Creating…' : 'Create project ↗'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
