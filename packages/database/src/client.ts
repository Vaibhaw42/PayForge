import { env } from '@payforge/config'
import { PrismaClient } from '../prisma/generated/client/index.js'

/**
 * Singleton Prisma client. Import from `@payforge/database`, never construct
 * your own — otherwise you'll leak connection-pool slots.
 *
 * Note: log config uses Prisma's built-in event log — we bridge to Pino in
 * apps/backend where the request-scoped logger is available.
 */
export const prisma = new PrismaClient({
  datasources: {
    db: { url: env.DATABASE_URL },
  },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

/**
 * Async connectivity probe for `/health`. Returns true iff a trivial round-trip
 * to Postgres succeeds within the timeout.
 */
export async function pingDatabase(timeoutMs = 2000): Promise<boolean> {
  const timeout = new Promise<false>((resolve) =>
    setTimeout(() => resolve(false), timeoutMs),
  )
  const ping = prisma
    .$queryRaw`SELECT 1`.then(() => true as const)
    .catch(() => false as const)
  return Promise.race([ping, timeout])
}
