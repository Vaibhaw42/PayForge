import { env } from '@payforge/config'
import pino, { type Logger, type LoggerOptions } from 'pino'
import { REDACT_PATHS } from './redact.js'

/**
 * Base Pino options shared by every logger instance.
 * Overridable in create() for tests or per-app tuning.
 */
function baseOptions(): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    base: {
      service: env.SERVICE_NAME,
      version: env.SERVICE_VERSION,
      env: env.NODE_ENV,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
      remove: false,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // Emit level as string ('info') rather than the numeric default (30).
      level(label) {
        return { level: label }
      },
    },
    // In prod: raw JSON to stdout. In dev: pino-pretty for humans.
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,service,version,env',
              singleLine: false,
            },
          }
        : undefined,
  }
}

/**
 * Create a fresh root logger. Prefer the exported `logger` singleton
 * for most callers; use create() only when you need custom options
 * (e.g., test harnesses redirecting to a memory stream).
 */
export function createLogger(overrides?: Partial<LoggerOptions>): Logger {
  return pino({ ...baseOptions(), ...overrides })
}

export const logger: Logger = createLogger()

/**
 * Build a request-scoped child logger. Callers pass the incoming request-id
 * (or generate one if absent) and receive a logger whose every line carries
 * `correlation_id` for cross-service tracing.
 */
export function childWithCorrelationId(correlationId: string): Logger {
  return logger.child({ correlation_id: correlationId })
}
