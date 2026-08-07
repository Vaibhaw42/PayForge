import { env } from '@payforge/config'
import { logger } from '@payforge/logger'
import { Kafka, type Admin } from 'kafkajs'

/**
 * Kafka client + lazy admin. Real producers/consumers live per-domain in later
 * phases (Phase 5+ ledger events, Phase 7 webhook engine).
 */
export const kafka = new Kafka({
  clientId: env.SERVICE_NAME,
  brokers: env.KAFKA_BROKERS.split(',').map((s) => s.trim()).filter(Boolean),
  logCreator:
    () =>
    ({ log }) => {
      logger.debug({ kafka: log }, 'kafka.internal')
    },
})

let admin: Admin | null = null
let adminConnected = false

async function getAdmin(): Promise<Admin> {
  if (!admin) admin = kafka.admin()
  if (!adminConnected) {
    await admin.connect()
    adminConnected = true
  }
  return admin
}

/** Health probe. Lists topics via the admin API. */
export async function pingKafka(timeoutMs = 3000): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  const ping = (async () => {
    try {
      const a = await getAdmin()
      await a.listTopics()
      return true
    } catch {
      return false
    }
  })()
  return Promise.race([ping, timeout])
}

export async function disconnectKafka(): Promise<void> {
  if (admin && adminConnected) {
    await admin.disconnect().catch(() => undefined)
    adminConnected = false
  }
}
