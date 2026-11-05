'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { workspaceApi } from '@/lib/api'

export default function ProjectsPage() {
  const { activeWorkspace } = useAuth()
  const [projects, setProjects] = useState<Record<string, unknown>[] | null>(null)
  useEffect(() => {
    if (activeWorkspace)
      void workspaceApi(activeWorkspace.id)
        .projects()
        .then(setProjects)
        .catch(() => setProjects([]))
  }, [activeWorkspace])
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
        <button
          className="button button-dark"
          disabled
          title="Project creation UI is the next CRUD slice"
        >
          New project <span>＋</span>
        </button>
      </header>
      <section className="panel panel-quiet">
        <p className="eyebrow">Live records</p>
        <h2>
          {projects === null
            ? 'Loading projects…'
            : projects.length
              ? `${projects.length} project${projects.length === 1 ? '' : 's'} in this workspace`
              : 'No projects yet.'}
        </h2>
        <p>
          {projects?.length
            ? 'These records are being read from the authenticated workspace.'
            : 'Create a client first, then add the project that will hold its evidence and approved records.'}
        </p>
        <Link href="/app/clients" className="button button-dark">
          Open clients <span>↗</span>
        </Link>
      </section>
    </>
  )
}
