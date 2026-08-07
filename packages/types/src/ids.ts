/**
 * Resource id prefixes — Stripe-style, self-identifying.
 * See docs/architecture/phase-0.md §7.3 and reference-architecture-notes.md §2.1.
 */
export const ID_PREFIXES = {
  merchant: 'mer_',
  paymentIntent: 'pi_',
  refund: 're_',
  dispute: 'dp_',
  event: 'evt_',
  mandate: 'mnd_',
  apiKey: 'key_',
  webhookEndpoint: 'we_',
} as const

export type IdKind = keyof typeof ID_PREFIXES
export type Prefix = (typeof ID_PREFIXES)[IdKind]

/** Runtime helper — check whether a string carries a specific prefix. */
export function isIdOf(kind: IdKind, value: string): boolean {
  return value.startsWith(ID_PREFIXES[kind])
}
