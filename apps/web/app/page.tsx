'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)
type ApiStatus = 'checking' | 'online' | 'offline'
const workflow = [
  'Connect a repository',
  'Retrieve authorised evidence',
  'Map to a client project',
  'Apply contract scope rules',
  'Match approved records',
  'Review exceptions',
  'Reconcile with provenance',
]
export default function HomePage() {
  const [status, setStatus] = useState<ApiStatus>('checking')
  const checkApi = useCallback(() => {
    setStatus('checking')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4500)
    fetch(`${apiBaseUrl}/health/live`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => setStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => window.clearTimeout(timeout))
  }, [])
  useEffect(() => {
    checkApi()
  }, [checkApi])
  return (
    <main className="landing">
      <header className="public-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">V</span>
          <span>
            <strong>VendorProof</strong>
            <small>Verified work. Traceable invoices.</small>
          </span>
        </Link>
        <nav className="landing-nav">
          <a href="#workflow">How it works</a>
          <a href="#swytchcode">Swytchcode</a>
          <a href="#audience">For teams</a>
        </nav>
        <div className="nav-actions">
          <Link className="text-link" href="/login">
            Sign in
          </Link>
          <Link className="button button-dark" href="/register">
            Create workspace ↗
          </Link>
        </div>
      </header>
      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Work-to-invoice reconciliation for technical teams</p>
          <h1>
            Verified work.
            <br />
            <em>Traceable invoices.</em>
          </h1>
          <p className="lede">
            Turn engineering delivery evidence into a billing record you can actually explain —
            without turning commits into invented hours.
          </p>
          <div className="hero-actions">
            <Link className="button button-accent" href="/demo">
              Run Free Demo ↗
            </Link>
            <Link className="button button-light" href="/register">
              Create workspace
            </Link>
          </div>
          <div className="status-row">
            <span className={`status-dot status-${status}`} /> API{' '}
            {status === 'checking' ? 'checking…' : status}
            <button onClick={checkApi}>Retry</button>
            <span className="status-note">The demo works even when the API is offline.</span>
          </div>
        </div>
        <div className="hero-product">
          <div className="product-window">
            <div className="window-bar">
              <span />
              <span />
              <span />
              <small>atlas-platform / overview</small>
            </div>
            <div className="window-content">
              <div className="mini-kicker">Northstar Studio · live workspace</div>
              <div className="mini-title">Evidence with a human in the loop.</div>
              <div className="mini-metrics">
                <div>
                  <small>Evidence items</small>
                  <strong>18</strong>
                </div>
                <div>
                  <small>Needs review</small>
                  <strong className="lime">03</strong>
                </div>
                <div>
                  <small>Approved records</small>
                  <strong>07</strong>
                </div>
              </div>
              <div className="mini-lines">
                <i style={{ width: '82%' }} />
                <i style={{ width: '65%' }} />
                <i style={{ width: '91%' }} />
                <i style={{ width: '48%' }} />
              </div>
            </div>
          </div>
          <div className="hero-orbit">V</div>
        </div>
      </section>
      <section className="story-section story-dark">
        <div className="section-intro">
          <p className="eyebrow">01 / The gap</p>
          <h2>
            Work happened.
            <br />
            <span>Now make it legible.</span>
          </h2>
        </div>
        <div className="fragment-grid">
          <div>
            <span>01</span>
            <strong>Repository activity</strong>
            <p>Commits, pull requests, and delivery context.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Manual records</strong>
            <p>Human-entered time and explicit milestones.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Client commitments</strong>
            <p>Contracts, scope rules, and project context.</p>
          </div>
          <div className="fragment-result">
            <span>→</span>
            <strong>Traceable reconciliation</strong>
            <p>Evidence stays evidence. Approvals stay human.</p>
          </div>
        </div>
      </section>
      <section id="workflow" className="story-section workflow-section">
        <div className="section-intro">
          <p className="eyebrow">02 / The workflow</p>
          <h2>
            Seven steps.
            <br />
            <em>One defensible record.</em>
          </h2>
          <p>
            VendorProof keeps the technical signal and the billing decision distinct, then connects
            them with provenance.
          </p>
        </div>
        <div className="workflow-list">
          {workflow.map((item, index) => (
            <div className="workflow-row" key={item}>
              <span>0{index + 1}</span>
              <strong>{item}</strong>
              <small>
                {index < 3 ? 'Evidence layer' : index < 5 ? 'Business rules' : 'Human control'}
              </small>
              <i>↗</i>
            </div>
          ))}
        </div>
      </section>
      <section className="story-section comparison-section">
        <div>
          <p className="eyebrow">03 / The principle</p>
          <h2>
            Evidence is
            <br />
            <em>not hours.</em>
          </h2>
          <p className="section-copy">
            A merged pull request can show delivery activity. It cannot prove how long a person
            worked. VendorProof never invents billable time from engineering activity.
          </p>
        </div>
        <div className="comparison-card">
          <div className="comparison-head">
            <span>GitHub activity</span>
            <span>Approved work record</span>
          </div>
          <div className="comparison-columns">
            <div>
              <p>10:14</p>
              <p>11:02</p>
              <p>13:45</p>
              <p>16:18</p>
            </div>
            <div>
              <strong>03h 30m</strong>
              <small>
                Human-entered
                <br />
                Reviewed by Jordan Lee
              </small>
            </div>
          </div>
          <div className="comparison-foot">Separate signals. Connected context.</div>
        </div>
      </section>
      <section id="swytchcode" className="story-section swytch-section">
        <div className="section-intro">
          <p className="eyebrow">04 / Built with Swytchcode</p>
          <h2>
            Server-side
            <br />
            <em>integration execution.</em>
          </h2>
          <p>
            VendorProof uses Swytchcode as its intended server-side integration execution layer
            while keeping authentication, business rules, and reconciliation inside the application.
          </p>
        </div>
        <div className="architecture">
          <div>
            VendorProof
            <br />
            <small>browser</small>
          </div>
          <b>↓</b>
          <div>
            Fastify API
            <br />
            <small>workspace identity</small>
          </div>
          <b>→</b>
          <div>
            Swytchcode Runtime
            <br />
            <small>tenant context</small>
          </div>
          <b>→</b>
          <div>
            Authorised GitHub
            <br />
            <small>read evidence</small>
          </div>
        </div>
        <p className="disclosure">
          Swytchcode-powered integration architecture · live provider consent required for actual
          GitHub retrieval.
        </p>
      </section>
      <section id="audience" className="story-section audience-section">
        <div className="section-intro">
          <p className="eyebrow">05 / Who it is for</p>
          <h2>
            For people who
            <br />
            <em>ship for clients.</em>
          </h2>
        </div>
        <div className="audience-grid">
          {[
            'Independent developers',
            'Technical freelancers',
            'Small software agencies',
            'Consultants & service firms',
          ].map((item, i) => (
            <article key={item}>
              <span>0{i + 1}</span>
              <h3>{item}</h3>
              <p>
                Fewer disconnected records, clearer project-to-work evidence, and human-controlled
                financial decisions.
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="final-entry">
        <p className="eyebrow">Your next clear step</p>
        <h2>
          Start with the
          <br />
          <em>proof, not the promise.</em>
        </h2>
        <div className="hero-actions">
          <Link className="button button-accent" href="/demo">
            Run Free Demo ↗
          </Link>
          <Link className="button button-light" href="/register">
            Create workspace
          </Link>
          <Link className="button button-ghost inverse" href="/login">
            Sign in
          </Link>
        </div>
        <footer>
          <span>VendorProof · Verified work. Traceable invoices.</span>
          <a href="https://github.com/hitakshijoshi20072911/scppi" target="_blank" rel="noreferrer">
            View source on GitHub ↗
          </a>
        </footer>
      </section>
    </main>
  )
}
