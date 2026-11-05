'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)
type ApiStatus = 'checking' | 'online' | 'offline'

export default function HomePage() {
  const [status, setStatus] = useState<ApiStatus>('checking')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/health/live`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => setStatus(response.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
    return () => controller.abort()
  }, [])
  return (
    <main className="page-shell">
      <header className="public-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">V</span>
          <span>
            <strong>VendorProof</strong>
            <small>Traceable work, clearly billed.</small>
          </span>
        </Link>
        <div className="nav-actions">
          <Link className="text-link" href="/login">
            Sign in
          </Link>
          <Link className="button button-dark" href="/register">
            Create workspace <span>↗</span>
          </Link>
        </div>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">VendorProof / Foundation</p>
        <h1 id="page-title">
          Verified work.
          <br />
          <em>Traceable invoices.</em>
        </h1>
        <p className="lede">
          A reconciliation layer connecting engineering evidence, human-approved work records, and
          draft billing decisions.
        </p>
        <div className="hero-actions">
          <Link className="button button-dark" href="/register">
            Start with a workspace <span>↗</span>
          </Link>
          <div className="status-card" role="status">
            <span className={`status-dot status-${status}`} aria-hidden="true" />
            <span>API {status === 'checking' ? 'checking…' : status}</span>
          </div>
        </div>
      </section>
      <section className="principles" aria-label="Product principles">
        <article>
          <span>01</span>
          <h2>Evidence is not hours</h2>
          <p>Commits and pull requests show delivery activity, never billable time.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Approval comes first</h2>
          <p>Every billed amount begins with a human-approved record or milestone.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Drafts stay drafts</h2>
          <p>Financial actions remain reviewable and traceable before anything is sent.</p>
        </article>
      </section>
    </main>
  )
}
