'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, type Session, type User, type Workspace, VendorProofApiError } from '@/lib/api'

type AuthContextValue = {
  loading: boolean
  user: User | null
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  setActiveWorkspaceId: (id: string) => void
  refresh: () => Promise<Session | null>
  register: (input: {
    email: string
    name: string
    password: string
    workspaceName?: string
  }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)
const workspaceKey = 'vendorproof.activeWorkspace'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applySession = (session: Session) => {
    setUser(session.user)
    setWorkspaces(session.workspaces)
    const stored = window.localStorage.getItem(workspaceKey)
    const next =
      session.workspaces.find((workspace) => workspace.id === stored)?.id ??
      session.workspaces[0]?.id ??
      null
    setActiveWorkspaceIdState(next)
  }

  const refresh = async () => {
    try {
      const session = await authApi.me()
      applySession(session)
      setError(null)
      return session
    } catch (cause) {
      if (cause instanceof VendorProofApiError && cause.status === 401) {
        setUser(null)
        setWorkspaces([])
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to load your session.')
      }
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setWorkspaces([])
      setActiveWorkspaceIdState(null)
      setError('Your session expired. Sign in again to continue.')
    }
    window.addEventListener('vendorproof:session-expired', onExpired)
    return () => window.removeEventListener('vendorproof:session-expired', onExpired)
  }, [])

  const setActiveWorkspaceId = (id: string) => {
    if (!workspaces.some((workspace) => workspace.id === id)) return
    window.localStorage.setItem(workspaceKey, id)
    setActiveWorkspaceIdState(id)
  }

  const register = async (input: {
    email: string
    name: string
    password: string
    workspaceName?: string
  }) => {
    setError(null)
    const result = await authApi.register(input)
    setUser(result.user)
    setWorkspaces([{ ...result.workspace, role: 'owner' }])
    window.localStorage.setItem(workspaceKey, result.workspace.id)
    setActiveWorkspaceIdState(result.workspace.id)
  }

  const login = async (input: { email: string; password: string }) => {
    setError(null)
    await authApi.login(input)
    await refresh()
  }

  const logout = async () => {
    await authApi.logout().catch(() => undefined)
    setUser(null)
    setWorkspaces([])
    setActiveWorkspaceIdState(null)
    window.localStorage.removeItem(workspaceKey)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user,
      workspaces,
      activeWorkspace: workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
      setActiveWorkspaceId,
      refresh,
      register,
      login,
      logout,
      error,
    }),
    [loading, user, workspaces, activeWorkspaceId, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
