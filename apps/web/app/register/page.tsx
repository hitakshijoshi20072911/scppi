'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { VendorProofApiError } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await register({ ...form, workspaceName: form.workspaceName || undefined })
      router.replace('/app')
    } catch (cause) {
      setError(
        cause instanceof VendorProofApiError && cause.code === 'DUPLICATE_EMAIL'
          ? 'An account with this email already exists. Sign in instead.'
          : cause instanceof Error
            ? cause.message
            : 'Registration could not be completed.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-aside">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">V</span>
          <span>
            <strong>VendorProof</strong>
            <small>Traceable work, clearly billed.</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">The clean start</p>
          <h1>Give your work a place to land.</h1>
          <p>
            One account, one workspace, and a clearer line from engineering activity to approved
            records.
          </p>
        </div>
        <p className="aside-footer">Verified work. Traceable invoices.</p>
      </div>
      <section className="auth-card">
        <div className="auth-card-heading">
          <p className="eyebrow">Create workspace</p>
          <h2>Set up your account.</h2>
          <p>Your workspace and owner membership are created together.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            Full name
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              maxLength={320}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
            />
          </label>
          <label>
            Workspace name <span className="optional">optional</span>
            <input
              minLength={2}
              maxLength={160}
              value={form.workspaceName}
              onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
              placeholder="Your studio or practice"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
            <small>At least 12 characters, including a letter and a number.</small>
          </label>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button className="button button-dark button-wide" disabled={pending}>
            {pending ? 'Creating workspace…' : 'Create workspace'} <span>↗</span>
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
