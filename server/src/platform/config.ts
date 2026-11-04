import { z } from 'zod'

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  API_CORS_ORIGIN: z
    .string()
    .url()
    .transform((value) => value.replace(/\/$/, ''))
    .default('http://localhost:3001'),
  DATABASE_URL: z.string().url().optional(),
  SWYTCHCODE_TOKEN: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type Config = z.infer<typeof configSchema>

function loadConfig(): Config {
  return configSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    API_CORS_ORIGIN: process.env.API_CORS_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    SWYTCHCODE_TOKEN: process.env.SWYTCHCODE_TOKEN,
    LOG_LEVEL: process.env.LOG_LEVEL,
  })
}

export const config = loadConfig()
