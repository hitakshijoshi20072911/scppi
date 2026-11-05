'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { workspaceApi } from '@/lib/api'

type Counts = {
  clients: number
  projects: number
  contracts: number
  milestones: number
  timeEntries: number
}

export default function DashboardPage() {
  const { activeWorkspace, user } = useAuth()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeWorkspace) return
    const api = workspaceApi(activeWorkspace.id)
    Promise.all([
      api.clients(),
      api.projects(),
      api.contracts(),
      api.milestones(),
      api.timeEntries(),
    ])
      .then(([clients, projects, contracts, milestones, timeEntries]) =>
        setCounts({
          clients: clients.length,
          projects: projects.length,
          contracts: contracts.length,
          milestones: milestones.length,
          timeEntries: timeEntries.length,
        }),
      )
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Unable to load workspace data.'),
      )
  }, [activeWorkspace])

  const cards = counts
    ? [
        { label: 'Active clients', value: counts.clients, href: '/app/clients', tone: 'lime' },
        { label: 'Projects', value: counts.projects, href: '/app/projects', tone: 'blue' },
        { label: 'Contracts', value: counts.contracts, href: '/app/projects', tone: 'sand' },
        {
          label: 'Manual time entries',
          value: counts.timeEntries,
          href: '/app/projects',
          tone: 'rose',
        },
      ]
    : []

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{activeWorkspace?.name} / overview</p>
          <h1>Good to see you, {user?.name.split(' ')[0]}.</h1>
          <p className="page-lede">
            Keep the link between engineering evidence and approved work unmistakably clear.
          </p>
        </div>
        <Link className="button button-dark" href="/app/projects">
          Open projects <span>↗</span>
        </Link>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <section className="metric-grid" aria-label="Workspace metrics">
        {cards.length
          ? cards.map((card) => (
              <Link href={card.href} className={`metric-card ${card.tone}`} key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>
                  View records <span>↗</span>
                </small>
              </Link>
            ))
          : [1, 2, 3, 4].map((item) => (
              <div className="metric-card skeleton" key={item}>
                <span>Loading workspace data</span>
                <strong>—</strong>
              </div>
            ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your operating principle</p>
              <h2>Evidence earns attention. People approve the bill.</h2>
            </div>
            <span className="panel-index">01</span>
          </div>
          <p className="panel-copy">
            VendorProof keeps imported GitHub activity separate from the human-approved time and
            milestone records that can eventually support billing. Start by setting up a client and
            project.
          </p>
          <div className="action-row">
            <Link href="/app/clients" className="button button-light">
              Add a client
            </Link>
            <Link href="/app/projects" className="text-link">
              Explore projects <span>→</span>
            </Link>
          </div>
        </article>
        <article className="panel panel-quiet">
          <p className="eyebrow">Next step</p>
          <h2>{counts?.clients ? 'Map your first repository' : 'Create your first client'}</h2>
          <p>
            {counts?.clients
              ? 'Once a project exists, you can associate its evidence sources and begin a bounded reconciliation run.'
              : 'A client gives your projects and contracts the context they need.'}
          </p>
          <Link
            href={counts?.clients ? '/app/projects' : '/app/clients'}
            className="button button-accent"
          >
            {counts?.clients ? 'View projects' : 'Create client'} <span>↗</span>
          </Link>
        </article>
      </section>
    </>
  )
}
