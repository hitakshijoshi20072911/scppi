'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { workspaceApi } from '@/lib/api'

export default function ClientsPage() {
  const { activeWorkspace } = useAuth()
  const [clients, setClients] = useState<Record<string, unknown>[] | null>(null)
  useEffect(() => {
    if (activeWorkspace)
      void workspaceApi(activeWorkspace.id)
        .clients()
        .then(setClients)
        .catch(() => setClients([]))
  }, [activeWorkspace])
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
        <button
          className="button button-dark"
          disabled
          title="Client creation UI is the next CRUD slice"
        >
          Add client <span>＋</span>
        </button>
      </header>
      <section className="panel panel-large">
        <p className="eyebrow">Live records</p>
        <h2>
          {clients === null
            ? 'Loading clients…'
            : clients.length
              ? `${clients.length} client${clients.length === 1 ? '' : 's'} in this workspace`
              : 'No clients yet.'}
        </h2>
        <p className="panel-copy">
          {clients?.length
            ? 'Client records are coming from the VendorProof API.'
            : 'Your workspace is ready. The next step is to add a client before creating a project.'}
        </p>
        <Link href="/app" className="button button-accent">
          Back to overview <span>↗</span>
        </Link>
      </section>
    </>
  )
}
