import { logger } from '@payforge/logger'
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from '@fastify/type-provider-zod'
import fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import errorHandler from './plugins/error-handler.js'
import requestId from './plugins/request-id.js'
import healthRoutes from './routes/health.js'

/**
 * Build (but don't start) the Fastify instance.
 * Split from listen() so tests can call inject() against the same instance.
 *
 * Note: pino's Logger satisfies most of FastifyBaseLogger except the runtime-
 * added `msgPrefix` field. Fastify itself never *uses* msgPrefix on the root
 * logger, so the cast is safe. Child loggers created by Fastify get it added.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    genReqId: () => '', // request-id plugin overwrites — leave empty here
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(requestId)
  await app.register(errorHandler)
  await app.register(healthRoutes)

  return app
}
