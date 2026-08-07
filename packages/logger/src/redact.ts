/**
 * Fields + header paths Pino must redact from every log line.
 * Add liberally — false positives are cheap; a leaked secret is not.
 *
 * Pino redact rules:
 *   'password'      matches only { password: ... }         (top-level)
 *   '*.password'    matches only { X.password: ... }       (nested one level)
 *   '*.*.password'  matches only two-levels-nested
 * Since our loggers accept arbitrary shapes, we list BOTH top-level and
 * one-level-nested for each sensitive field.
 */
const SENSITIVE_KEYS = [
  // Card data — never accepted per ADR-0001, defensive
  'pan',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'cvv2',
  'cid',
  // Auth secrets
  'password',
  'passwordHash',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'jwt',
  'api_key',
  'apiKey',
  'secret',
  'secret_key',
  'secretKey',
  'webhook_secret',
  'webhookSecret',
]

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-webhook-secret',
  'x-payforge-signature',
  'stripe-signature',
]

export const REDACT_PATHS: string[] = [
  // Top-level keys
  ...SENSITIVE_KEYS,
  // One level nested (typical: err.token, body.password, res.token)
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  // Headers — top level + nested (typical: req.headers.authorization)
  ...SENSITIVE_HEADERS.map((h) => `headers["${h}"]`),
  ...SENSITIVE_HEADERS.map((h) => `*.headers["${h}"]`),
]
