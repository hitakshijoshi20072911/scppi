'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import { portalApi } from '@/lib/api'

function AcceptInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading } = useAuth()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token || state !== 'idle') return
    if (loading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/portal/accept?token=${token}`)}`)
      return
    }
    setState('working')
    portalApi
      .acceptInvitation(token)
      .then(() => {
        setState('done')
        setMessage('Invitation accepted. Opening your client portal…')
        setTimeout(() => router.replace('/portal'), 1200)
      })
      .catch((cause) => {
        setState('error')
        setMessage(cause instanceof Error ? cause.message : 'Invitation could not be accepted.')
      })
  }, [params, loading, user, state, router])

  return (
    <main className="portal-shell">
      <section className="panel panel-large portal-card">
        <p className="eyebrow">Client portal</p>
        <h1>
          {state === 'done'
            ? 'Welcome aboard'
            : state === 'error'
              ? 'Invitation failed'
              : 'Accepting invitation…'}
        </h1>
        <p className="panel-copy">{message || 'Please wait while we verify your invitation.'}</p>
        {state === 'error' && (
          <button className="button button-dark" onClick={() => router.replace('/portal')}>
            Go to portal
          </button>
        )}
      </section>
    </main>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInner />
    </Suspense>
  )
}
