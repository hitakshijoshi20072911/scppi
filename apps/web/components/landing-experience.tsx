'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { demoPullRequests, demoSteps } from '@/lib/demo-data'

gsap.registerPlugin(ScrollTrigger)
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)
const whyStages = [
  {
    label: 'CAPTURE',
    title: 'Source evidence without inventing time.',
    detail:
      'Pull requests, commits, and provider provenance remain separate from human billing records.',
  },
  {
    label: 'CONTEXT',
    title: 'Connect the right client and project.',
    detail:
      'Workspace-scoped mappings keep a repository from silently drifting into the wrong engagement.',
  },
  {
    label: 'REVIEW',
    title: 'Put ambiguity in front of a person.',
    detail:
      'Scope rules classify deterministically, while uncertain work waits for human approval.',
  },
  {
    label: 'RECONCILE',
    title: 'Leave a record someone can explain.',
    detail: 'Approved entries and accepted milestones stay linked to their supporting evidence.',
  },
]

function BootLoader() {
  const [gone, setGone] = useState(false)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const key = 'vendorproof-boot-seen'
    if (
      sessionStorage.getItem(key) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setGone(true)
      return
    }
    document.documentElement.classList.add('vp-booting')
    const start = performance.now()
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start
      setProgress(Math.min(100, Math.round((elapsed / 1500) * 100)))
      if (elapsed >= 1600) {
        window.clearInterval(timer)
        sessionStorage.setItem(key, '1')
        document.documentElement.classList.remove('vp-booting')
        setGone(true)
      }
    }, 60)
    return () => {
      window.clearInterval(timer)
      document.documentElement.classList.remove('vp-booting')
    }
  }, [])
  if (gone) return null
  const steps = [
    'INITIALIZE WORKSPACE',
    'LOAD EVIDENCE MODEL',
    'VERIFY APPROVAL RULES',
    'ARM RECONCILIATION',
    'START SESSION',
  ]
  return (
    <div className="vp-loader" role="status" aria-label={`Loading ${progress}%`}>
      <strong>{progress}%</strong>
      <ol>
        {steps.map((step, index) => (
          <li className={progress >= (index + 1) * 20 ? 'on' : ''} key={step}>
            <span>00{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

function StatusPill() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const check = useCallback(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4500)
    setStatus('checking')
    fetch(`${apiBaseUrl}/health/live`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => setStatus(response.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => window.clearTimeout(timeout))
  }, [])
  useEffect(() => {
    check()
  }, [check])
  return (
    <div className="vp-status">
      <i className={`vp-dot ${status}`} /> API {status === 'checking' ? 'checking…' : status}
      <button onClick={check}>retry</button>
      <span className="vp-status-note">The demo works even when the API is offline.</span>
    </div>
  )
}

function HeroTimeline() {
  const root = useRef<HTMLElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const snapshots = useMemo(() => demoSteps.slice(0, 4), [])
  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference) and (min-width: 900px)', () => {
        const scene = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: '+=180%',
            pin: true,
            scrub: 1,
            onUpdate: (self) => setActive(Math.min(3, Math.floor(self.progress * 4))),
          },
        })
        scene
          .from('.vp-hero-copy > *', { y: 30, opacity: 0, stagger: 0.08, duration: 0.3 }, 0)
          .from('.vp-node', { opacity: 0, y: 24, stagger: 0.1, duration: 0.2 }, 0)
          .from('.vp-hero-snapshot', { opacity: 0, x: 45, duration: 0.35 }, 0.25)
          .to('.vp-hero-copy', { x: -90, opacity: 0.35, duration: 0.45 }, 0.55)
          .to('.vp-hero-snapshot', { x: -40, scale: 1.06, duration: 0.45 }, 0.55)
        return () => scene.kill()
      })
      gsap.to(marker.current, { y: 10, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut' })
    }, root)
    return () => ctx.revert()
  }, [])
  const current = snapshots[active]
  return (
    <section className="vp-hero" ref={root} id="top">
      <div className="vp-hero-copy">
        <p className="vp-kicker">WORK-TO-INVOICE RECONCILIATION / VENDORPROOF</p>
        <h1>
          Verified work.
          <br />
          <em>Traceable invoices.</em>
        </h1>
        <p className="vp-lead">
          Turn engineering activity into billing evidence you can actually explain — without
          converting commits into invented hours.
        </p>
        <div className="vp-actions">
          <Link className="vp-button lime" href="/demo">
            Run free demo ↗
          </Link>
          <Link className="vp-button outline" href="/register">
            Create workspace
          </Link>
        </div>
        <StatusPill />
      </div>
      <div className="vp-hero-meta">
        TYPE : WORKFLOW SYSTEM
        <br />
        BUILT FOR : TECHNICAL TEAMS
        <br />
        STATUS : REVIEWABLE
        <br />
        MODEL : HUMAN APPROVAL
      </div>
      <div className="vp-hero-graph" aria-label="Evidence workflow timeline">
        {snapshots.map((snapshot, index) => (
          <div
            className={`vp-node ${index <= active ? 'active' : ''} ${index === 2 ? 'warn' : ''}`}
            key={snapshot.title}
          >
            <span>0{index + 1}</span>
            <strong>{snapshot.title}</strong>
            <small>{snapshot.kicker}</small>
          </div>
        ))}
        <div className="vp-graph-line" />
        <div className="vp-graph-marker" ref={marker}>
          ▼
        </div>
      </div>
      <article className="vp-hero-snapshot">
        <div className="vp-card-label">
          SNAPSHOT · STEP {active + 1} · {current.metric}
        </div>
        <pre>{`source   northstar/atlas-platform\nproject  Atlas Platform\nstatus   ${active === 2 ? 'needs_review' : 'verified'}\nresult   ${current.detail}\nhash     ${'a7f3e19c2d0b'.slice(0, 8)}…`}</pre>
        <small>fictional product preview · no live provider call</small>
      </article>
      <div className="vp-scroll-hint">
        SCROLL TO TRACE THE WORKFLOW <span>↓</span>
      </div>
    </section>
  )
}

function ScrollStatement() {
  const root = useRef<HTMLElement>(null)
  const copy =
    'The gap is not a lack of activity. It is the missing line between what was delivered and what a human is willing to approve.'
  useEffect(() => {
    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>('.vp-word')
      gsap.to(words, {
        opacity: 1,
        stagger: 0.08,
        scrollTrigger: { trigger: root.current, start: 'top 72%', end: 'bottom 44%', scrub: true },
      })
    }, root)
    return () => ctx.revert()
  }, [])
  return (
    <section className="vp-statement" ref={root}>
      <span className="vp-section-label">01 / THE GAP</span>
      <p aria-label={copy}>
        {copy.split(' ').map((word) => (
          <span className="vp-word" key={word}>
            {word}&nbsp;
          </span>
        ))}
      </p>
      <Link href="#workflow" className="vp-text-link">
        Learn how the chain works ↓
      </Link>
    </section>
  )
}

function Marquee() {
  const items = [
    'GITHUB EVIDENCE',
    'HUMAN TIME',
    'FIXED MILESTONES',
    'SCOPE RULES',
    'SWYTCHCODE RUNTIME',
    'AUDIT EVENTS',
  ]
  return (
    <div className="vp-marquee" aria-hidden>
      <div>
        {[...items, ...items].map((item, index) => (
          <span key={`${item}-${index}`}>
            {item} <b>✳</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function ProblemScene() {
  const problems = [
    ['DISJOINTED', 'Repository activity', 'Commits show delivery. They do not show approval.'],
    ['MANUAL', 'Time records', 'Hours belong to the person who enters and approves them.'],
    ['UNCLEAR', 'Client commitments', 'Contracts and milestones need the right project context.'],
    ['CONTROLLED', 'VendorProof', 'Evidence, rules, and decisions stay connected.'],
  ]
  return (
    <section className="vp-problems">
      <div className="vp-section-intro">
        <span className="vp-section-label">02 / THE PROBLEM</span>
        <h2>
          Activity is everywhere.
          <br />
          <em>Accountability is not.</em>
        </h2>
      </div>
      <div className="vp-problem-grid">
        {problems.map(([eyebrow, title, text], index) => (
          <article className={index === 3 ? 'result' : ''} key={title}>
            <span>
              {`0${index + 1}`} / {eyebrow}
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function WorkflowScene() {
  const root = useRef<HTMLElement>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference) and (min-width: 900px)', () => {
        const st = ScrollTrigger.create({
          trigger: root.current,
          start: 'top top',
          end: '+=360%',
          pin: true,
          onUpdate: (self) => setStage(Math.min(3, Math.floor(self.progress * 4))),
        })
        return () => st.kill()
      })
    }, root)
    return () => ctx.revert()
  }, [])
  const stageData = whyStages[stage]
  return (
    <section className="vp-workflow-scene" ref={root} id="workflow">
      <div className="vp-section-intro">
        <span className="vp-section-label">03 / PRODUCT INTELLIGENCE</span>
        <h2>
          Keep the proof
          <br />
          <em>close to the decision.</em>
        </h2>
        <p>{stageData.detail}</p>
        <p className="vp-built-with">BUILT WITH SWYTCHCODE · SERVER-SIDE EXECUTION LAYER</p>
        <div className="vp-stage-dots">
          {whyStages.map((_, index) => (
            <i className={index <= stage ? 'on' : ''} key={index} />
          ))}
        </div>
      </div>
      <div className="vp-workflow-art">
        <div className="vp-art-grid" />
        <div className="vp-art-card card-a">
          <span>GITHUB / SOURCE</span>
          <strong>northstar/atlas-platform</strong>
          <small>4 pull requests · 6 commits</small>
        </div>
        <div className="vp-art-card card-b">
          <span>CLASSIFICATION</span>
          <strong>{stageData.label}</strong>
          <small>{stageData.title}</small>
        </div>
        <div className="vp-art-card card-c">
          <span>APPROVAL RECORD</span>
          <strong>03h 30m · APPROVED</strong>
          <small>Reviewer: Jordan Lee</small>
        </div>
        <div className="vp-art-card card-d">
          <span>MILESTONE</span>
          <strong>$1,800 USD · ACCEPTED</strong>
          <small>Explicit fixed-price value</small>
        </div>
        <div className="vp-art-center">
          {String(stage + 1).padStart(2, '0')}
          <small>/ 04</small>
        </div>
        <div className="vp-stage-caption">
          <span>
            0{stage + 1} / 04 · {stageData.label}
          </span>
          <strong>{stageData.title}</strong>
        </div>
      </div>
    </section>
  )
}

function EvidenceCompare() {
  return (
    <section className="vp-compare">
      <div>
        <span className="vp-section-label">04 / THE PRINCIPLE</span>
        <h2>
          Evidence is
          <br />
          <em>not hours.</em>
        </h2>
        <p>
          Pull requests and commits are evidence of engineering activity. They are never a time
          clock. VendorProof only carries human-entered time or explicit milestones into financial
          review.
        </p>
      </div>
      <div className="vp-compare-card">
        <header>
          <span>ACTIVITY TIMELINE</span>
          <span>APPROVED RECORD</span>
        </header>
        <div className="vp-compare-body">
          <div className="vp-activity">
            <i />
            <i />
            <i />
            <i />
            <small>10:14 · 11:02 · 13:45 · 16:18</small>
          </div>
          <div className="vp-approved">
            <strong>03h 30m</strong>
            <span>
              Human-entered
              <br />
              Reviewed by Jordan Lee
            </span>
          </div>
        </div>
        <footer>SEPARATE SIGNALS · CONNECTED CONTEXT</footer>
      </div>
    </section>
  )
}

function SolutionScene() {
  const [selected, setSelected] = useState(0)
  return (
    <section className="vp-solution">
      <div className="vp-section-intro">
        <span className="vp-section-label">05 / LIVE PRODUCT MODEL</span>
        <h2>
          From repository
          <br />
          <em>to review queue.</em>
        </h2>
        <p>
          A consistent fictional workspace preview keeps the source, project, classification, and
          approval record in one readable system.
        </p>
      </div>
      <div className="vp-solution-console">
        <div className="vp-console-top">
          <span>atlas-platform / reconciliation</span>
          <small>SIMULATION PREVIEW</small>
        </div>
        <div className="vp-console-body">
          <nav>
            {demoPullRequests.map((pr, index) => (
              <button
                className={selected === index ? 'selected' : ''}
                onClick={() => setSelected(index)}
                key={pr.title}
              >
                <span>0{index + 1}</span>
                {pr.title}
                <small>{pr.state}</small>
              </button>
            ))}
          </nav>
          <article>
            <div className="vp-console-kicker">PULL REQUEST / {selected + 1} OF 4</div>
            <h3>{demoPullRequests[selected].title}</h3>
            <p>
              Repository <strong>northstar/atlas-platform</strong> · author{' '}
              {demoPullRequests[selected].author}
            </p>
            <div className="vp-console-grid">
              <div>
                <small>classification</small>
                <strong>{demoPullRequests[selected].category}</strong>
              </div>
              <div>
                <small>associated commits</small>
                <strong>{demoPullRequests[selected].commits}</strong>
              </div>
              <div>
                <small>billing state</small>
                <strong>{selected === 2 ? 'needs review' : 'reference only'}</strong>
              </div>
            </div>
            <div className="vp-console-log">
              <span>source provenance</span>
              <code>github.pull_request → project.atlas → review.queue</code>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  const cases = [
    'Independent developers',
    'Technical freelancers',
    'Small software agencies',
    'Engineering service firms',
    'Consultants',
    'Small client-billing teams',
  ]
  return (
    <section className="vp-usecases" id="audience">
      <div className="vp-section-intro">
        <span className="vp-section-label">06 / WHO IT IS FOR</span>
        <h2>
          For people who
          <br />
          <em>ship for clients.</em>
        </h2>
      </div>
      <div className="vp-case-track">
        {cases.map((item, index) => (
          <article key={item}>
            <span>0{index + 1}</span>
            <h3>{item}</h3>
            <p>
              Clearer project-to-work evidence, fewer disconnected records, and human-controlled
              financial decisions.
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function LandingExperience() {
  const root = useRef<HTMLElement>(null)
  const [hideNav, setHideNav] = useState(false)
  useEffect(() => {
    const ctx = gsap.context(() => {
      const navTrigger = ScrollTrigger.create({
        start: 120,
        end: 'max',
        onUpdate: (self) => setHideNav(self.direction === 1 && self.scroll() > 240),
      })
      gsap.to('.vp-case-track', {
        x: () =>
          -(
            Math.max(
              0,
              (document.querySelector('.vp-case-track') as HTMLElement)?.scrollWidth ?? 0,
            ) -
            window.innerWidth +
            100
          ),
        ease: 'none',
        scrollTrigger: {
          trigger: '.vp-usecases',
          start: 'top top',
          end: '+=260%',
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
        },
      })
      return () => navTrigger.kill()
    }, root)
    return () => ctx.revert()
  }, [])
  return (
    <main className="vp-site" ref={root}>
      <BootLoader />
      <header className={`vp-nav ${hideNav ? 'hide' : ''}`}>
        <Link href="/" className="vp-brand">
          <span>V</span> VENDORPROOF
        </Link>
        <nav>
          <a href="#workflow">Workflow</a>
          <a href="#audience">For teams</a>
          <a href="https://docs.swytchcode.com" target="_blank" rel="noreferrer">
            Swytchcode ↗
          </a>
        </nav>
        <div>
          <span className="vp-nav-pct">SCROLL SYSTEM</span>
          <Link className="vp-nav-button" href="/app">
            Open workspace ↗
          </Link>
        </div>
      </header>
      <HeroTimeline />
      <ScrollStatement />
      <Marquee />
      <ProblemScene />
      <WorkflowScene />
      <EvidenceCompare />
      <SolutionScene />
      <UseCases />
      <section className="vp-final">
        <span className="vp-section-label">07 / ENTER THE PRODUCT</span>
        <h2>
          Start with the
          <br />
          <em>proof, not the promise.</em>
        </h2>
        <p>
          Run a fictional walkthrough, create a real workspace, or sign in to continue your work.
        </p>
        <div className="vp-actions">
          <Link className="vp-button lime" href="/demo">
            Run free demo ↗
          </Link>
          <Link className="vp-button dark" href="/register">
            Create workspace
          </Link>
          <Link className="vp-button outline light" href="/login">
            Sign in
          </Link>
        </div>
        <footer>
          <span>VENDORPROOF · VERIFIED WORK. TRACEABLE INVOICES.</span>
          <a href="https://github.com/hitakshijoshi20072911/scppi" target="_blank" rel="noreferrer">
            VIEW SOURCE ON GITHUB ↗
          </a>
        </footer>
      </section>
    </main>
  )
}
