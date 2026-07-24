# money-math.md — Money Representation, Rounding, FX, Tax

> Phase -1 · Day 4 (part 1) deliverable. Every rule here becomes a DB constraint or code assertion in Phase 4/5.

Money bugs are silent, catastrophic, and non-recoverable. This doc locks the rules that keep PayForge honest.

---

## 1 · Why float is the enemy

Every mainstream language handles decimals via **IEEE 754 binary floating-point**. Fine for physics; fatal for money.

```js
> 0.1 + 0.2
0.30000000000000004

> (0.1 + 0.2) === 0.3
false

> 0.1 + 0.2 - 0.3
5.551115123125783e-17
```

Reason: `0.1` in binary is a non-terminating fraction (like `1/3` in decimal). The computer stores an approximation. Two approximations added ≠ exact.

**One txn** — invisible. **10M txns/day** — sums drift into rupees. **Months** — rupees into lakhs. Auditor finds it. RBI investigates. Fintech fined.

**Hard rule:** never store money as float. Never compute money in float. Never display money from float. Applies to `number` (JS), `float`/`double` (Java/Go/C++), `float64` (Python pre-Decimal), `REAL`/`DOUBLE PRECISION` (Postgres) — all banned for money.



---

## 2 · Minor units — the industry-standard representation

**Store money as integer minor units** in the smallest currency subdivision.

| Currency | Major | Minor | Example |
|----------|-------|-------|---------|
| INR | ₹1 | 1 paisa | ₹1,000.00 → `100000` |
| USD | $1 | 1 cent | $12.34 → `1234` |
| JPY | ¥1 | (no minor — 0 decimals) | ¥1000 → `1000` |
| BHD | BHD 1 | 1 fils | BHD 1.234 → `1234` (3 decimals!) |

Why integers:
- **Exact arithmetic** — no precision loss.
- **Trivial equality checks** — no `Math.abs(a - b) < epsilon`.
- **DB-friendly** — `BIGINT` in Postgres, `bigint` in TS.

Range: JS `Number` safely holds integers up to `2^53 − 1` (~9 quadrillion → ~₹90 trillion in paise). Use **`bigint`** in TS for safety above that.

Postgres: **`BIGINT NOT NULL`** for every monetary column. Never `NUMERIC`, `DECIMAL`, `FLOAT`, `REAL`.



---

## 3 · Currency, ISO 4217, decimals

Every amount **must** carry a currency. Never store money without a currency alongside.

- Standard: **ISO 4217** — 3 uppercase letters. `INR`, `USD`, `EUR`, `JPY`, `BHD`.
- Decimals per currency vary:
  - 2 decimals: INR, USD, EUR, GBP (majority)
  - **0 decimals**: JPY, KRW, VND, IDR (in some usages)
  - **3 decimals**: BHD, KWD, OMR, JOD, TND
  - 4 decimals: CLF (Chilean UF), some crypto

**Never encode the decimal count in the amount itself.** Look up per currency at display time.

**Storage convention (PayForge):**

```sql
create table payment_intents (
  amount_minor  bigint  not null,
  currency      char(3) not null,     -- ISO 4217
  ...
);
```



---

## 4 · Rounding rules — banker's rounding (half-even)

Rounding choice matters when multiplying by a percent.

| Rule | 2.5 → | 3.5 → | Bias |
|------|-------|-------|------|
| Half-up | 3 | 4 | Upward |
| Half-down | 2 | 3 | Downward |
| **Half-even (banker's)** | 2 | 4 | **None** |
| Half-away-from-zero | 3 | 4 | Upward for positives |

**Banker's rounding** is the ISO/IEEE 754 standard for financial systems (referenced in IFRS, Indian GAAP, US GAAP):

- Ties (exactly `.5`) round to the **nearest even integer**.
- Long-run distribution of rounding is symmetric → sums stay balanced over millions of txns.
- Auditors expect it. Deviate → questions.

TS reference:

```ts
function bankerRound(n: number): number {
  const rounded = Math.round(n);
  return (n % 1 === 0.5 && rounded % 2 !== 0) ? rounded - 1 : rounded;
}
```

Prefer libraries: `bignumber.js` or `decimal.js` with `ROUND_HALF_EVEN` mode. Never `Math.round` (half-up) for money.

**Rounding only applies at ties.** For a fractional part like `.725`, both half-up and banker's produce the same result. Never confuse rounding with truncation — truncation is a silent-downward-drift bug.



---

## 5 · Percent math — multiply first, divide last

Computing MDR on ₹1000 at 2.34%:

**Wrong (divide first):**

```
1000 / 100  = 10        // rupees per %
10 * 2.34   = 23.40     // uses float again
```

Or worse in integer-only:

```
100000 / 10000 = 10          // integer division truncates
10 * 234       = 2340 paise  // wrong — but easy to write
```

**Right — multiply first, divide last, use basis points:**

```ts
const amountMinor = 100000n         // ₹1000 = 100000 paise
const mdrBps      = 234n             // 2.34% = 234 basis points

const rawFee    = amountMinor * mdrBps    // 100000 * 234 = 23_400_000
const feeMinor  = rawFee / 10000n          // 2340 paise = ₹23.40
```

**Rule:** in integer money math, always compute `amount * rate_bps / 10000`, never `amount / 10000 * rate_bps`. Precision preserved.

**Basis points (bps):** 1 bp = 0.01%. Store rates as bps integers, not percentages. MDR 2.34% = `234`. Not `0.0234`.

**Worked example (Q-D4-2):**

- Amount ₹888.50 = `88850` paise
- MDR 1.85% = `185` bps
- Fee raw = `88850 * 185 = 16,437,250`
- Fee / 10000 = `1643.725` → banker's round → **`1644` paise = ₹16.44**

If instead you had divided first: `88850 / 10000 = 8` (integer truncation) → `8 * 185 = 1480` paise = ₹14.80 → **₹1.64 lost silently per txn.**



---

## 6 · Money arithmetic invariants

**Invariant 1 — currencies must match.**

```
₹1000 + $10  →  ERROR. Same currency required for + / −.
```

Cross-currency operations only via explicit FX conversion.

**Invariant 2 — sums are exact.**

```
₹1000 = ₹500 + ₹300 + ₹200
100000 paise = 50000 + 30000 + 20000 paise
```

No epsilon tolerance. Mismatch = bug.

**Invariant 3 — balances non-negative, deltas signed by DR/CR direction.**

- Balances: always ≥ 0.
- Deltas (payment, refund, chargeback): represented as absolute integer + a **DR/CR direction flag**, not signed integer. Removes sign ambiguity across double-entry postings.

**Invariant 4 — no monetary field is nullable.**

`NULL` means "unknown" — that is not what "zero rupees" means. Use `0` explicitly.



---

## 7 · FX (currency conversion) basics

Not day-one for PayForge (India-only INR till late phases). But know the concepts.

- **Rate:** `1 USD = 84.5 INR`. Store as integer `numerator/denominator` or high-precision decimal — never float.
- **Bid vs Ask spread:** the broker's margin. Bid ≠ ask.
- **Conversion:** `inr_minor = usd_minor * rate_numerator / rate_denominator`, then banker's-round.
- **Timestamp every rate applied.** Rates change; audit trail required.

Storage:

```sql
create table fx_rates (
  base_currency         char(3) not null,
  quote_currency        char(3) not null,
  rate_numerator        bigint not null,   -- e.g. 8450000 (fixed-precision)
  rate_denominator      bigint not null,   -- e.g. 100000
  as_of                 timestamptz not null,
  source                text not null,     -- 'RBI-Reference' | 'Reuters' | ...
  primary key (base_currency, quote_currency, as_of)
);
```



---

## 8 · India GST + tax math on MDR

**GST 18% applies to the fees, not the transaction amount.**

Example ₹1000 card txn, MDR 2%:

```
amount_minor     = 100000                                  // ₹1000
mdr_bps          = 200                                      // 2%
mdr_minor        = 100000 * 200 / 10000    = 2000           // ₹20 fee
gst_on_mdr_minor = 2000   * 1800 / 10000   = 360            // ₹3.60 GST on fee
total_fee_minor  = 2000 + 360              = 2360           // ₹23.60
net_credit       = 100000 − 2360           = 97640          // ₹976.40 to merchant
```

**Storage rule (Phase 5 ledger):** MDR and GST are **separate postings**, never combined. Auditors + merchant statements need both broken out.

**GST invoice:** merchant needs GSTIN + tax invoice from PayForge for every txn. Monthly statement splits CGST / SGST / IGST (interstate flag).



---

## 9 · Storage format (Postgres, TypeScript, JSON)

**Postgres:**

```sql
amount_minor  bigint  not null,
currency      char(3) not null,
constraint currency_valid check (currency in ('INR','USD','EUR','GBP','JPY','BHD','SGD','AED')),
constraint amount_non_negative check (amount_minor >= 0)
```

**TypeScript:**

```ts
type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'BHD' | 'SGD' | 'AED';
type Money = {
  amountMinor: bigint;    // never `number`
  currency: Currency;
};
```

**JSON API:**

```json
{ "amount": 100000, "currency": "INR" }
```

Send as JSON number (safe up to 2^53) or string for very large values. Never send as decimal string like `"1000.00"` unless explicitly documented as major units.



---

## 10 · Display formatting — Indian numbering, locale

Amounts stored as integer minor units, formatted at **display time only**.

Indian numbering system (lakhs, crores):

```
1,00,000     (one lakh)         — not 100,000
10,00,000    (ten lakh)         — not 1,000,000
1,00,00,000  (one crore)        — not 10,000,000
```

```ts
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function displayInr(minor: bigint): string {
  const major = Number(minor) / 100;
  return inrFormatter.format(major);   // "₹1,00,000.00"
}
```

Warning: `Number(minor)` loses precision above `2^53`. For huge amounts, use `BigInt` string manipulation instead.

**Never format money via string concatenation.** Always via `Intl.NumberFormat`.



---

## 11 · What I still don't understand

Vaibhaw to fill honestly. Candidate gaps:

- **Exact rounding paths under load** — when 10k concurrent txns each round a fee, does anything race? What's the safe pattern for a settlement batch?
- **Cross-currency ledger** — for future PayForge International, how is a mixed-currency merchant balance modelled? Two rows per currency vs one row with FX applied?
- **GST refund on refund** — when a payment is refunded, is the original GST invoice cancelled or does a fresh negative invoice get issued? Merchant statement impact.
- **Number vs bigint interop** — for JSON API, when does `Number` (safe up to 2^53) genuinely break?

**Instruction to future me:** re-read §5 (multiply-first-divide-last) + §4 (banker's rounding) before writing any percent-of-amount code in Phase 4/5.

