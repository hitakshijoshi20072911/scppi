/**
 * API server entry point
 */

import Fastify from 'fastify';
import { config } from '../platform/config.js';
import { logger } from '../platform/logger.js';
import { healthRoutes } from './routes/health.js';

/**
 * Create and configure the Fastify server
 */
export async function createServer() {
  const server = Fastify({
    logger: false, // We use our own logger
    trustProxy: true,
  });

  // Register health routes
  await server.register(healthRoutes);

  // Global error handler
  server.setErrorHandler((error: unknown, _request, reply) => {
    logger.error({ error, url: _request.url }, 'Request failed');

    const statusCode = (error as any).statusCode || 500;
    const response = {
      code: (error as any).code || 'INTERNAL_ERROR',
      message: (error as any).message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: (error as any).stack }),
    };

    reply.status(statusCode).send(response);
  });

  // 404 handler
  server.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  return server;
}

/**
 * Start the API server
 */
export async function startServer() {
  const server = await createServer();

  const address = await server.listen({
    host: config.HOST,
    port: parseInt(config.PORT, 10),
  });

  logger.info(`API server listening on ${address}`);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down API server...');
    await server.close();
    logger.info('API server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logger.error({ error }, 'Failed to start API server');
    process.exit(1);
  });
}
