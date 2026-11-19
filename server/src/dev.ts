import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch {
  // Explicit environment variables remain supported when no local .env exists.
}

await import('./index.js')
