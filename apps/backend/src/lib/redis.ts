import { env } from '@payforge/config'
import { logger } from '@payforge/logger'
import { Redis } from 'ioredis'

/**
 * Singleton Redis client. Lazy-connects on first command.
 * Backend uses this for cache + rate limiting (Phase 2+).
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
})

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'redis.error')
})
redis.on('connect', () => {
  logger.info('redis.connected')
})

/** Health probe. Returns true iff PING → PONG within timeout. */
export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  const ping = redis
    .ping()
    .then((r) => r === 'PONG')
    .catch(() => false)
  return Promise.race([ping, timeout])
}
