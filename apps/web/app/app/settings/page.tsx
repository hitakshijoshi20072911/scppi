'use client'

import { useAuth } from '@/components/auth-provider'

export default function SettingsPage() {
  const { user, activeWorkspace } = useAuth()
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / settings</p>
          <h1>Account and access.</h1>
          <p className="page-lede">
            A clear view of your current VendorProof identity and workspace role.
          </p>
        </div>
      </header>
      <section className="dashboard-grid">
        <article className="panel">
          <p className="eyebrow">Current user</p>
          <h2>{user?.name}</h2>
          <p>{user?.email}</p>
          <p className="panel-copy">
            Session credentials remain in the browser’s HttpOnly cookie and are never rendered here.
          </p>
        </article>
        <article className="panel panel-quiet">
          <p className="eyebrow">Active workspace</p>
          <h2>{activeWorkspace?.name}</h2>
          <p>{activeWorkspace?.slug}</p>
          <p>
            Role: <strong>{activeWorkspace?.role ?? 'member'}</strong>
          </p>
        </article>
      </section>
    </>
  )
}
