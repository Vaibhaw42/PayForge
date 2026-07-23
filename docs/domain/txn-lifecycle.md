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

_(pending)_

---

## 6 · Chargeback + dispute lifecycle

_(pending)_

---

## 7 · Idempotency contracts

_(pending)_

---

## 8 · Retry semantics + timeouts

_(pending)_

---

## 9 · Reconciliation states

_(pending)_

---

## 10 · Anti-patterns (what NOT to do)

_(pending)_

---

## 11 · What I still don't understand

_(to fill)_
