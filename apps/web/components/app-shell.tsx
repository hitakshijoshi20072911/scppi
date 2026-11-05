'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/components/auth-provider'

const navigation = [
  { href: '/app', label: 'Overview', icon: '◒' },
  { href: '/app/clients', label: 'Clients', icon: '◌' },
  { href: '/app/projects', label: 'Projects', icon: '⌁' },
  { href: '/app/contracts', label: 'Contracts', icon: '▣' },
  { href: '/app/records', label: 'Approved records', icon: '✓' },
  { href: '/app/evidence', label: 'Evidence & runs', icon: '↗' },
  { href: '/app/integrations', label: 'Integrations', icon: '◎' },
  { href: '/app/settings', label: 'Workspace settings', icon: '⊙' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const auth = useAuth()

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
  }, [auth.loading, auth.user, router])

  if (auth.loading || !auth.user || !auth.activeWorkspace) {
    return <div className="screen-state">Loading your workspace…</div>
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand-lockup" href="/app">
          <span className="brand-mark">V</span>
          <span>
            <strong>VendorProof</strong>
            <small>Traceable work, clearly billed.</small>
          </span>
        </Link>
        <div className="workspace-picker">
          <span className="field-label">Workspace</span>
          <select
            value={auth.activeWorkspace.id}
            onChange={(event) => auth.setActiveWorkspaceId(event.target.value)}
            aria-label="Choose workspace"
          >
            {auth.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              className={pathname === item.href ? 'nav-link active' : 'nav-link'}
              href={item.href}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot status-online" /> Evidence is not hours.
        </div>
        <button
          className="signout-button"
          onClick={async () => {
            await auth.logout()
            router.replace('/login')
          }}
        >
          Sign out <span>↗</span>
        </button>
      </aside>
      <main className="content-area">
        <header className="mobile-header">
          <Link className="brand-lockup" href="/app">
            <span className="brand-mark">V</span>
            <strong>VendorProof</strong>
          </Link>
          <button className="icon-button" aria-label="Open navigation">
            ☰
          </button>
        </header>
        <div className="content-inner">{children}</div>
      </main>
    </div>
  )
}
