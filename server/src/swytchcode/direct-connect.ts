// Resolves the Swytchcode hosted auth page URL to the final provider
// authorize URL, bypassing the buggy widget page (its React StrictMode
// double-mount consumes the single-use state token twice and always shows
// "This link was already used"). The exchange mirrors exactly what the
// hosted page does: state_token -> widget session -> DataIntegrations
// authorize -> provider redirect URL.

const SESSION_ENDPOINT = 'https://api-v2.swytchcode.com/v3/cli/connected-accounts/session'
const WIDGET_BASE = 'https://auth.swytchcode.com'

function unwrap(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.data && typeof obj.data === 'object') return obj.data as Record<string, unknown>
    return obj
  }
  return undefined
}

export async function resolveDirectAuthUrl(
  widgetUrl: string,
  providerSlug: string,
): Promise<string | undefined> {
  try {
    const state = new URL(widgetUrl).searchParams.get('state')
    if (!state) return undefined
    const sessionRes = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state_token: state }),
      signal: AbortSignal.timeout(15000),
    })
    if (!sessionRes.ok) return undefined
    const session = (await sessionRes.json()) as Record<string, unknown>
    const token = typeof session.token === 'string' ? session.token : undefined
    if (!token) return undefined
    const headers = { authorization: `Bearer ${token}` }
    const mineRes = await fetch(`${WIDGET_BASE}/_widgets/DataIntegrations/mine`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
    if (!mineRes.ok) return undefined
    const mineBody = unwrap(await mineRes.json())
    const integrations = Array.isArray(mineBody?.data) ? mineBody.data : []
    const match = integrations.find((item) => {
      const slug = String((item as Record<string, unknown>).slug ?? '')
      return slug.toLowerCase() === providerSlug.toLowerCase()
    }) as Record<string, unknown> | undefined
    const slug = String(match?.slug ?? providerSlug)
    const authRes = await fetch(`${WIDGET_BASE}/_widgets/DataIntegrations/${slug}/authorize`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!authRes.ok) return undefined
    const authBody = unwrap(await authRes.json())
    const url = authBody?.url
    return typeof url === 'string' && url.startsWith('https://') ? url : undefined
  } catch {
    return undefined
  }
}
