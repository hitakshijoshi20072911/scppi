'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { portalApi, RecordRow } from '@/lib/api'

type Context = RecordRow & {
  engagements: RecordRow[]
  deliverables: RecordRow[]
  invoices: RecordRow[]
  notifications: RecordRow[]
  contractVersions: RecordRow[]
}

const money = (minor: unknown, currency: unknown) =>
  `${String(currency ?? 'usd').toUpperCase()} ${((Number(minor ?? 0) || 0) / 100).toFixed(2)}`

export default function ClientPortalPage() {
  const { user, loading } = useAuth()
  const [contexts, setContexts] = useState<Context[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(() => {
    portalApi
      .overview()
      .then((data) => setContexts(data.contexts as Context[]))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Portal could not be loaded.'),
      )
  }, [])
  useEffect(() => {
    if (!loading && user) load()
  }, [loading, user, load])

  async function payInvoice(invoice: RecordRow) {
    const id = String(invoice.id)
    setPending(id)
    setError(null)
    try {
      const result = await portalApi.checkoutInvoice(id)
      window.open(result.url, '_blank', 'noopener')
      await portalApi.verifyInvoicePayment(id).catch(() => undefined)
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Checkout could not be started.')
    } finally {
      setPending(null)
    }
  }

  async function decide(kind: 'contract' | 'deliverable', id: string, decision: string) {
    setPending(id)
    setError(null)
    try {
      if (kind === 'contract') await portalApi.contractDecision(id, decision)
      else await portalApi.deliverableDecision(id, decision)
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision could not be recorded.')
    } finally {
      setPending(null)
    }
  }

  if (loading || contexts === null) {
    return (
      <main className="portal-shell">
        <section className="panel panel-large portal-card">
          <p className="eyebrow">Client portal</p>
          <h1>{error ? 'Something went wrong' : 'Loading your portal…'}</h1>
          {error && <p className="alert alert-error">{error}</p>}
        </section>
      </main>
    )
  }

  if (!contexts.length) {
    return (
      <main className="portal-shell">
        <section className="panel panel-large portal-card">
          <p className="eyebrow">Client portal</p>
          <h1>No client organisations yet</h1>
          <p className="panel-copy">
            You have not been invited to any provider workspace. Ask your provider for an invitation
            link.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Client portal</p>
          <h1>Your projects & invoices.</h1>
          <p className="page-lede">
            Review contracts, accept deliverables and pay invoices from your providers.
          </p>
        </div>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {contexts.map((ctx) => (
        <section key={String(ctx.client_id)} className="integration-grid">
          <article className="panel panel-large">
            <div className="integration-heading">
              <div>
                <p className="eyebrow">{String(ctx.workspace_name)}</p>
                <h2>{String(ctx.client_name)}</h2>
              </div>
              <span className="record-status">{String(ctx.role)}</span>
            </div>

            <h3 className="panel-subheading">Contracts</h3>
            <div className="record-table">
              {ctx.contractVersions.length ? (
                ctx.contractVersions.map((v) => {
                  const snapshot = (v.snapshot ?? {}) as RecordRow
                  const myAcceptance = (v.accepted_at ?? null) as string | null
                  return (
                    <div className="record-row" key={String(v.id)}>
                      <div>
                        <strong>
                          v{String(v.version)} · {String(snapshot.title ?? 'Contract')}
                        </strong>
                        <small>
                          {String(snapshot.billingModel ?? '')} ·{' '}
                          {money(
                            snapshot.contractValueMinor ?? snapshot.hourlyRateMinor,
                            snapshot.currency,
                          )}{' '}
                          · status: {String(v.status)}
                        </small>
                      </div>
                      <div className="record-actions">
                        <span className="record-status">{String(v.status)}</span>
                        {v.status !== 'accepted' && v.status !== 'rejected' && !myAcceptance && (
                          <>
                            <button
                              className="button button-dark"
                              disabled={pending === String(v.id)}
                              onClick={() => decide('contract', String(v.id), 'accept')}
                            >
                              Accept
                            </button>
                            <button
                              className="button button-ghost"
                              disabled={pending === String(v.id)}
                              onClick={() => decide('contract', String(v.id), 'request_changes')}
                            >
                              Request changes
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="panel-copy">No contract versions yet.</p>
              )}
            </div>

            <h3 className="panel-subheading">Projects</h3>
            <div className="record-table">
              {ctx.engagements.length ? (
                ctx.engagements.map((e) => (
                  <div className="record-row" key={String(e.id)}>
                    <div>
                      <strong>{String(e.name)}</strong>
                      <small>
                        {String(e.status)} · {String(e.billing_model ?? '')}
                      </small>
                    </div>
                    <span className="record-status">{String(e.status)}</span>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No projects shared yet.</p>
              )}
            </div>

            <h3 className="panel-subheading">Deliverables</h3>
            <div className="record-table">
              {ctx.deliverables.length ? (
                ctx.deliverables.map((d) => (
                  <div className="record-row" key={String(d.id)}>
                    <div>
                      <strong>{String(d.title)}</strong>
                      <small>
                        {d.amount_minor != null ? money(d.amount_minor, d.currency) : 'No amount'}
                        {d.due_date ? ` · due ${String(d.due_date).slice(0, 10)}` : ''}
                      </small>
                    </div>
                    <div className="record-actions">
                      <span className="record-status">{String(d.status)}</span>
                      {d.status === 'submitted' && (
                        <>
                          <button
                            className="button button-dark"
                            disabled={pending === String(d.id)}
                            onClick={() => decide('deliverable', String(d.id), 'accept')}
                          >
                            Accept
                          </button>
                          <button
                            className="button button-ghost"
                            disabled={pending === String(d.id)}
                            onClick={() => decide('deliverable', String(d.id), 'request_revision')}
                          >
                            Request revision
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No deliverables yet.</p>
              )}
            </div>

            <h3 className="panel-subheading">Invoices</h3>
            <div className="record-table">
              {ctx.invoices.length ? (
                ctx.invoices.map((inv) => (
                  <div className="record-row" key={String(inv.id)}>
                    <div>
                      <strong>{String(inv.invoice_number)}</strong>
                      <small>
                        {money(inv.total_minor, inv.currency)} · issued{' '}
                        {inv.issued_at ? new Date(String(inv.issued_at)).toLocaleDateString() : ''}
                        {inv.due_date ? ` · due ${String(inv.due_date).slice(0, 10)}` : ''}
                      </small>
                    </div>
                    <div className="record-actions">
                      <span className="record-status">{String(inv.status)}</span>
                      {['issued', 'open', 'overdue'].includes(String(inv.status)) && (
                        <button
                          className="button button-dark"
                          disabled={pending === String(inv.id)}
                          onClick={() => payInvoice(inv)}
                        >
                          Pay test
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No invoices yet.</p>
              )}
            </div>

            <h3 className="panel-subheading">Activity</h3>
            <div className="record-table">
              {ctx.notifications.length ? (
                ctx.notifications.map((n) => (
                  <div className="record-row" key={String(n.id)}>
                    <div>
                      <strong>{String(n.title)}</strong>
                      <small>
                        {n.body ? String(n.body) : ''} ·{' '}
                        {n.created_at ? new Date(String(n.created_at)).toLocaleString() : ''}
                      </small>
                    </div>
                    <span className="record-status">{n.read_at ? 'read' : 'new'}</span>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No activity yet.</p>
              )}
            </div>
          </article>
        </section>
      ))}
    </main>
  )
}
