/**
 * Structured logging with safe redaction
 */

import pino from 'pino';

// Redaction patterns for secrets
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.token',
  '*.secret',
  '*.key',
  '*.password',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactPaths,
    remove: true,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // In development, use pretty print
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
