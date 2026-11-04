import pino from 'pino'
import { config } from './config.js'

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-api-key',
      'res.headers.set-cookie',
      '*.token',
      '*.secret',
      '*.key',
      '*.password',
    ],
    remove: true,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
})

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context)
}
