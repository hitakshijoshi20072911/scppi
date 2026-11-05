'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await login(form)
      router.replace('/app')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in could not be completed.')
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
          <p className="eyebrow">Welcome back</p>
          <h1>Make the work legible.</h1>
          <p>
            See the records, approvals, and evidence that keep your client work on solid ground.
          </p>
        </div>
        <p className="aside-footer">Evidence is not hours.</p>
      </div>
      <section className="auth-card">
        <div className="auth-card-heading">
          <p className="eyebrow">Sign in</p>
          <h2>Return to your workspace.</h2>
          <p>Your session stays in a secure, HttpOnly cookie.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button className="button button-dark button-wide" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'} <span>↗</span>
          </button>
        </form>
        <p className="auth-switch">
          New to VendorProof? <Link href="/register">Create an account</Link>
        </p>
      </section>
    </main>
  )
}
