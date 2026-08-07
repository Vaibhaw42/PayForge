import { z } from 'zod'

/** Response shape of GET /health. */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  env: z.string(),
  uptime_seconds: z.number(),
  deps: z.object({
    postgres: z.boolean(),
    redis: z.boolean(),
    kafka: z.boolean(),
  }),
  timestamp: z.string(),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>
