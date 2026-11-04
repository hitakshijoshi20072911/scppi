import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyError } from 'fastify'
import { randomUUID } from 'node:crypto'
import { config } from '../platform/config.js'
import { closeDatabase } from '../db/client.js'
import { logger } from '../platform/logger.js'
import { healthRoutes } from './routes/health.js'

export async function createServer() {
  const server = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 256 * 1024,
    genReqId: (request) => request.headers['x-request-id']?.toString() || randomUUID(),
  })

  await server.register(helmet, { global: true })
  await server.register(cors, { origin: config.API_CORS_ORIGIN, credentials: true })
  await server.register(healthRoutes)

  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  server.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
    logger.error({ err: error, requestId: request.id, url: request.url }, 'Request failed')
    reply.status(statusCode).send({
      code: statusCode === 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_ERROR',
      message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      requestId: request.id,
    })
  })

  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ code: 'NOT_FOUND', message: 'Route not found', requestId: request.id })
  })

  return server
}

export async function startServer() {
  const server = await createServer()
  const address = await server.listen({ host: config.HOST, port: config.PORT })
  logger.info({ address }, 'API server listening')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down API server')
    await server.close()
    await closeDatabase()
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logger.fatal({ err: error }, 'Failed to start API server')
    process.exit(1)
  })
}
