'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { RecordRow, workspaceApi } from '@/lib/api'

const today = new Date().toISOString().slice(0, 10)

export default function RecordsPage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<RecordRow[]>([])
  const [contracts, setContracts] = useState<RecordRow[]>([])
  const [timeEntries, setTimeEntries] = useState<RecordRow[]>([])
  const [milestones, setMilestones] = useState<RecordRow[]>([])
  const [tab, setTab] = useState<'time' | 'milestones'>('time')
  const [formOpen, setFormOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeForm, setTimeForm] = useState({
    projectId: '',
    contractId: '',
    workDate: today,
    durationMinutes: '60',
    description: '',
  })
  const [milestoneForm, setMilestoneForm] = useState({
    projectId: '',
    contractId: '',
    title: '',
    description: '',
    amountMinor: '',
    currency: 'USD',
    dueDate: '',
  })
  const load = () => {
    if (!activeWorkspace) return
    const api = workspaceApi(activeWorkspace.id)
    Promise.all([api.projects(), api.contracts(), api.timeEntries(), api.milestones()])
      .then(([projectRows, contractRows, timeRows, milestoneRows]) => {
        setProjects(projectRows)
        setContracts(contractRows)
        setTimeEntries(timeRows)
        setMilestones(milestoneRows)
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Approved records could not be loaded.'),
      )
  }
  useEffect(load, [activeWorkspace])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkspace) return
    setPending(true)
    setError(null)
    try {
      const api = workspaceApi(activeWorkspace.id)
      if (tab === 'time')
        await api.createTimeEntry({
          projectId: timeForm.projectId,
          contractId: timeForm.contractId || null,
          workDate: timeForm.workDate,
          durationMinutes: Number(timeForm.durationMinutes),
          description: timeForm.description,
          billable: true,
        })
      else
        await api.createMilestone({
          projectId: milestoneForm.projectId,
          contractId: milestoneForm.contractId,
          title: milestoneForm.title,
          description: milestoneForm.description || null,
          amountMinor: Number(milestoneForm.amountMinor),
          currency: milestoneForm.currency,
          dueDate: milestoneForm.dueDate || null,
        })
      setFormOpen(false)
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The record could not be created.')
    } finally {
      setPending(false)
    }
  }
  async function act(action: () => Promise<RecordRow>) {
    setError(null)
    try {
      await action()
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The record action could not be completed.')
    }
  }
  const projectContracts = (projectId: string) =>
    contracts.filter((contract) => String(contract.project_id ?? '') === projectId)
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / approved records</p>
          <h1>Human evidence.</h1>
          <p className="page-lede">
            Only submitted and approved time entries or accepted milestones can support billing
            review.
          </p>
        </div>
        <button className="button button-dark" onClick={() => setFormOpen(true)}>
          Add {tab === 'time' ? 'time entry' : 'milestone'} <span>＋</span>
        </button>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error} <button onClick={load}>Retry</button>
        </div>
      )}
      <div className="segmented-control" role="tablist">
        <button className={tab === 'time' ? 'selected' : ''} onClick={() => setTab('time')}>
          Time entries ({timeEntries.length})
        </button>
        <button
          className={tab === 'milestones' ? 'selected' : ''}
          onClick={() => setTab('milestones')}
        >
          Milestones ({milestones.length})
        </button>
      </div>
      <section className="panel panel-large">
        <p className="eyebrow">Backend-backed records</p>
        {tab === 'time' ? (
          <div className="record-table">
            {timeEntries.length ? (
              timeEntries.map((entry) => (
                <div className="record-row" key={String(entry.id)}>
                  <div>
                    <strong>{String(entry.description)}</strong>
                    <small>
                      {String(entry.work_date)} · {String(entry.duration_minutes)} minutes
                    </small>
                  </div>
                  <div className="record-actions">
                    <span className="record-status">{String(entry.status ?? 'draft')}</span>
                    {entry.status === 'draft' && (
                      <button
                        className="text-button"
                        onClick={() =>
                          act(() =>
                            workspaceApi(activeWorkspace!.id).submitTimeEntry(String(entry.id)),
                          )
                        }
                      >
                        Submit
                      </button>
                    )}
                    {entry.status === 'submitted' && (
                      <button
                        className="text-button"
                        onClick={() =>
                          act(() =>
                            workspaceApi(activeWorkspace!.id).approveTimeEntry(String(entry.id)),
                          )
                        }
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="panel-copy">No time entries yet.</p>
            )}
          </div>
        ) : (
          <div className="record-table">
            {milestones.length ? (
              milestones.map((milestone) => (
                <div className="record-row" key={String(milestone.id)}>
                  <div>
                    <strong>{String(milestone.title)}</strong>
                    <small>
                      {String(milestone.amount_minor)} {String(milestone.currency)} · due{' '}
                      {String(milestone.due_date ?? 'not set')}
                    </small>
                  </div>
                  <div className="record-actions">
                    <span className="record-status">{String(milestone.status ?? 'draft')}</span>
                    {milestone.status === 'draft' && (
                      <button
                        className="text-button"
                        onClick={() =>
                          act(() =>
                            workspaceApi(activeWorkspace!.id).completeMilestone(
                              String(milestone.id),
                            ),
                          )
                        }
                      >
                        Complete
                      </button>
                    )}
                    {milestone.status === 'completed' && (
                      <button
                        className="text-button"
                        onClick={() =>
                          act(() =>
                            workspaceApi(activeWorkspace!.id).acceptMilestone(String(milestone.id)),
                          )
                        }
                      >
                        Accept
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="panel-copy">No milestones yet.</p>
            )}
          </div>
        )}
      </section>
      {formOpen && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <button className="modal-close" type="button" onClick={() => setFormOpen(false)}>
              ×
            </button>
            <p className="eyebrow">New {tab === 'time' ? 'time entry' : 'milestone'}</p>
            <h2>{tab === 'time' ? 'Record the human decision.' : 'Name the accepted outcome.'}</h2>
            <label>
              Project
              <select
                required
                value={tab === 'time' ? timeForm.projectId : milestoneForm.projectId}
                onChange={(e) =>
                  tab === 'time'
                    ? setTimeForm({ ...timeForm, projectId: e.target.value })
                    : setMilestoneForm({ ...milestoneForm, projectId: e.target.value })
                }
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={String(project.id)} value={String(project.id)}>
                    {String(project.name)}
                  </option>
                ))}
              </select>
            </label>
            {tab === 'time' ? (
              <>
                <label>
                  Contract <span className="optional">optional</span>
                  <select
                    value={timeForm.contractId}
                    onChange={(e) => setTimeForm({ ...timeForm, contractId: e.target.value })}
                  >
                    <option value="">No contract link</option>
                    {projectContracts(timeForm.projectId).map((contract) => (
                      <option key={String(contract.id)} value={String(contract.id)}>
                        {String(contract.title)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input
                    required
                    type="date"
                    value={timeForm.workDate}
                    onChange={(e) => setTimeForm({ ...timeForm, workDate: e.target.value })}
                  />
                </label>
                <label>
                  Duration (minutes)
                  <input
                    required
                    min="1"
                    type="number"
                    value={timeForm.durationMinutes}
                    onChange={(e) => setTimeForm({ ...timeForm, durationMinutes: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    required
                    minLength={3}
                    value={timeForm.description}
                    onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Contract
                  <select
                    required
                    value={milestoneForm.contractId}
                    onChange={(e) =>
                      setMilestoneForm({ ...milestoneForm, contractId: e.target.value })
                    }
                  >
                    <option value="">Select a fixed-milestone contract</option>
                    {projectContracts(milestoneForm.projectId)
                      .filter((contract) => contract.billing_model === 'fixed_milestone')
                      .map((contract) => (
                        <option key={String(contract.id)} value={String(contract.id)}>
                          {String(contract.title)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Title
                  <input
                    required
                    value={milestoneForm.title}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={milestoneForm.description}
                    onChange={(e) =>
                      setMilestoneForm({ ...milestoneForm, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Amount (minor units)
                  <input
                    required
                    min="0"
                    type="number"
                    value={milestoneForm.amountMinor}
                    onChange={(e) =>
                      setMilestoneForm({ ...milestoneForm, amountMinor: e.target.value })
                    }
                  />
                </label>
                <label>
                  Currency
                  <input
                    required
                    maxLength={3}
                    value={milestoneForm.currency}
                    onChange={(e) =>
                      setMilestoneForm({ ...milestoneForm, currency: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label>
                  Due date <span className="optional">optional</span>
                  <input
                    type="date"
                    value={milestoneForm.dueDate}
                    onChange={(e) =>
                      setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <button className="button button-dark button-wide" disabled={pending}>
              {pending ? 'Saving…' : 'Save record ↗'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
