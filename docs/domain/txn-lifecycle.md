# txn-lifecycle.md — Transaction Lifecycle & State Machines

> Phase -1 · Day 3 deliverable. Direct input to Phase 4 (Payment Engine) design.

State machines govern **every** money-moving system. This doc locks the states, transitions, retries, and idempotency contracts that PayForge will implement.

---

## 1 · Why state machines matter in payments

### 1.1 · Booleans cannot represent a payment

A naïve `is_paid: boolean` cannot express a real transaction because:

1. **Cardinality** — real txns move through 10+ states (pending, requires_action, authorized, captured, refunded, disputed, ...). A 2-value type physically cannot express this.
2. **Temporal state** — is it "in progress" (retry-able) or "definitively failed" (do not retry)? A boolean cannot distinguish these; retry loops hit PSP forever on a state that never resolves.
3. **Post-success events** — chargebacks and disputes arrive **weeks after** a success. Flipping `is_paid` back to `false` destroys audit history.
4. **Terminality** — some states allow further transitions, some don't. A boolean has no notion of terminality.

The `if/else` soup you'd need to compensate for a boolean is the *symptom* of the missing state machine.

### 1.2 · A state machine gives you

- **States** — the possible situations a txn can be in.
- **Transitions** — what triggers a move from state A to state B.
- **Terminal states** — end-of-life states (SUCCESS, FAILED, EXPIRED, REFUNDED, CHARGED_BACK) from which no further outbound transitions exist.
- **Invariants** — rules that must always hold, e.g. "an authorized txn without a capture within TTL becomes EXPIRED, not SUCCESS".

### 1.3 · The single most important rule

> **State transitions are one-way. Money is never un-moved. It's compensated with a new transaction.**

Once `SUCCESS` is recorded, the row is immutable. To reverse effects, you:

- **Issue a refund** — a **new txn row** with `original_payment_id` foreign key, its own state machine, and (in the ledger) a compensating DR/CR pair.
- **Handle a chargeback** — **yet another new row** — different state machine, initiated by customer via issuer, different fees. Never confused with a refund.

This is why fintech ledgers are **append-only, immutable**. You do not UPDATE rows; you INSERT compensating rows.

### 1.4 · Persist state, do not compute it

Anti-pattern: derive txn status by calling `psp.getStatus(txnId)` on every read.

Problems:

- **Outage fragility** — PSP down → your entire read path (dashboards, receipts, order status) breaks.
- **Rate limits + cost** — real PSPs enforce per-second and per-day API caps; some charge per status call. On-every-read burns quota fast.
- **Race conditions** — concurrent readers get slightly different snapshots → your code branches on different values within the same request.
- **Compliance / audit** — you can only audit what you stored. On-the-fly reads leave no historical trace of "what was the state at 14:32 yesterday?".
- **Latency SLO** — every read adds a hop to PSP; your P99 becomes PSP's P99 + your own.

**Correct pattern (locks Phase 4 design):**

1. Persist state in your DB, updated by events (webhook, poll, reconciliation batch).
2. Serve reads **only from your DB** — never block on PSP.
3. Reconcile with PSP end-of-day to catch drift.
4. **PSP is the source of truth for the wire; your DB is the source of truth for your system.** Different scopes.

### 1.5 · Every state change is an event

A state-change that only lives in a process variable is not real. In PayForge, every transition:

- Writes to the append-only event log (audit trail)
- Emits to Kafka (Phase 5+ — enables ledger, webhook, fraud, analytics)
- Triggers a webhook to the merchant (Phase 7)
- Increments a metric for observability (Phase 10)
- Updates the persisted state row via a single atomic transaction

If your process crashes, the DB state + Kafka event log are the source of truth. Restart, resume.



---

## 2 · Unified payment intent state model

### 2.1 · The 8 states — industry standard

Stripe's PaymentIntent vocabulary became the de-facto standard; Razorpay, Adyen, Cashfree all use variants. PayForge follows.

```mermaid
stateDiagram-v2
  [*] --> REQUIRES_PAYMENT_METHOD: create()
  REQUIRES_PAYMENT_METHOD --> REQUIRES_CONFIRMATION: attach method
  REQUIRES_CONFIRMATION --> REQUIRES_ACTION: needs 3DS / UPI PIN / bank OTP
  REQUIRES_CONFIRMATION --> PROCESSING: confirm() (no action needed)
  REQUIRES_ACTION --> PROCESSING: customer completed challenge
  PROCESSING --> REQUIRES_CAPTURE: auth-only flow, auth approved
  REQUIRES_CAPTURE --> PROCESSING: capture() called
  PROCESSING --> SUCCEEDED: capture confirmed
  PROCESSING --> FAILED: PSP confirms failure
  PROCESSING --> REQUIRES_PAYMENT_METHOD: soft failure (retry with different method)
  SUCCEEDED --> [*]
  FAILED --> [*]
  REQUIRES_PAYMENT_METHOD --> CANCELED
  REQUIRES_CONFIRMATION --> CANCELED
  REQUIRES_ACTION --> CANCELED
  REQUIRES_CAPTURE --> CANCELED: void (auth reversal)
  CANCELED --> [*]
```

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `REQUIRES_PAYMENT_METHOD` | Intent created; awaiting method attach (card token, VPA, etc.) | No |
| `REQUIRES_CONFIRMATION` | Method attached; awaiting merchant confirm | No |
| `REQUIRES_ACTION` | **Ball is in customer's court** — 3DS OTP, UPI PIN screen, netbanking OTP | No |
| `PROCESSING` | Confirmed; PSP working the wire (auth/capture in flight) | No |
| `REQUIRES_CAPTURE` | Auth-only flow: auth approved (hold placed); waiting for merchant `capture()` | No |
| `SUCCEEDED` | Money confirmed captured | **Yes** |
| `FAILED` | Auth declined / final failure | **Yes** |
| `CANCELED` | Merchant / customer aborted before capture (includes auth reversal / void) | **Yes** |

Memory hooks:
- **REQUIRES_ACTION = customer's turn.** PROCESSING / REQUIRES_CAPTURE = system's / merchant's turn.
- **REQUIRES_CAPTURE only exists for auth-only (delayed-capture) flows** — e-commerce sale flow skips it entirely and goes PROCESSING → SUCCEEDED directly.

### 2.2 · Merchant contract vs internal state

The 7 states are the **external merchant contract**. Internally PayForge may track finer sub-states inside `PROCESSING` (`auth_pending`, `captured_pending`, `settlement_batched`, etc.) — merchants do not care and must not see them.

**Design rule:** the externally exposed state contract is small + stable. Internal state can be richer. Never leak internal states in APIs.

### 2.3 · Cancel semantics

`cancel()` is legal in **pre-flight** and **auth-only-before-capture** states:

- `REQUIRES_PAYMENT_METHOD`, `REQUIRES_CONFIRMATION`, `REQUIRES_ACTION` → cancel succeeds (nothing sent to wire yet)
- `REQUIRES_CAPTURE` → cancel triggers **auth reversal / void** — hold is released; state moves to CANCELED
- `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELED` → cancel fails

Why the cutoff at `PROCESSING`? Once auth is fired to PSP → forwarded to network → issuer, the message is in flight across banks; there is no cancel button on the wire. Only remedy after PROCESSING is: wait for terminal state, then refund if it SUCCEEDED.

Real-world quirk (know it exists): some PSPs support **authorization reversal / void** during PROCESSING if capture hasn't happened yet. That is a PSP-specific concept, not merchant cancel. In our unified model, PROCESSING is post-flight → no cancel.

Guard in Phase 4:

```ts
if (state !== 'REQUIRES_PAYMENT_METHOD'
 && state !== 'REQUIRES_CONFIRMATION'
 && state !== 'REQUIRES_ACTION') {
  throw new PaymentIntentNotCancellable(state)
}
```

### 2.4 · One model, N payment methods

The unified 7-state model applies across cards, UPI, netbanking, wallets, EMI, BNPL. What differs is **which sub-states inside PROCESSING** get exercised — the merchant contract stays identical.

This is what lets PayForge expose **one clean API** to merchants regardless of underlying method. Merchant switches cards → UPI → same state names, same transition events.

### 2.5 · Payment intent ≠ order ≠ ledger entry

Three distinct concepts, easily confused:

| Concept | Owned by | Lives in |
|---------|---------|----------|
| **Order** | Merchant's business logic | `orders` — merchant's system |
| **Payment Intent** | PayForge's payment engine | `payment_intents` — our system |
| **Ledger Entry** | Double-entry ledger | `journal_entries` + `postings` — Phase 5 |

**Relationships:**

- 1 order : N payment intents (retries, split payments, second attempt after decline)
- 1 payment intent : N ledger entries (payment posting + fee posting + subvention posting + later refund posting …)
- Order state machine (`PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`) is the merchant's problem, not ours.

**Rule:** orders own themselves; payment intents own themselves; link via foreign key. Merchant maps `payment_intent.state = SUCCEEDED → order.status = CONFIRMED` via **their** business rule — never ours.

PayForge stores only:

```sql
payment_intents
  id
  merchant_id
  order_ref            -- merchant's opaque order id
  amount_minor         -- integer minor units (paise)
  currency             -- 'INR'
  method               -- 'card' | 'upi' | 'netbanking' | ...
  state                -- one of the 7
  created_at, updated_at
```

We never touch `orders`. Merchant's problem.



---

## 3 · Card txn state transitions

### 3.1 · Card sub-states inside PROCESSING

External state (merchant-facing) is one of the 8. Internal card sub-states inside PROCESSING are finer:

```mermaid
stateDiagram-v2
  [*] --> AUTH_PENDING: confirm sent to PSP
  AUTH_PENDING --> AUTH_APPROVED: issuer approves (hold placed)
  AUTH_PENDING --> AUTH_DECLINED: issuer declines
  AUTH_APPROVED --> CAPTURE_PENDING: capture() called (or auto for sale flow)
  CAPTURE_PENDING --> CAPTURED: capture confirmed
  CAPTURE_PENDING --> CAPTURE_FAILED: rare technical failure
  CAPTURED --> SETTLEMENT_PENDING: EOD batch queued
  SETTLEMENT_PENDING --> SETTLED: T+1 RTGS completes
  AUTH_APPROVED --> VOIDED: void() before capture
  AUTH_APPROVED --> EXPIRED: no capture within TTL (5–7 days)
  AUTH_DECLINED --> [*]
  VOIDED --> [*]
  EXPIRED --> [*]
```

Mapping internal → external:

| Internal | External |
|----------|----------|
| AUTH_PENDING | PROCESSING |
| AUTH_APPROVED (auth-only) | REQUIRES_CAPTURE |
| AUTH_APPROVED → CAPTURE_PENDING (sale flow) | PROCESSING |
| CAPTURED, SETTLEMENT_PENDING, SETTLED | SUCCEEDED |
| AUTH_DECLINED, CAPTURE_FAILED | FAILED |
| VOIDED, EXPIRED | CANCELED |

### 3.2 · Sale vs Auth-only vs Delayed capture

**Sale (auth + capture in one call)** — the e-commerce default. Merchant sends `charge()`; PSP does auth then capture immediately. Intent transitions `PROCESSING → SUCCEEDED` in one round-trip.

**Auth-only (delayed capture)** — merchant calls `authorize()` → issuer holds funds → intent `REQUIRES_CAPTURE`. Later merchant calls `capture()` → intent `PROCESSING → SUCCEEDED`.

Where auth-only is used:

- **Hotels** — auth at check-in, capture at check-out.
- **Ride-hailing (Uber)** — auth ₹100 hold, capture actual fare.
- **Marketplaces** — auth on order, capture on ship.
- **Petrol pumps** — auth ₹1 validity check, capture actual fuel.

Capture window is 5–7 days for retail, up to 30 days for travel & entertainment. After the window, uncaptured auth **auto-expires** — the hold drops off the customer's card.

**Partial capture** — merchant can capture LESS than authorized (auth ₹5000, capture ₹3200). Remaining hold drops after window or explicit void.

**Multi-capture** (rare) — capture in chunks summing ≤ authorized. Complex; PayForge won't support day-one.

### 3.3 · Void vs Refund — timing decides which

| Action | When legal | On the wire | Customer sees |
|--------|-----------|-------------|---------------|
| **Void (auth reversal)** | After AUTH_APPROVED, **before capture** | Auth reversal message; hold released | Hold drops off card in minutes to hours |
| **Refund** | After CAPTURED | New refund txn, opposite direction, T+N | Refund credited in 5–7 business days |

**Always prefer void if capture hasn't happened.** Void is fast + free; refund is slow + costs rails fees (and merchant often loses MDR on refund).

**Rule:**
- Cancel before shipping, capture not done → **void**
- Cancel after shipping, capture done → **refund**

### 3.4 · Auth expiration

Auths that are approved but never captured within TTL auto-expire:

- Retail: 5–7 days.
- Travel & entertainment (T&E MCC): up to 30 days.
- Issuer drops the hold automatically; customer's available balance restored.

**Design constraint for PayForge:** every AUTH_APPROVED needs an `expires_at` timestamp and a scheduled reconciliation job flipping expired auths to terminal state.

### 3.5 · Decline codes → state transitions

Different decline codes = different downstream behavior:

| Code | Meaning | State | Merchant action |
|-----:|---------|-------|-----------------|
| 51 | Insufficient funds | FAILED (hard) | Don't retry same card |
| 05 | Do not honor (opaque, most common) | FAILED (hard) | Don't retry; suggest other method |
| 14 | Invalid card | FAILED (hard) | Typo? |
| 54 | Expired card | FAILED (hard) | Update details |
| 41 / 43 | Lost / stolen | FAILED (hard) + block | Never retry; alert customer |
| 61 | Exceeds per-txn amount limit | FAILED (hard) | Suggest lower amount |
| 65 | Daily activity count exceeded | FAILED (hard, retry tomorrow) | Wait & retry next day |
| 91 | Issuer unavailable | FAILED (soft, retryable) | Smart-route to different acquirer/scheme |
| 96 | System malfunction (network/PSP) | FAILED (soft, retryable) | Exp backoff retry |

**Two flavors of FAILED:**

- **Hard failure** — do not retry with same card. Show customer, offer alternate method.
- **Soft failure** — retryable. PA smart-routes across acquirers, or exp-backoff for transient issues.

**Retry nuance:** for code 91 (issuer down), same-route retry likely fails — use **smart routing** (different scheme/acquirer). For code 96 (transient glitch), exp backoff on same route is fine. **Don't blanket-retry on any FAILED.**

**Persistence contract for PayForge Phase 4:**

```ts
{
  status: 'FAILED',
  reason_code: '91',
  reason: 'issuer_unavailable',
  is_retryable: true,
  suggested_action: 'route_alternative_scheme'  // or 'exponential_backoff' or 'no_retry'
}
```

### 3.6 · 3DS state transitions

3DS happens inside the confirm → PROCESSING transition:

```
confirm() → PROCESSING → 3DS challenge → REQUIRES_ACTION (customer sees OTP)
REQUIRES_ACTION → customer types OTP → 3DS validated → PROCESSING (resume)
PROCESSING → issuer auth → AUTH_APPROVED / AUTH_DECLINED
```

**3DS 2.0 frictionless flow** — issuer's risk engine trusts device+behavior → no OTP shown → skips REQUIRES_ACTION entirely, stays in PROCESSING throughout. Still counts as 3DS-authenticated (liability shift still applies).

**Customer abandonment** — customer stalls on OTP screen for 5 min then closes tab → timeout → FAILED with `reason=3ds_timeout`.

### 3.7 · Full card txn timeline (real world, e-commerce sale)

```
T=0s      : confirm() → PROCESSING
T=0.1s    : PSP → PG → acquirer → network → issuer
T=1s      : issuer responds "approved, OTP required" → REQUIRES_ACTION
T=1.5s    : customer sees OTP screen
T=30s     : customer types OTP → REQUIRES_ACTION → PROCESSING
T=32s     : issuer confirms auth → AUTH_APPROVED (external still PROCESSING)
T=32s     : PSP auto-fires capture (sale) → CAPTURE_PENDING
T=33s     : capture confirmed → CAPTURED → SUCCEEDED (external)
--- merchant sees "success" ---
T=EOD     : clearing batch → SETTLEMENT_PENDING (external still SUCCEEDED)
T+1 day   : RTGS bank-to-bank → SETTLED
T+2 day   : PA payout to merchant bank → merchant has usable money
```

Merchant sees ONE external transition (PROCESSING → SUCCEEDED). Internally 6+ sub-states passed. The whole clearing/settlement/payout tail happens **after** merchant already thinks it succeeded.

### 3.8 · Refund state transitions

Refund is a **new state machine** on a separate `refund` object — it does NOT modify the payment intent's terminal state.

```mermaid
stateDiagram-v2
  [*] --> PENDING: refund() called
  PENDING --> PROCESSING: PSP accepts request
  PROCESSING --> SUCCEEDED: issuer confirms credit
  PROCESSING --> FAILED: issuer rejects (rare) OR technical
  SUCCEEDED --> [*]
  FAILED --> [*]
```

- **Partial refunds** — sum of refund amounts ≤ captured amount. Multiple partial refunds allowed against one payment intent.
- **Payment intent stays SUCCEEDED forever.** Compensating rows accumulate in the `refunds` table.
- Refund settlement takes ~5–7 business days visible to customer (issuer processing).



---

## 4 · UPI txn state transitions

### 4.1 · UPI is different — no auth/capture split

Cards have distinct auth and capture. UPI does **debit + credit in one atomic transaction on the wire**. There is no hold-then-capture — money moves in one shot at NPCI.

Consequences:

- **No REQUIRES_CAPTURE state** for UPI push txns. It is `PROCESSING → SUCCEEDED` or `PROCESSING → FAILED`.
- **No void** — nothing to void; either the atomic txn happened or it didn't.
- **No 5–7 day capture window** — settles in seconds.
- **Real-time settlement** — merchant's beneficiary bank sees credit in the same 2–5 s window.

### 4.2 · UPI sub-states inside PROCESSING

```mermaid
stateDiagram-v2
  [*] --> INITIATED: sent to PSP Bank
  INITIATED --> AT_NPCI: PSP Bank forwards to NPCI switch
  AT_NPCI --> DEBIT_PENDING: NPCI dispatches debit to remitter bank
  DEBIT_PENDING --> DEBIT_SUCCESS: remitter bank confirms debit
  DEBIT_PENDING --> DEBIT_FAILED: remitter rejects (insuff funds, PIN wrong, limit)
  DEBIT_SUCCESS --> CREDIT_PENDING: NPCI dispatches credit to beneficiary
  CREDIT_PENDING --> CREDIT_SUCCESS: beneficiary bank confirms
  CREDIT_PENDING --> CREDIT_FAILED: beneficiary rejects (rare)
  CREDIT_FAILED --> AUTO_REVERSED: NPCI auto-reverses the debit
  CREDIT_PENDING --> DEEMED_APPROVE: credit confirmation timeout (U69)
  CREDIT_SUCCESS --> [*]
  DEBIT_FAILED --> [*]
  AUTO_REVERSED --> [*]
  DEEMED_APPROVE --> CREDIT_SUCCESS: late confirmation arrives (up to 24h)
  DEEMED_APPROVE --> AUTO_REVERSED: NPCI reverses after window (~T+2h)
```

Mapping internal → external:

| Internal | External |
|----------|----------|
| INITIATED, AT_NPCI, DEBIT_PENDING, CREDIT_PENDING | PROCESSING |
| **DEEMED_APPROVE** | **PROCESSING** (still not terminal — awaiting resolution) |
| CREDIT_SUCCESS | SUCCEEDED |
| DEBIT_FAILED | FAILED |
| AUTO_REVERSED | FAILED (with `reason=auto_reversed`) |

**Design rule (Phase 4):** DEEMED_APPROVE must not transition to SUCCEEDED externally. Merchant is told PROCESSING until the state is truly resolved. Never fulfill on DEEMED_APPROVE.

### 4.3 · U69 deemed-approve — the reconciliation state

Payer's bank debited but the credit confirmation timed out. Two paths:

- Path A — **late confirmation** arrives within 24 h → CREDIT_SUCCESS → SUCCEEDED
- Path B — **no confirmation** by NPCI's fixed window (~T+2 h) → NPCI auto-reverses the debit → AUTO_REVERSED → FAILED

PayForge behavior in DEEMED_APPROVE:

1. External state stays `PROCESSING`.
2. Start a **polling job** — call PSP's `/status?tr=...` every 5–10 s for up to 15 min, then exponential backoff.
3. **Do not fulfill the order.** Merchant sees processing.
4. On EOD reconciliation, sweep any residual DEEMED_APPROVE against PSP's settlement file → resolve to terminal.

Customer UX: customer sees "debited but processing" in their bank app. Show a status page with real-time updates. Never lie ("payment received") until CREDIT_SUCCESS.

### 4.4 · UPI response codes → state transitions

| Code | Meaning | Internal | External | Retryable? |
|------|---------|----------|----------|------------|
| **00** | Success | CREDIT_SUCCESS | SUCCEEDED | N/A |
| **U16** | Payer bank unavailable | DEBIT_FAILED | FAILED (soft) | Yes — retry via different app/bank |
| **U28** | Insufficient funds | DEBIT_FAILED | FAILED (**hard**) | **No** — balance won't change on retry; show customer, suggest lower amount / other method |
| **U54** | PIN attempts exceeded | DEBIT_FAILED | FAILED (hard) | Wait period enforced |
| **U66** | Beneficiary bank down | CREDIT_FAILED → AUTO_REVERSED | FAILED (soft) | Retry with different beneficiary VPA if available |
| **U69** | Deemed approve — no credit confirmation | DEEMED_APPROVE | PROCESSING | Poll + wait |
| **ZM** | PIN incorrect | DEBIT_FAILED | FAILED (soft — customer retries with correct PIN) | User re-attempts |
| **BT** | Timeout at any hop | DEEMED_APPROVE | PROCESSING | Poll |

**Retry mental model:** ask *"would waiting 30 s and retrying help?"* — if no, HARD. If yes, SOFT. "Retryable due to fund issues" is a contradiction — fund issues need customer action, not a retry.

**Rule:** never trust the immediate response as source of truth. UPI response codes are hints; the actual state must be confirmed via status polling.

### 4.5 · UPI refund state transitions

UPI refunds are **real-time** (unlike card 5–7 days).

```mermaid
stateDiagram-v2
  [*] --> PENDING: refund() called
  PENDING --> AT_NPCI: PSP dispatched to NPCI
  AT_NPCI --> CREDIT_TO_PAYER_PENDING: NPCI dispatched credit to payer's bank
  CREDIT_TO_PAYER_PENDING --> SUCCEEDED: payer's bank confirms credit
  CREDIT_TO_PAYER_PENDING --> FAILED: payer's bank rejects (very rare)
  CREDIT_TO_PAYER_PENDING --> DEEMED_APPROVE: U69 pattern on refunds too — poll
  SUCCEEDED --> [*]
  FAILED --> [*]
```

Refunds can also hit DEEMED_APPROVE (rare). Same polling+reconciliation playbook. Partial refunds allowed, same as cards.

### 4.6 · UPI AutoPay mandate lifecycle — a SEPARATE state machine

The mandate is its own object with its own states — distinct from the debit-execution state machine. Mixing the two is a common bug.

```mermaid
stateDiagram-v2
  [*] --> AWAITING_APPROVAL: create()
  AWAITING_APPROVAL --> ACTIVE: payer approves with PIN
  AWAITING_APPROVAL --> REJECTED: payer rejects
  AWAITING_APPROVAL --> EXPIRED: no action within timeout
  ACTIVE --> PAUSED: merchant pauses
  PAUSED --> ACTIVE: merchant resumes
  ACTIVE --> REVOKED: payer revokes (via TPAP)
  ACTIVE --> EXPIRED: mandate end-date passes
  PAUSED --> REVOKED
  PAUSED --> EXPIRED
  REJECTED --> [*]
  REVOKED --> [*]
  EXPIRED --> [*]
```

**Two levels of state — keep them separate:**

- **Mandate state** — is the mandate itself alive? (ACTIVE, PAUSED, REVOKED, EXPIRED)
- **Debit state** — did a particular monthly debit succeed? Uses the standard payment intent state machine.

**A failed debit does NOT change mandate state.** Otherwise one missed month would kill a Netflix subscription. Mandate stays ACTIVE; debit intent goes FAILED; merchant retries per its policy.

**Debit execution rules against a mandate:**

- Debit auto-declined if mandate is not ACTIVE.
- Debit auto-declined if amount > mandate cap.
- Debit auto-declined if frequency window not open (a "monthly" mandate cannot fire twice in a cycle).
- **Pre-debit notification rule** — for amount above RBI thresholds, customer must be notified 24 h before via TPAP push / SMS.

**Design implication for PayForge (Phase 4/6):**

- `mandates` table stores mandate lifecycle.
- `payment_intents` table stores individual debit executions, each with `mandate_id` FK.
- **Never update mandate state on debit failure.** Only on pause / revoke / expire.
- Retry policy configurable per mandate (Netflix-style: 3-day retry, 3 attempts, then dunning email).

### 4.7 · Card vs UPI — state model diff summary

| Aspect | Card | UPI |
|--------|------|-----|
| Auth/capture split | Yes | No (atomic) |
| REQUIRES_CAPTURE state | Yes (auth-only) | No |
| Void | Yes (before capture) | No |
| Refund latency | 5–7 days | Real-time |
| Settlement | T+1 | Real-time |
| Deemed-approve pattern | Rare | Common (U69) |
| Recurring mechanism | e-Mandate on card | UPI AutoPay mandate |



---

## 5 · Refund lifecycle

### 5.1 · Refund is a first-class object

A refund is a **new row** with its own id, its own state machine, its own ledger entries. It **does NOT mutate the payment intent** — the intent stays `SUCCEEDED` forever.

```
payment_intents
  id: pi_abc123
  amount_minor: 100000        (₹1000)
  state: SUCCEEDED            (unchanged after refund)

refunds
  id: re_xyz789
  payment_intent_id: pi_abc123
  amount_minor: 40000         (₹400 partial)
  state: SUCCEEDED
  reason: 'customer_request'
```

### 5.2 · Refund state machine (unified across methods)

```mermaid
stateDiagram-v2
  [*] --> PENDING: refund() called
  PENDING --> PROCESSING: PSP accepted
  PROCESSING --> SUCCEEDED: rail confirms credit to customer
  PROCESSING --> FAILED: rail rejects OR technical failure
  PROCESSING --> DEEMED_APPROVE: rail timeout (UPI mostly)
  DEEMED_APPROVE --> SUCCEEDED
  DEEMED_APPROVE --> FAILED
  SUCCEEDED --> [*]
  FAILED --> [*]
```

Method-specific timings inside PROCESSING:

- **Card refund** — 5–7 business days visible to customer (issuer batches + statement update).
- **UPI refund** — real-time (seconds).
- **Netbanking refund** — T+1 typical.
- **Wallet refund** — sub-second to real-time.

### 5.3 · Partial refunds — the invariant

Multiple partial refunds allowed against one payment intent.

**Invariant:** `SUM(refunds WHERE state ∈ {PENDING, PROCESSING, SUCCEEDED, DEEMED_APPROVE}).amount ≤ payment_intent.amount`

**Concurrency-safe check + lock (Phase 4 code):**

```ts
begin transaction;
  select amount_minor from payment_intents where id = ? for update;
  select coalesce(sum(amount_minor), 0) from refunds
    where payment_intent_id = ? and state != 'FAILED';
  if (existing_sum + requested > total) throw RefundExceedsCaptured;
  insert into refunds (...);
commit;
```

Concurrent refund requests without a lock would each read "remaining = ₹700" simultaneously → both pass validation → double refund. `FOR UPDATE` serializes them.

**Also include PENDING/PROCESSING refunds in the sum.** Otherwise two concurrent refunds each PENDING both pass and both succeed later.

### 5.4 · Refund reason codes (audit-mandatory)

Every refund carries a `reason`:

- `customer_request` — normal cancel
- `duplicate_charge` — merchant charged twice by mistake
- `fraudulent` — merchant detected fraud post-capture
- `product_not_delivered`
- `service_not_provided`
- `agreed_via_support`

RBI + PA agreements require merchant to store reason + supporting evidence for 5+ years. Becomes evidence if chargeback comes later.

### 5.5 · Refund and MDR

Original MDR is **not refunded to merchant**. Merchant eats:

- Original MDR on the ₹1000 capture (~₹23).
- Sometimes a small refund-processing fee (~₹5–15).

Ledger records **refund_expense** as a separate posting from payment posting — never netted.

### 5.6 · Instant refund vs standard refund

Some PSPs (Razorpay, Cashfree) offer **instant refund** — credit shows on customer's card in minutes instead of 5–7 days. Uses IMPS to push credit directly, bypassing card rails.

- Costs merchant extra (~₹5–10 per instant refund).
- Optional flag on refund call.
- Not always available — customer's issuer must support instant credit.



---

## 6 · Chargeback + dispute lifecycle

### 6.1 · Chargeback ≠ refund — memorize this table

|  | **Refund** | **Chargeback** |
|--|-----------|----------------|
| Initiated by | Merchant | Customer via issuer |
| Trigger | Merchant clicks refund | Customer disputes on statement |
| Timing | Merchant's choice | Up to 120 days post-txn (network + reason dependent) |
| Cost to merchant | ₹0–15 (instant refund fee optional) | ₹500–2000 fee + risk of losing amount |
| Merchant action | Just call API | Submit evidence within 7–14 days or lose |
| Outcome | Almost always succeeds | Uncertain — win, lose, or arbitrate |
| Nature | Cooperative | **Adversarial** |
| State machine | 5-state simple | 8-state adversarial |

Diagnostic: customer contacted **merchant support** → refund. Customer contacted **their bank/issuer** → chargeback. Same money returning, completely different rails.

### 6.2 · Chargeback state machine

```mermaid
stateDiagram-v2
  [*] --> DISPUTE_OPENED: issuer sends chargeback via network
  DISPUTE_OPENED --> UNDER_REVIEW: merchant reviewing evidence
  UNDER_REVIEW --> REPRESENTED: merchant submits defense
  UNDER_REVIEW --> ACCEPTED: merchant accepts, writes off
  REPRESENTED --> WON: issuer/network agrees with merchant
  REPRESENTED --> LOST: issuer/network sides with customer
  LOST --> ARBITRATED: merchant escalates (rare, costly)
  ARBITRATED --> WON_FINAL
  ARBITRATED --> LOST_FINAL
  ACCEPTED --> [*]
  WON --> [*]
  LOST --> [*]
  WON_FINAL --> [*]
  LOST_FINAL --> [*]
```

Timeline:

- Customer initiates dispute with issuer up to 120 days post-txn.
- Issuer sends chargeback → network → acquirer → PSP → merchant webhook.
- Merchant has ~7–14 days to respond with **representment** (evidence).
- Network/issuer reviews → win or lose.
- If lost, merchant can arbitrate — ₹5k–₹50k filing fee, rarely successful.

### 6.3 · Chargeback reason codes (subset)

| Category | Example reason | Merchant defense |
|----------|----------------|-------------------|
| **Fraud** | Unauthorized transaction | Prove 3DS-authenticated → issuer eats loss |
| **Consumer** | Product not received | Prove delivery — shipping tracker, signed POD |
| | Not as described | Prove item matches listing |
| | Duplicate charge | Prove two separate orders |
| **Authorization** | No authorization | Prove auth code from network |
| **Processing** | Incorrect amount | Prove receipt matches capture |
| **Cancellation** | Credit not processed | Prove refund was issued |

Winning example — Q-D3-14: customer disputes "product not received" 45 days later; merchant submits GPS delivery tracking + signed POD → REPRESENTED → WON. Merchant keeps the money. Chargeback fee may still apply (often non-refundable even on win).

### 6.4 · Chargeback economics — merchant eats it (mostly)

For a ₹1000 lost chargeback:

| Line item | Amount |
|-----------|--------|
| Original MDR (not refunded) | ~₹23 |
| Chargeback fee | ₹500–2000 |
| Refund amount to customer | ₹1000 |
| Fulfillment cost (product shipped) | ₹500 COGS |
| **Net loss** | **₹1000 + fees + goods** |

### 6.5 · Chargeback rate thresholds (Visa VDMP, roughly)

| Rate | Tier | Consequences |
|------|------|--------------|
| < 0.65% count / 0.9% $ | Normal | OK |
| 0.9%–1.8% | Early-warning | Fines, forced remediation, higher MDR |
| > 1.8% | Excessive | Aggressive fines, possible termination |

**At 1.5% (early-warning tier), expect:**

- PSP flags merchant + tightens surveillance.
- **Rolling reserve / holdback** — PSP holds 5–10% of settlements for 90–180 days.
- MDR bumps 0.3–0.7% under network monitoring programs (Visa VDMP, MC ECP).
- Monthly network fines ($25k–$50k in the excessive tier).
- Two-three months in the tier without improvement → **PSP drops merchant**.

### 6.6 · Chargeback prevention tactics

- **Enforce 3DS on all card txns** — fraud chargebacks flip to issuer.
- **Shipping tracking + delivery confirmation** — evidence for "not received" disputes.
- **Clear billing descriptor** — `PAYFORGE*ORDER8842` beats `RANDOM STRING` — customer recognizes on statement.
- **Refund quickly on complaint** — customer who gets refund in 24 h doesn't chargeback.
- **Fraud scoring at auth** — decline high-risk txns before capture.

### 6.7 · How chargebacks land in PayForge

Chargeback events come as webhooks from PSP:

```json
{
  "event": "dispute.opened",
  "payment_intent_id": "pi_abc123",
  "dispute_id": "dp_xyz",
  "amount_minor": 100000,
  "reason_code": "unauthorized",
  "deadline": "2026-08-15T00:00:00Z",
  "network": "visa"
}
```

Merchant/PayForge actions:

1. Persist dispute row.
2. Notify merchant admin (dashboard alert + email).
3. **Freeze corresponding funds** in ledger (Phase 5).
4. Ledger: reverse the original payment posting + apply chargeback fee.

Dispute records persist FOREVER — even after resolution. Historical view is required for compliance + fraud analytics.

### 6.8 · Ledger effects — refund vs chargeback

| Event | Journal entry (postings) | Net on merchant_payable |
|-------|--------------------------|-------------------------|
| Payment SUCCEEDED | DR customer_receivable / CR merchant_payable | +amount |
| MDR fee | DR fee_expense / CR merchant_payable | −MDR |
| Refund SUCCEEDED | DR merchant_payable / CR customer_receivable | −amount |
| Chargeback DISPUTE_OPENED | DR merchant_payable / CR merchant_payable_frozen | 0 (moved, not lost) |
| Chargeback LOST | DR merchant_payable_frozen / CR customer_receivable + chargeback_fee expense | −amount − fee |
| Chargeback WON | Reverse the freeze | 0 (unfrozen back to merchant_payable) |

For a **₹1000 payment + full ₹1000 refund**:

- 2 journal entries (payment + refund) — plus fee entries in reality.
- 4 postings minimum (each entry = 1 DR + 1 CR) — 6+ postings once MDR is included.
- Net effect on `merchant_payable`: `0` for the customer flow. Net effect including MDR: `−₹23` (merchant loses fee on refund).

**Terminology to keep separate:**

- `refunds` table — 1 row per refund object.
- `journal_entries` table — 1 row per event.
- `postings` table — 1 row per DR or CR line (2+ per journal entry).

Three different granularities.



---

## 7 · Idempotency contracts

### 7.1 · Why idempotency exists

Real-world payment flow can fail mid-way:

```
T=0.0s  Merchant sends POST /payment_intents
T=0.5s  PayForge accepts, starts processing
T=2.0s  Server successfully charges the card
T=2.5s  Server tries to send 200 OK response
T=2.5s  ...network drops...
T=30s   Merchant's HTTP client times out
T=30s   Merchant retries the request

DANGER: server did the payment. Merchant didn't see the response.
Naïve retry double-charges.
```

**Idempotency = "safely repeatable."** Same request sent N times has the same effect as sending it once. No double charges. This is a hard requirement for every state-changing payment endpoint.

### 7.2 · The idempotency-key contract

Client generates a **unique key per logical operation** and sends it as an HTTP header:

```http
POST /v1/payment_intents
Idempotency-Key: pi_req_9c1b7e2f-8a44-4b6f-b1c2-d5f3a89e2c11
Content-Type: application/json

{ "amount": 100000, "currency": "INR", "method": "card" }
```

Server's contract:

1. **First request with a new key** → process normally; store `(key → {request_hash, response, status})`; return response.
2. **Same key + same body** → **replay cached response instantly.** Do NOT re-execute. Purpose of the key is exactly this.
3. **Same key + different body** → return `409 Conflict` (misuse; one key = one operation).
4. **Different key** → new independent operation.

Keys live for a **TTL** (typically 24 h). After TTL, key is forgotten.

**Storage schema (Phase 4):**

```sql
create table idempotency_keys (
  key text primary key,
  merchant_id uuid not null,
  request_body_hash text not null,       -- sha256 of body
  response_status int,
  response_body jsonb,
  state text,                             -- 'in_progress' | 'completed' | 'errored'
  created_at timestamp,
  expires_at timestamp                    -- created_at + 24h
);
```

### 7.3 · Handling concurrent requests

Merchant retries **before first request completes**. Two identical requests arrive simultaneously.

**Wrong:** both check "does key exist?" → both see "no" → both proceed → double-charge.

**Correct:** on first request, INSERT with `state='in_progress'` atomically. Second request's INSERT hits unique-constraint violation → detects concurrent execution → returns `409` or **polls** for the first to complete.

```ts
async function handlePayment(req) {
  const key = req.headers['idempotency-key']
  const bodyHash = sha256(req.body)

  const existing = await db.query(`SELECT * FROM idempotency_keys WHERE key = ?`, [key])

  if (existing) {
    if (existing.request_body_hash !== bodyHash) return 409  // body mismatch
    if (existing.state === 'completed') return existing.response  // replay
    if (existing.state === 'in_progress') return 409          // or poll and wait
  }

  await db.insert('idempotency_keys', {
    key, merchant_id, request_body_hash: bodyHash,
    state: 'in_progress', created_at: now(), expires_at: now() + 24h
  })

  const result = await actuallyProcessPayment(req.body)

  await db.update('idempotency_keys',
    { response_body: result, response_status: 200, state: 'completed' },
    { key })

  return result
}
```

Unique constraint on `key` is your race gate.

### 7.4 · Where idempotency matters

**Must be idempotent** (state-changing endpoints):

- `POST /payment_intents` (create)
- `POST /payment_intents/:id/confirm`
- `POST /payment_intents/:id/capture`
- `POST /payment_intents/:id/cancel`
- `POST /refunds`
- Every webhook consumer (Phase 7)

**Naturally idempotent, no key needed** (side-effect-free):

- `GET /payment_intents/:id`
- `GET /refunds/:id`

### 7.5 · Idempotency key ≠ resource id

- **Idempotency key** — client-generated, one-time-use, request-scoped.
- **Resource id** — server-generated (`pi_abc123`), stable identifier of the object.

Never expose keys as resource identifiers. Never let clients look up an object by idempotency key. Key is a de-duplication token, not a data pointer.

### 7.6 · Webhook consumer idempotency

Webhooks arrive **at-least-once** — PSP may deliver the same event 2–N times. Dedupe by **`event_id`** (PSP-generated, guaranteed unique per event):

```ts
async function handleWebhook(req) {
  const eventId = req.body.id
  const seen = await db.query('SELECT 1 FROM webhook_events WHERE id = ?', [eventId])
  if (seen) return 200  // dedupe — return 200 or PSP will retry

  await db.transaction(async (tx) => {
    await tx.insert('webhook_events', { id: eventId, received_at: now(), payload: req.body })
    await processEvent(req.body)
  })
  return 200
}
```

Never dedupe on **body hash** — PSPs include retry counters and delivered_at timestamps that change between deliveries. `event_id` is the canonical, contract-guaranteed dedup key.

**Always return 200 on duplicates.** Non-2xx makes PSP treat it as delivery failure and retry — perpetuates the storm.

### 7.7 · Common idempotency bugs

- **Missing TTL cleanup** — key table grows unbounded. Fix: nightly delete of expired keys.
- **Same key reused for different logical operations** — merchant reuses `req_0001` for create then confirm. Server misroutes. Fix: return 409 on body mismatch.
- **Key stored only after success** — server errored mid-request, no record persisted → retry re-executes. Fix: persist key with `state='in_progress'` on request receipt, before processing.
- **Idempotency only on happy path** — same problem, different flavour. Fix: persist regardless of outcome; distinguish 'completed' vs 'errored' state.



---

## 8 · Retry semantics + timeouts

### 8.1 · Three retry layers

Payment flows have retries at three distinct layers, each with its own policy. They compose.

1. **Client → Server** (merchant → PayForge)
2. **Server → PSP** (PayForge → Razorpay/Stripe)
3. **PSP → Network → Issuer** (mostly invisible to us)

### 8.2 · Retry vs Poll — the most important distinction

**Retry writes. Poll reads.** Confuse these and you double-charge customers.

- **Retry** = re-execute a state-changing operation. Safe only if idempotent AND the operation state is still pre-flight or explicitly retryable.
- **Poll** = read-only status check. Always safe. Answers "what did the previous request actually end up doing?"

**When you don't know the outcome, poll — never retry blindly.**

### 8.3 · What is safe to retry, what is not

| Situation | Safe to retry? | Correct action |
|-----------|----------------|----------------|
| Network timeout before PSP received | Yes | Retry with same idempotency key |
| Network timeout after PSP received | Only with idempotency key | Retry (server dedupes) OR poll |
| Response = 5xx | Yes (if idempotent) | Retry with backoff |
| Response = 4xx | No | Fix input |
| Response = 200 SUCCEEDED | No | Done |
| Explicit FAILED (hard) | No | Show error |
| Explicit FAILED (soft — issuer down) | Yes | Retry / smart route via different acquirer or scheme |
| Explicit PROCESSING | No | **Poll** status API |
| Explicit REQUIRES_ACTION | No | Wait for customer |
| Explicit DEEMED_APPROVE | No | **Poll** — retry risks double debit |

### 8.4 · Exponential backoff + jitter

Naïve retry (immediately / 1 s / 2 s / 4 s …) creates **thundering herds** — if 1000 clients fail at the same instant, they all retry in lock-step and crush PSP.

**Add jitter (randomness):**

```
delay = min(cap, base * 2^attempt) * random(0.5, 1.5)
```

Example, base = 1 s, cap = 30 s:

| Attempt | Delay range |
|--------:|-------------|
| 0 | 0.5–1.5 s |
| 1 | 1–3 s |
| 2 | 2–6 s |
| 3 | 4–12 s |
| 4+ | 15–30 s (capped) |

Real-world default across most fintech SDKs: **exponential backoff with equal jitter (AWS jitter).**

### 8.5 · Retry budget

Two limits:

- **Max attempts** — 3–5 for user-facing flows; 10–20 for background webhook delivery.
- **Max wall-clock time (deadline)** — 30 s for interactive; 24–72 h for webhook delivery.

**When budget exhausted:** move to a **dead-letter queue (DLQ)** and page on-call. Never silently give up.

### 8.6 · Timeout vs retry — separate concerns

Timeout = give up waiting, treat as unknown. Retry = re-issue.

Typical values for interactive payments:

| Layer | Per-attempt timeout | Retries | Total budget |
|-------|--------------------|---------|--------------|
| Merchant → PayForge | 30 s | 2 | 90 s |
| PayForge → PSP (auth) | 20 s | 1 | 40 s |
| PayForge → PSP (capture) | 60 s | 3 | ~3 min |
| Webhook delivery | 10 s | 15 with exp backoff | 24 h |

### 8.7 · Circuit breakers — stop retrying when dependency is down

If PSP is systemically down, retries hurt more than help — they pile load while PSP tries to recover.

```
CLOSED (all requests pass)
   ↓ (N failures in T seconds)
OPEN (all requests fail fast, no attempt)
   ↓ (after cooldown)
HALF_OPEN (allow one trial request)
   ↓ trial ok → CLOSED
   ↓ trial fails → OPEN
```

Libraries: `opossum` (Node), Resilience4j (Java), Polly (.NET).

**Design rule for PayForge:** every external call wrapped in a circuit breaker. Breaker OPEN → fail fast with `PSP_UNAVAILABLE` → merchant handles gracefully.

### 8.8 · Retry storms — the anti-pattern

Bad retry logic amplifies small failures into outages.

- PSP at 5% error, 3 retries → effective load 1.15× normal. Bearable.
- PSP degrades to 50% error, 3 retries → effective load 2.5×. Overloads PSP → error rate rises → more retries → **death spiral**.

Prevention:

- Circuit breakers.
- Retry budget cap per time window.
- **Adaptive retry** — reduce retries when observed error rate is high.

### 8.9 · The unified retry decision tree

```
Response received?
├── No (timeout) → retry with same idempotency key OR poll for state
├── 200 OK + terminal (SUCCEEDED/FAILED/CANCELED) → done
├── 200 OK + non-terminal (PROCESSING/REQUIRES_ACTION/DEEMED_APPROVE)
│    → POLL, don't retry
├── 4xx (client error) → don't retry — fix input
├── 5xx (server error) → retry with exp backoff + jitter (if idempotent)
└── Explicit FAILED
     ├── hard → don't retry
     └── soft → retry / smart route
```

### 8.10 · PayForge client-library contract

The SDK/client library MUST distinguish these three response classes:

| Response class | Action |
|----------------|--------|
| Network error / timeout / 5xx | Retry with same idempotency key |
| 2xx + terminal state (SUCCEEDED / FAILED / CANCELED) | Return to caller |
| 2xx + non-terminal state (PROCESSING / REQUIRES_ACTION / DEEMED_APPROVE) | **Poll**, do not retry |
| 4xx | Return error to caller, do not retry |



---

## 9 · Reconciliation states

_(pending)_

---

## 10 · Anti-patterns (what NOT to do)

_(pending)_

---

## 11 · What I still don't understand

_(to fill)_
