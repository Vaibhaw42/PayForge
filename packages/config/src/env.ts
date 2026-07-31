import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

// Load .env into process.env exactly once. Subsequent imports get cached values.
loadDotenv()

/**
 * Environment schema — the only source of truth for config shape.
 * Every app + package uses this. Missing or invalid vars → hard fail at boot.
 */
const EnvSchema = z.object({
  // Runtime mode
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Backend HTTP server
  PORT: z.coerce.number().int().positive().default(3000),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // Postgres (per ADR-0005)
  DATABASE_URL: z
    .string()
    .url()
    .describe('Postgres connection URL, e.g. postgres://user:pass@host:5432/db'),

  // Redis (per ADR-0005)
  REDIS_URL: z.string().url().describe('Redis connection URL, e.g. redis://host:6379'),

  // Kafka (per ADR-0005 + ADR-0010)
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .describe('Comma-separated Kafka broker list, e.g. localhost:9092'),

  // Application identity (for logs, traces, metrics)
  SERVICE_NAME: z.string().default('payforge-backend'),
  SERVICE_VERSION: z.string().default('0.0.0'),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

/**
 * Parse process.env against the schema. Throws with a readable message if invalid.
 * Cached on first call — subsequent calls return the same frozen object.
 */
export function loadEnv(): Env {
  if (cached) return cached

  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment variables:\n${issues}\n\nCheck .env against .env.example.`,
    )
  }

  cached = Object.freeze(result.data)
  return cached
}

/**
 * Convenience — parses on module load. If you want lazy loading, use `loadEnv()`.
 */
export const env: Env = loadEnv()
