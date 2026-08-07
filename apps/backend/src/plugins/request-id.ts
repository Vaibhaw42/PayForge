import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { randomUUID } from 'node:crypto'

/**
 * Extracts X-Request-Id from incoming header or generates one.
 * The value becomes the Fastify request id (available on req.id) and is
 * echoed on responses so callers can propagate it.
 *
 * Fastify's request logger automatically includes req.id in every log line,
 * giving us correlation-id-per-request for free.
 */
const requestIdPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id']
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID()
    req.id = requestId
    reply.header('x-request-id', requestId)
  })
}

export default fp(requestIdPlugin, { name: 'request-id' })
