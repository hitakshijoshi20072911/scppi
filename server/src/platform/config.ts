/**
 * Configuration validation and environment variables
 */

import { z } from 'zod';

const configSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Database (placeholder - not used in initial scaffold)
  DATABASE_URL: z.string().optional(),

  // Swytchcode (placeholder - not used in initial scaffold)
  SWYTCHCODE_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    DATABASE_URL: process.env.DATABASE_URL,
    SWYTCHCODE_TOKEN: process.env.SWTCHCODE_TOKEN,
  };

  return configSchema.parse(rawConfig);
}

export const config = loadConfig();
