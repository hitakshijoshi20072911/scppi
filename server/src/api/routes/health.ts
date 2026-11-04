import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { checkDatabase } from '../../db/client.js'
import { config } from '../../platform/config.js'

type DatabaseStatus = 'ready' | 'not_configured' | 'unavailable'

export function isDatabaseReady(database: DatabaseStatus, nodeEnv: string) {
  if (database === 'ready') return true
  return database === 'not_configured' && nodeEnv !== 'production'
}

export async function healthLiveHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() })
}

export async function healthReadyHandler(_request: FastifyRequest, reply: FastifyReply) {
  const database = await checkDatabase()
  const checks = { database }
  const ready = isDatabaseReady(database, config.NODE_ENV)

  return reply.status(ready ? 200 : 503).send({
    status: ready ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  })
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health/live', healthLiveHandler)
  fastify.get('/health/ready', healthReadyHandler)
  fastify.get('/healthz', healthLiveHandler)
  fastify.get('/readyz', healthReadyHandler)
}
