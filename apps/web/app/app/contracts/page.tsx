'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

const today = new Date().toISOString().slice(0, 10)

export default function ContractsPage() {
  const { activeWorkspace } = useAuth()
  const [contracts, setContracts] = useState<RecordRow[] | null>(null)
  const [clients, setClients] = useState<RecordRow[]>([])
  const [projects, setProjects] = useState<RecordRow[]>([])
  const [form, setForm] = useState({
    clientId: '',
    projectId: '',
    reference: '',
    title: '',
    billingModel: 'hourly',
    currency: 'USD',
    hourlyRateMinor: '',
    contractValueMinor: '',
    effectiveDate: today,
  })
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    if (!activeWorkspace) return
    const api = workspaceApi(activeWorkspace.id)
    Promise.all([api.contracts(), api.clients(), api.projects()])
      .then(([contractRows, clientRows, projectRows]) => {
        setContracts(contractRows)
        setClients(clientRows)
        setProjects(projectRows)
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Contracts could not be loaded.'),
      )
  }
  useEffect(load, [activeWorkspace])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    try {
      await workspaceApi(activeWorkspace.id).createContract({
        clientId: form.clientId,
        projectId: form.projectId || null,
        reference: form.reference,
        title: form.title,
        billingModel: form.billingModel,
        currency: form.currency,
        effectiveDate: form.effectiveDate,
        ...(form.billingModel === 'hourly'
          ? { hourlyRateMinor: Number(form.hourlyRateMinor) }
          : { contractValueMinor: Number(form.contractValueMinor) }),
      })
      setOpen(false)
      setForm({ ...form, reference: '', title: '', hourlyRateMinor: '', contractValueMinor: '' })
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contract could not be created.')
    } finally {
      setPending(false)
    }
  }
  async function activate(id: string) {
    if (!activeWorkspace) return
    setError(null)
    try {
      await workspaceApi(activeWorkspace.id).activateContract(id)
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contract could not be activated.')
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / contracts</p>
          <h1>Contract context.</h1>
          <p className="page-lede">
            Contracts define the project relationship and the human-approved billing model.
          </p>
        </div>
        <button className="button button-dark" onClick={() => setOpen(true)}>
          New contract <span>＋</span>
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
              {contracts === null
                ? 'Loading contracts…'
                : `${contracts.length} contract${contracts.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          <span className="record-status">Backend-backed</span>
        </div>
        {contracts?.length ? (
          <div className="record-table">
            {contracts.map((contract) => (
              <div className="record-row" key={String(contract.id)}>
                <div>
                  <strong>{String(contract.title ?? contract.reference)}</strong>
                  <small>
                    {String(contract.reference)} ·{' '}
                    {String(contract.billing_model ?? 'billing model')} ·{' '}
                    {String(contract.currency ?? '')}
                  </small>
                </div>
                <div className="record-actions">
                  <span className="record-status">{String(contract.status ?? 'draft')}</span>
                  {contract.status === 'draft' && (
                    <>
                      <button className="text-button" onClick={() => activate(String(contract.id))}>
                        Activate
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          const title = window.prompt(
                            'Contract title',
                            String(contract.title ?? ''),
                          )
                          if (title === null || !title.trim() || !activeWorkspace) return
                          try {
                            await workspaceApi(activeWorkspace.id).updateContract(
                              String(contract.id),
                              { title },
                            )
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Contract could not be updated.',
                            )
                          }
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (!window.confirm('Archive this contract?')) return
                          try {
                            await workspaceApi(activeWorkspace!.id).deleteContract(
                              String(contract.id),
                            )
                            load()
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Contract could not be archived.',
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
        ) : contracts ? (
          <p className="panel-copy">
            No contracts yet. Add one before creating a reconciliation run.
          </p>
        ) : null}
      </section>
      <Link className="text-link" href="/app/records">
        Open approved records →
      </Link>
      {open && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <button className="modal-close" type="button" onClick={() => setOpen(false)}>
              ×
            </button>
            <p className="eyebrow">New contract</p>
            <h2>Set the billing boundary.</h2>
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
              Project <span className="optional">optional</span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              >
                <option value="">Workspace-level contract</option>
                {projects.map((project) => (
                  <option key={String(project.id)} value={String(project.id)}>
                    {String(project.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reference
              <input
                required
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="CON-001"
              />
            </label>
            <label>
              Title
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Billing model
              <select
                value={form.billingModel}
                onChange={(e) => setForm({ ...form, billingModel: e.target.value })}
              >
                <option value="hourly">Hourly</option>
                <option value="fixed_milestone">Fixed milestone</option>
              </select>
            </label>
            <label>
              Currency
              <input
                required
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </label>
            {form.billingModel === 'hourly' ? (
              <label>
                Hourly rate (minor units)
                <input
                  required
                  type="number"
                  min="0"
                  value={form.hourlyRateMinor}
                  onChange={(e) => setForm({ ...form, hourlyRateMinor: e.target.value })}
                />
              </label>
            ) : (
              <label>
                Contract value (minor units)
                <input
                  required
                  type="number"
                  min="0"
                  value={form.contractValueMinor}
                  onChange={(e) => setForm({ ...form, contractValueMinor: e.target.value })}
                />
              </label>
            )}
            <label>
              Effective date
              <input
                required
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </label>
            <button className="button button-dark button-wide" disabled={pending}>
              {pending ? 'Creating…' : 'Create contract ↗'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
