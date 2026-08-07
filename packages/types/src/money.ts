/**
 * Money = integer minor units + ISO 4217 currency.
 * See docs/domain/money-math.md §2 for the rules.
 *
 * Never use `number` for the amount; use `bigint` above 2^53 minor units.
 * Never store or transport as a decimal string.
 */
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'BHD' | 'SGD' | 'AED'

export interface Money {
  amountMinor: bigint
  currency: Currency
}
