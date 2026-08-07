import { env } from '@payforge/config'
import { pingDatabase } from '@payforge/database'
import { HealthResponseSchema, type HealthResponse } from '@payforge/shared'
import type { FastifyPluginAsync } from 'fastify'
import { pingKafka } from '../lib/kafka.js'
import { pingRedis } from '../lib/redis.js'

const startedAt = Date.now()

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
        },
      },
    },
    async (_req, reply) => {
      const [postgres, redis, kafka] = await Promise.all([
        pingDatabase(),
        pingRedis(),
        pingKafka(),
      ])

      const allUp = postgres && redis && kafka
      const anyUp = postgres || redis || kafka

      const body: HealthResponse = {
        status: allUp ? 'ok' : anyUp ? 'degraded' : 'down',
        service: env.SERVICE_NAME,
        version: env.SERVICE_VERSION,
        env: env.NODE_ENV,
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
        deps: { postgres, redis, kafka },
        timestamp: new Date().toISOString(),
      }

      reply.status(allUp ? 200 : 503).send(body)
    },
  )
}

export default healthRoutes
