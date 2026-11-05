'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { invoiceApi, RecordRow } from '@/lib/api'

const value = (row: RecordRow, key: string) => String(row[key] ?? '')
const date = (input: unknown) => {
  if (!input) return '—'
  const raw = String(input)
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}
const money = (minor: unknown, currency: unknown) => {
  const amount = Number(minor)
  if (!Number.isSafeInteger(amount)) return 'Amount unavailable'
  const code = String(currency)
  try {
    const exactOptions: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
    }
    const digits =
      new Intl.NumberFormat(undefined, exactOptions).resolvedOptions().maximumFractionDigits ?? 2
    const amountText = String(amount).padStart(digits + 1, '0')
    const major = Number(digits ? amountText.slice(0, -digits) : amountText)
    const minorPart = digits ? amountText.slice(-digits) : ''
    const wholeParts = new Intl.NumberFormat(undefined, {
      useGrouping: true,
      maximumFractionDigits: 0,
    }).formatToParts(major)
    const template = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).formatToParts(digits ? 1.1 : 1)
    const whole = wholeParts
      .filter((part) => part.type === 'integer' || part.type === 'group')
      .map((part) => part.value)
      .join('')
    const fraction = digits
      ? new Intl.NumberFormat(undefined, {
          useGrouping: false,
          minimumIntegerDigits: digits,
          maximumFractionDigits: 0,
        }).format(Number(minorPart))
      : ''
    let inserted = false
    return template
      .map((part) => {
        if (part.type === 'integer') {
          if (inserted) return ''
          inserted = true
          return whole
        }
        if (part.type === 'group') return ''
        if (part.type === 'fraction') return fraction
        return part.value
      })
      .join('')
  } catch {
    return 'Amount unavailable'
  }
}

export default function InvoicesPage() {
  const { activeWorkspace } = useAuth()
  const [runs, setRuns] = useState<RecordRow[]>([])
  const [invoices, setInvoices] = useState<RecordRow[]>([])
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [lines, setLines] = useState<RecordRow[]>([])
  const [reviews, setReviews] = useState<RecordRow[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (workspaceId: string) => {
    setLoading(true)
    setError(null)
    try {
      const api = invoiceApi(workspaceId)
      const [readyRuns, savedInvoices] = await Promise.all([api.eligibleRuns(), api.list()])
      setRuns(readyRuns)
      setInvoices(savedInvoices)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice review data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      setSelected(null)
      setLines([])
      setReviews([])
      void load(activeWorkspace.id)
    }
  }, [activeWorkspace?.id])

  async function openInvoice(invoiceId: string) {
    if (!activeWorkspace) return
    setError(null)
    try {
      const fresh = await invoiceApi(activeWorkspace.id).get(invoiceId)
      setSelected(fresh)
      setLines(Array.isArray(fresh.lines) ? (fresh.lines as RecordRow[]) : [])
      setReviews(Array.isArray(fresh.reviews) ? (fresh.reviews as RecordRow[]) : [])
      setReason('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice preview could not be loaded.')
    }
  }

  async function createPreview(run: RecordRow) {
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    try {
      const created = await invoiceApi(activeWorkspace.id).create(
        value(run, 'project_id'),
        value(run, 'id'),
        Number(run.version),
      )
      await load(activeWorkspace.id)
      await openInvoice(value(created, 'id'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice preview could not be created.')
    } finally {
      setPending(false)
    }
  }

  async function review(decision: 'approve' | 'reject') {
    if (!activeWorkspace || !selected) return
    if (decision === 'reject' && reason.trim().length < 3) {
      setError('Add a rejection reason (at least 3 characters) before rejecting.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await invoiceApi(activeWorkspace.id).review(String(selected.id), {
        decision,
        version: Number(selected.version),
        contentHash: value(selected, 'content_hash'),
        ...(decision === 'reject' ? { reason: reason.trim() } : {}),
      })
      await load(activeWorkspace.id)
      await openInvoice(String(selected.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice review could not be recorded.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / invoice review</p>
          <h1>Approve the evidence, not a guess.</h1>
          <p className="page-lede">
            Create a versioned preview from a reconciliation that is ready for approval. A hash
            check blocks approval if its source records changed.
          </p>
        </div>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error} <button onClick={() => activeWorkspace && load(activeWorkspace.id)}>Retry</button>
        </div>
      )}
      <section className="panel panel-large">
        <p className="eyebrow">Ready for invoice preview</p>
        <h2>Reconciliation runs</h2>
        <div className="record-table">
          {runs.length ? (
            runs.map((run) => (
              <div className="record-row" key={value(run, 'id')}>
                <div>
                  <strong>
                    {value(run, 'client_name')} · {value(run, 'project_name')}
                  </strong>
                  <small>
                    {date(run.period_start)} – {date(run.period_end)} ·{' '}
                    {value(run, 'completeness') === 'partial'
                      ? 'Accepted partial evidence'
                      : 'Complete evidence'}
                  </small>
                </div>
                <button
                  className="button button-dark"
                  disabled={pending}
                  onClick={() => void createPreview(run)}
                >
                  {pending ? 'Creating…' : 'Build preview'}
                </button>
              </div>
            ))
          ) : (
            <p className="panel-copy">
              {loading
                ? 'Loading eligible runs…'
                : 'No ready reconciliation runs are available. A preview requires an active contract and approved time entries or accepted milestones in the reconciliation period.'}
            </p>
          )}
        </div>
      </section>
      <section className="integration-grid">
        <article className="panel panel-large">
          <p className="eyebrow">Versioned records</p>
          <h2>Invoice previews</h2>
          <div className="record-table">
            {invoices.length ? (
              invoices.map((invoice) => (
                <button
                  className="record-row record-row-button"
                  key={value(invoice, 'id')}
                  onClick={() => void openInvoice(value(invoice, 'id'))}
                >
                  <span>
                    <strong>
                      {value(invoice, 'client_name')} · {value(invoice, 'project_name')}
                    </strong>
                    <small>
                      {date(invoice.period_start)} – {date(invoice.period_end)} ·{' '}
                      {money(invoice.subtotal_minor, invoice.currency)}
                    </small>
                  </span>
                  <span className="record-status">{value(invoice, 'status')}</span>
                </button>
              ))
            ) : (
              <p className="panel-copy">No invoice previews yet.</p>
            )}
          </div>
        </article>
        <article className="panel panel-quiet">
          <p className="eyebrow">Financial safety</p>
          <h2>Review only. No Stripe writes.</h2>
          <p className="panel-copy">
            This release records a human-reviewed, immutable invoice preview. Stripe draft creation
            remains disabled until the verified Swytchcode methods are reviewed, enabled, connected
            in test mode, and sandbox execution is proven.
          </p>
          <span className="status-badge">No sending · no charges</span>
        </article>
      </section>
      {selected && (
        <section className="panel panel-large invoice-review-panel">
          <div className="integration-heading">
            <div>
              <p className="eyebrow">
                {value(selected, 'status')} · {value(selected, 'currency')}
              </p>
              <h2>Invoice preview</h2>
            </div>
            <button className="text-button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="panel-copy">
            {date(selected.period_start)} – {date(selected.period_end)} · Reconciliation{' '}
            {value(selected, 'billing_run_id')}
          </p>
          <div className="record-table">
            {lines.map((line) => (
              <div className="record-row" key={value(line, 'id')}>
                <div>
                  <strong>{value(line, 'description')}</strong>
                  <small>
                    {value(line, 'source_kind')} · source {value(line, 'source_id')} ·{' '}
                    {date(line.service_date)} · {value(line, 'quantity')}{' '}
                    {value(line, 'source_kind') === 'time_entry' ? 'minutes' : 'unit'}
                  </small>
                </div>
                <strong>{money(line.amount_minor, line.currency)}</strong>
              </div>
            ))}
            <div className="record-row">
              <strong>Subtotal</strong>
              <strong>{money(selected.subtotal_minor, selected.currency)}</strong>
            </div>
          </div>
          <p className="panel-copy">
            Content SHA-256: <code>{value(selected, 'content_hash')}</code>
          </p>
          <p className="panel-copy">
            Approval is bound to this hash. A change to the approved evidence, contract,
            description, currency, amount, period, or reconciliation invalidates this preview.
          </p>
          <div className="record-table">
            <p className="eyebrow">Review history</p>
            {reviews.map((item, index) => (
              <div className="record-row" key={`${value(item, 'decision')}-${index}`}>
                <strong>{value(item, 'decision')}</strong>
                <span>
                  {date(item.created_at)} · {value(item, 'reason')}
                </span>
              </div>
            ))}
          </div>
          {selected.status === 'preview' && activeWorkspace?.role === 'owner' && (
            <div className="invoice-review-actions">
              <label>
                Reason if rejecting
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Explain what must be corrected before another review."
                />
              </label>
              <div className="record-actions">
                <button
                  className="button button-dark"
                  disabled={pending}
                  onClick={() => void review('approve')}
                >
                  {pending ? 'Saving…' : 'Approve this snapshot'}
                </button>
                <button
                  className="text-button"
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => void review('reject')}
                >
                  Reject with reason
                </button>
              </div>
              <p className="panel-copy">
                Approving authorizes review only; this implementation does not create, finalize, or
                send a Stripe invoice.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  )
}
