/**
 * Health and readiness endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../platform/logger.js';

/**
 * Health check - liveness probe
 * Returns 200 if the server process is running
 */
export async function healthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.status(200).send({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Readiness check - readiness probe
 * Returns 200 if all dependencies are ready
 * Returns 503 if any dependency is not ready
 */
export async function readinessHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const checks = {
    database: 'not_configured', // Will be updated when database is added
    swytchcode: 'not_configured', // Will be updated when Swytchcode is integrated
  };

  const allReady = Object.values(checks).every(
    (status) => status === 'ready'
  );

  if (allReady) {
    return reply.status(200).send({
      status: 'ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  }

  return reply.status(503).send({
    status: 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Register health and readiness routes
 */
export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/healthz', healthHandler);
  fastify.get('/readyz', readinessHandler);

  logger.info('Health routes registered');
}
