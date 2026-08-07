import { env } from '@payforge/config'
import { prisma } from '@payforge/database'
import { logger } from '@payforge/logger'
import { disconnectKafka } from './lib/kafka.js'
import { redis } from './lib/redis.js'
import { buildServer } from './server.js'

async function main(): Promise<void> {
  const app = await buildServer()

  const address = await app.listen({ host: '0.0.0.0', port: env.PORT })
  logger.info({ address, env: env.NODE_ENV, port: env.PORT }, 'server.started')

  // Graceful shutdown on SIGTERM / SIGINT.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'server.shutdown.begin')
    try {
      await app.close()
      await disconnectKafka()
      await redis.quit().catch(() => undefined)
      await prisma.$disconnect().catch(() => undefined)
      logger.info('server.shutdown.done')
      process.exit(0)
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'server.shutdown.error')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaughtException')
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason: String(reason) }, 'unhandledRejection')
    process.exit(1)
  })
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'boot.failed')
  process.exit(1)
})
