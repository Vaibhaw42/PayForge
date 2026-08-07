import { AppError } from '@payforge/shared'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'

/**
 * Central error handler.
 * - AppError → stable JSON per shared error contract.
 * - ZodError → 400 invalid_request_error with first param path.
 * - Everything else → 500 api_error, message hidden in production.
 * Every response includes x-request-id (already set by request-id plugin).
 */
const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id

    if (err instanceof AppError) {
      req.log.warn({ err: { code: err.code, type: err.type } }, 'app.error')
      reply.status(err.httpStatus).send(err.toResponse(requestId))
      return
    }

    if (err instanceof ZodError) {
      const first = err.issues[0]
      req.log.warn({ issues: err.issues }, 'validation.error')
      reply.status(400).send({
        error: {
          type: 'invalid_request_error',
          code: 'validation_failed',
          message: first?.message ?? 'validation failed',
          ...(first?.path.length ? { param: first.path.join('.') } : {}),
          request_id: requestId,
        },
      })
      return
    }

    // Unknown error — narrow safely and never leak message in prod.
    const errMessage = err instanceof Error ? err.message : String(err)
    const errStack = err instanceof Error ? err.stack : undefined
    req.log.error({ err: errMessage, stack: errStack }, 'unhandled.error')
    const message =
      process.env['NODE_ENV'] === 'production' ? 'Internal server error' : errMessage
    reply.status(500).send({
      error: {
        type: 'api_error',
        code: 'internal_error',
        message,
        request_id: requestId,
      },
    })
  })
}

export default fp(errorHandlerPlugin, { name: 'error-handler' })
