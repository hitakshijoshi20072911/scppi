'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { demoPullRequests, demoRecords, demoSteps } from '@/lib/demo-data'

export default function DemoPage() {
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const current = step >= 0 ? demoSteps[step] : null
  useEffect(() => {
    if (!running) return
    if (step >= demoSteps.length - 1) {
      setRunning(false)
      return
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), 1200)
    return () => window.clearTimeout(timer)
  }, [running, step])
  const progress = useMemo(() => (step < 0 ? 0 : ((step + 1) / demoSteps.length) * 100), [step])
  function start() {
    setStep(0)
    setRunning(true)
  }
  function reset() {
    setStep(-1)
    setRunning(false)
    setExpanded(false)
  }
  return (
    <main className="demo-page">
      <header className="demo-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">V</span>
          <span>
            <strong>VendorProof</strong>
            <small>Interactive simulation</small>
          </span>
        </Link>
        <Link className="text-link" href="/register">
          Create a workspace ↗
        </Link>
      </header>
      <section className="demo-intro">
        <p className="eyebrow">Run Free Demo / fictional workspace</p>
        <h1>
          See the proof chain
          <br />
          <em>before you sign in.</em>
        </h1>
        <p className="lede">
          Walk a fictional Atlas Platform project from GitHub-shaped evidence to a human-reviewed
          reconciliation result.
        </p>
        <div className="demo-disclosure">
          Interactive simulation — fictional sample data. No live GitHub connection, database write,
          or financial operation is performed.
        </div>
      </section>
      <section className="demo-console" aria-label="Interactive demo">
        <div className="demo-console-head">
          <div>
            <span className="eyebrow">Northstar Studio / Atlas Platform</span>
            <h2>{current?.title ?? 'Ready when you are.'}</h2>
          </div>
          <div className="demo-controls">
            <button
              className="button button-accent"
              onClick={running ? () => setRunning(false) : start}
            >
              {running
                ? 'Pause'
                : step >= 0
                  ? step === demoSteps.length - 1
                    ? 'Replay'
                    : 'Resume'
                  : 'Start simulation'}{' '}
              <span>↗</span>
            </button>
            <button className="button button-ghost" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="demo-grid">
          <nav className="demo-steps" aria-label="Demo steps">
            {demoSteps.map((item, index) => (
              <button
                key={item.title}
                className={
                  index === step
                    ? 'demo-step active'
                    : index < step
                      ? 'demo-step done'
                      : 'demo-step'
                }
                onClick={() => {
                  setStep(index)
                  setRunning(false)
                }}
              >
                <span>0{index + 1}</span>
                <strong>{item.title}</strong>
                <small>{item.kicker}</small>
              </button>
            ))}
          </nav>
          <div className="demo-stage">
            {current ? (
              <>
                <div className="stage-card">
                  <span className="stage-pulse" />
                  <p className="eyebrow">{current.kicker}</p>
                  <h3>{current.detail}</h3>
                  <strong className="stage-metric">{current.metric}</strong>
                </div>
                {step === 1 && (
                  <div className="sample-list">
                    {demoPullRequests.map((pr) => (
                      <article key={pr.title}>
                        <span className={`pill ${pr.state}`}>{pr.state}</span>
                        <div>
                          <strong>{pr.title}</strong>
                          <small>
                            {pr.author} · {pr.commits} commits · {pr.category}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {step >= 4 && (
                  <div className="sample-list records">
                    {demoRecords.map((record) => (
                      <article key={record.label}>
                        <span className="record-icon">✓</span>
                        <div>
                          <strong>
                            {record.label}
                            <br />
                            {record.value}
                          </strong>
                          <small>{record.note}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {step === demoSteps.length - 1 && (
                  <div className="result-banner">
                    <strong>Illustrative result: traceable, not billable.</strong>
                    <span>VendorProof never converts activity into hours or sends an invoice.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-stage">
                <span className="orbit">V</span>
                <h3>Engineering evidence is not billing evidence.</h3>
                <p>
                  Start the simulation to see how source provenance, scope rules, and human approval
                  stay connected.
                </p>
              </div>
            )}
            <button className="details-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Hide demo notes' : 'View demo notes'} <span>↓</span>
            </button>
            {expanded && (
              <div className="demo-notes">
                <p>
                  Every value in this panel is a deterministic fixture from{' '}
                  <code>apps/web/lib/demo-data.ts</code>. The demo intentionally does not call the
                  API client.
                </p>
                <p>
                  Swytchcode is presented as a simulated backend execution boundary, never as live
                  provider access.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <footer className="demo-footer">
        <div>
          <p className="eyebrow">Ready for your workspace?</p>
          <h2>Bring the real evidence in when you are ready.</h2>
        </div>
        <div className="action-row">
          <Link className="button button-accent" href="/register">
            Create workspace ↗
          </Link>
          <Link className="button button-light" href="/login">
            Sign in
          </Link>
        </div>
      </footer>
    </main>
  )
}
