import type { NextConfig } from 'next'

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
const apiOrigin = configuredApiBaseUrl ? new URL(configuredApiBaseUrl).origin : undefined

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return apiOrigin ? [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] : []
  },
}

export default nextConfig
