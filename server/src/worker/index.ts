/**
 * Worker entry point (placeholder for future pg-boss integration)
 */

import { logger } from '../platform/logger.js'

/**
 * Start the worker
 */
export async function startWorker() {
  logger.info('Worker starting...')

  // Placeholder: pg-boss will be integrated here in a future milestone
  logger.info('Worker started (no jobs configured yet)')

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...')
    logger.info('Worker shut down')
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Keep process alive
  await new Promise(() => {})
}

// Start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((error) => {
    logger.error({ error }, 'Failed to start worker')
    process.exit(1)
  })
}
