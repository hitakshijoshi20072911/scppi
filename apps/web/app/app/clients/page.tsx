'use client'
import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'
export default function ClientsPage() {
  const { activeWorkspace } = useAuth()
  const [clients, setClients] = useState<RecordRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', contactEmail: '', notes: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const load = () => {
    if (activeWorkspace) {
      setError(null)
      workspaceApi(activeWorkspace.id)
        .clients()
        .then(setClients)
        .catch((e) => setError(e instanceof Error ? e.message : 'Clients could not be loaded.'))
    }
  }
  useEffect(load, [activeWorkspace])
  const filtered = useMemo(
    () =>
      (clients ?? []).filter((c) =>
        String(c.name ?? '')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [clients, query],
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    try {
      await workspaceApi(activeWorkspace.id).createClient({
        name: form.name,
        contactEmail: form.contactEmail || null,
        notes: form.notes || null,
      })
      setForm({ name: '', contactEmail: '', notes: '' })
      setOpen(false)
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Client could not be created.')
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / clients</p>
          <h1>Client context.</h1>
          <p className="page-lede">
            Keep every project grounded in the client relationship it belongs to.
          </p>
        </div>
        <button className="button button-dark" onClick={() => setOpen(true)}>
          Add client <span>＋</span>
        </button>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error} <button onClick={load}>Retry</button>
        </div>
      )}
      <section className="panel panel-large">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Live records</p>
            <h2>
              {clients === null
                ? 'Loading clients…'
                : `${filtered.length} client${filtered.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          <input
            className="table-search"
            placeholder="Search clients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {clients?.length ? (
          <div className="record-table">
            {filtered.map((client) => (
              <div className="record-row" key={String(client.id)}>
                <div>
                  <strong>{String(client.name ?? 'Unnamed client')}</strong>
                  <small>{String(client.contact_email ?? 'No contact email')}</small>
                </div>
                <div className="record-actions">
                  <span className="record-status">{String(client.status ?? 'active')}</span>
                  {client.status !== 'archived' && (
                    <>
                      <button
                        className="text-button"
                        onClick={async () => {
                          const name = window.prompt('Client name', String(client.name ?? ''))
                          if (name === null || !name.trim() || !activeWorkspace) return
                          try {
                            await workspaceApi(activeWorkspace.id).updateClient(String(client.id), {
                              name,
                            })
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Client could not be updated.',
                            )
                          }
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (!window.confirm('Archive this client?')) return
                          try {
                            await workspaceApi(activeWorkspace!.id).deleteClient(String(client.id))
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Client could not be archived.',
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
        ) : clients ? (
          <p className="panel-copy">
            No client records yet. Add your first client to give projects billing context.
          </p>
        ) : null}
      </section>
      {open && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <button className="modal-close" type="button" onClick={() => setOpen(false)}>
              ×
            </button>
            <p className="eyebrow">New client</p>
            <h2>Give the work a relationship.</h2>
            <label>
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Contact email <span className="optional">optional</span>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label>
              Notes <span className="optional">optional</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <button className="button button-dark button-wide" disabled={pending}>
              {pending ? 'Creating…' : 'Create client ↗'}
            </button>
          </form>
        </div>
      )}
      <Link className="text-link" href="/app">
        ← Back to overview
      </Link>
    </>
  )
}
