/**
 * Main entry point (for unified startup)
 */

import { startServer } from './api/index.js'
import { logger } from './platform/logger.js'

/**
 * Main entry point
 * Determines whether to start API or worker based on environment
 */
async function main() {
  const mode = process.env.PROCESS_MODE || 'api'

  if (mode === 'worker') {
    // Worker is started separately in production
    logger.info('Starting in worker mode...')
    const { startWorker } = await import('./worker/index.js')
    await startWorker()
  } else {
    logger.info('Starting in API mode...')
    await startServer()
  }
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start application')
  process.exit(1)
})
