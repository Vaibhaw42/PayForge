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

### 2.1 · The 7 states — industry standard

Stripe's PaymentIntent vocabulary became the de-facto standard; Razorpay, Adyen, Cashfree all use variants. PayForge follows.

```mermaid
stateDiagram-v2
  [*] --> REQUIRES_PAYMENT_METHOD: create()
  REQUIRES_PAYMENT_METHOD --> REQUIRES_CONFIRMATION: attach method
  REQUIRES_CONFIRMATION --> REQUIRES_ACTION: needs 3DS / UPI PIN / bank OTP
  REQUIRES_CONFIRMATION --> PROCESSING: confirm() (no action needed)
  REQUIRES_ACTION --> PROCESSING: customer completed challenge
  PROCESSING --> SUCCEEDED: PSP confirms success
  PROCESSING --> FAILED: PSP confirms failure
  PROCESSING --> REQUIRES_PAYMENT_METHOD: soft failure (retry with different method)
  SUCCEEDED --> [*]
  FAILED --> [*]
  REQUIRES_PAYMENT_METHOD --> CANCELED: merchant cancels
  REQUIRES_CONFIRMATION --> CANCELED: merchant cancels
  REQUIRES_ACTION --> CANCELED: merchant / customer aborts
  CANCELED --> [*]
```

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `REQUIRES_PAYMENT_METHOD` | Intent created; awaiting method attach (card token, VPA, etc.) | No |
| `REQUIRES_CONFIRMATION` | Method attached; awaiting merchant confirm | No |
| `REQUIRES_ACTION` | **Ball is in customer's court** — 3DS OTP, UPI PIN screen, netbanking OTP | No |
| `PROCESSING` | Confirmed; PSP working the wire (auth/capture in flight) | No |
| `SUCCEEDED` | Money confirmed captured | **Yes** |
| `FAILED` | Auth declined / final failure | **Yes** |
| `CANCELED` | Merchant / customer aborted before PROCESSING | **Yes** |

Memory hook: **REQUIRES_ACTION = customer's turn. PROCESSING = system's turn.**

### 2.2 · Merchant contract vs internal state

The 7 states are the **external merchant contract**. Internally PayForge may track finer sub-states inside `PROCESSING` (`auth_pending`, `captured_pending`, `settlement_batched`, etc.) — merchants do not care and must not see them.

**Design rule:** the externally exposed state contract is small + stable. Internal state can be richer. Never leak internal states in APIs.

### 2.3 · Cancel semantics

`cancel()` is legal only in **pre-flight** states:

- `REQUIRES_PAYMENT_METHOD`, `REQUIRES_CONFIRMATION`, `REQUIRES_ACTION` → cancel succeeds
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

_(pending)_

---

## 4 · UPI txn state transitions

_(pending)_

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
