# reference-architecture-notes.md — Patterns from Stripe & Razorpay

> Phase -1 · Day 7 deliverable. Distilled patterns from Stripe + Razorpay engineering blogs. PayForge borrows from both.

Rules:
- These are **architectural patterns**, not literal API copies.
- Where Stripe and Razorpay differ, note the reason.
- India-first bias where they diverge (Razorpay's UPI + PA context is more directly applicable).

---

## 1 · Why study these two

**Stripe** — 15+ years of writing about payment engineering. Best public documentation of a payments API on the internet. Sets industry vocabulary.

**Razorpay** — India's largest PA-native fintech. Has actually shipped everything PayForge simulates (PA license, sponsor bank, UPI + card unified, PA-CB, e-mandate).

Reading both = complementary. Stripe is the API design + resilience playbook. Razorpay is the India regulatory + method-diversity playbook.

---

## 2 · API design patterns (mostly from Stripe)

### 2.1 · Resource-oriented, versioned URLs

```
POST /v1/payment_intents
POST /v1/payment_intents/{id}/confirm
POST /v1/payment_intents/{id}/capture
POST /v1/refunds
POST /v1/customers
POST /v1/webhooks
```

- Every resource has a prefix (`pi_`, `re_`, `cus_`, `evt_`) — self-identifying ids on inspection.
- Versioned URL segment (`/v1/`) — breaking changes get a new segment (`/v2/`), old stays live.
- Actions are POSTs on the resource (`.../confirm`), not verbs at the top level.

**PayForge borrows all of the above.** ID prefixes locked: `pi_` for payment intent, `re_` for refund, `dp_` for dispute, `evt_` for event, `mer_` for merchant.

### 2.2 · Expand / include on responses

Stripe returns compact objects by default. Client passes `?expand[]=customer` → server hydrates nested object inline.

Saves round-trips without forcing overfetching. **PayForge Phase 3+** adopts this.

### 2.3 · Idempotency-Key everywhere

Every mutation endpoint accepts `Idempotency-Key` header. Even ones you'd think are safe (like `POST /customers`). Reason: same customer with same idempotency-key = same customer id returned, no duplicate row.

### 2.4 · Structured error object

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "amount_too_low",
    "message": "Amount must be at least ₹1.00",
    "param": "amount",
    "doc_url": "https://payforge.io/docs/errors/amount_too_low",
    "request_id": "req_abc123"
  }
}
```

- `type` — high-level bucket (`api_error`, `invalid_request_error`, `authentication_error`, `card_error`, `rate_limit_error`)
- `code` — machine-readable code
- `message` — human message
- `param` — which field
- `doc_url` — deep-link to docs
- `request_id` — trace back

**PayForge locks this shape.**

### 2.5 · Webhooks signed with HMAC-SHA256

Header: `PayForge-Signature: t=<timestamp>,v1=<hmac_sha256(secret, timestamp + '.' + payload)>`

- Timestamp is signed to prevent replay.
- Client verifies signature before acting on the payload.

**PayForge Phase 7 uses this exact scheme** (Stripe-compatible).

### 2.6 · Pagination via cursor, not offset

```
GET /v1/payment_intents?limit=100&starting_after=pi_abc
```

- Offset pagination breaks under high write load (page shifts).
- Cursor is stable (id-based) — points to "give me records after this id".
- Add `has_more: true` in response body.

### 2.7 · Metadata field on every resource

Merchant-defined key-value store on every resource:

```json
"metadata": { "order_id": "8842", "campaign": "diwali24" }
```

Lets merchant tag records for own queries without asking API to add new columns. **PayForge adopts.**

---

## 3 · State machine patterns

### 3.1 · Stripe's PaymentIntent 8-state model

Already adopted verbatim in `txn-lifecycle.md` §2 (REQUIRES_PAYMENT_METHOD → REQUIRES_CONFIRMATION → REQUIRES_ACTION → PROCESSING → REQUIRES_CAPTURE → SUCCEEDED / FAILED / CANCELED).

Notable design choices:

- **External model is small** (8 states); internal can be much finer.
- **Terminal states named as past-tense** (`SUCCEEDED`, `FAILED`) — clear that nothing follows.
- **Non-terminal states named as gerund/imperative** (`REQUIRES_ACTION`, `PROCESSING`) — clear that something's happening.
- **State names shared across card + UPI + wallet + netbanking** — merchant sees consistent contract regardless of method.

### 3.2 · Razorpay's Order → Payment split

Razorpay has both an `Order` and a `Payment` object. Order is created first, then can spawn N payment attempts. Different from Stripe's single PaymentIntent that mutates.

**PayForge choice:** stick with Stripe's PaymentIntent model — one object per attempt, retries create new intents. Simpler mental model. Retries via new `payment_intent_id`.

### 3.3 · Refund + dispute as separate objects

Both Stripe + Razorpay agree: refund is a new object with FK to payment. Dispute (chargeback) is another separate object. Never mutate the payment intent — see `txn-lifecycle.md` §5-6.

---

## 4 · Reliability patterns

### 4.1 · Idempotency everywhere (§7 of txn-lifecycle)

Stripe's classic pattern: idempotency-key header + `idempotency_keys` table + body-hash comparison. PayForge adopts.

### 4.2 · Outbox pattern

Stripe blog: they use a variant of outbox called "record then publish" backed by their internal event system. Razorpay similarly writes events via a transactional outbox.

PayForge: `outbox` table + polling worker (day-one) → Debezium CDC (Phase 11).

### 4.3 · Idempotent workers via inbox

Both companies use `event_id` unique-constraint dedup at consumer side. PayForge Phase 4-7 implements this.

### 4.4 · Smart routing across acquirers

Razorpay actively routes cards across HDFC / ICICI / Axis acquirers based on:

- BIN-specific success rates.
- Acquirer's live health.
- Cost (some acquirer contracts cheaper for certain MCCs).

**Real feature at scale.** PayForge Phase 11 or Phase 12 could implement (nice-to-have, not day-one).

### 4.5 · Circuit breakers on every external hop

Every call to a PSP / bank / network wrapped in a circuit breaker. When downstream degrades, breaker opens → fails fast → recovers gracefully.

PayForge Phase 4 wraps all mock-PSP calls in an `opossum` circuit breaker.

### 4.6 · Deadline propagation

Both Stripe + Razorpay propagate a deadline (or `Request-Timeout` header) across hops. Downstream never runs past caller's remaining budget.

PayForge adopts: HTTP header `X-Deadline-Ms` from the merchant's SDK, propagated inside the request context.

---

## 5 · Data + storage patterns

### 5.1 · Money as integer minor units + currency (from money-math §2)

Universal. Nobody uses float.

### 5.2 · UUIDs (or similar) with human-readable prefixes

`pi_1MtjqE2eZvKYlo2C9XcsSXVI` — prefix + base62-encoded content. Ids are typeable, self-documenting.

PayForge: use `pi_ULID` (ULID for sort-by-time) — same shape, faster indexes.

### 5.3 · Postgres as the source of truth

Both companies converged on Postgres for the ledger + transactional side. Kafka is for events, not truth. Redis is cache. **Postgres owns the money.**

PayForge: aligned. All financial state in Postgres. Kafka is transport. Redis is cache.

### 5.4 · Sharding by merchant_id (at scale)

Once past ~10-50M merchant events / day, sharding by merchant_id (or customer_id for retail) becomes necessary. Stripe openly discusses this.

**Not day-one for PayForge.** Phase 11+ concern.

---

## 6 · Security patterns

### 6.1 · PCI scope reduction via hosted UI

Stripe Elements (iframe) + Razorpay Standard Checkout both keep card entry on their domain. Merchant sees only tokens.

PayForge: implement a **mock hosted-checkout page** in Phase 4 to preserve the pattern even though we're simulated.

### 6.2 · API keys — publishable vs secret

- **Publishable key** — safe to embed in frontend. Used by client-side tokenization JS.
- **Secret key** — server-only. Used for capture / refund / customer creation.

PayForge Phase 3 adopts this.

### 6.3 · Webhook signature verification

HMAC-SHA256 with a shared merchant-side secret. Merchant verifies every incoming webhook.

Locked in Phase 7.

### 6.4 · Rate limiting

Per-key rate limits with 429 responses. Stripe: 100 req/s per key typical. Razorpay similar.

PayForge Phase 2+ wraps every endpoint in a Redis-backed sliding-window rate limiter.

### 6.5 · Never log secrets, PAN, or CVV

Both companies have strict log-scrubbing pipelines. Anything matching a card number regex or a secret prefix (`sk_`) gets replaced with `[REDACTED]` before logs leave the app.

PayForge Phase 1 logger config bakes this in.

---

## 7 · Observability patterns

### 7.1 · Structured JSON logs

Every log line is JSON, with correlation ids (`request_id`, `trace_id`) propagated. Both companies converged on this.

PayForge: Pino, structured, correlation-id middleware.

### 7.2 · RED metrics (Rate / Errors / Duration)

Prometheus counters + histograms per endpoint. Grafana dashboards for RED per service.

Phase 10.

### 7.3 · OpenTelemetry traces

Every request produces a trace spanning all internal calls + external hops. Jaeger UI to inspect.

Phase 10.

### 7.4 · SLOs — per-endpoint latency + availability

- Payment authorization P99 latency < 3s.
- API availability > 99.9%.
- Webhook delivery success > 99.5%.

Both companies publish SLOs internally + report against them.

Phase 10.

---

## 8 · Testing patterns

### 8.1 · Sandbox mode with test cards / VPAs

Merchants can toggle sandbox → uses fake acquirer with predictable responses:

- `4242 4242 4242 4242` → always succeeds
- `4000 0000 0000 0002` → always declines
- `4000 0000 0000 3220` → requires 3DS
- `success@razorpay` → UPI success
- `failure@razorpay` → UPI failure

**PayForge Phase 4** implements a mock PSP with a similar catalog of test identities.

### 8.2 · Contract testing (Pact)

Between services (e.g., payment engine ↔ webhook engine), contract tests catch API drift. Phase 12 (microservices) uses.

### 8.3 · Property-based tests for money math

Stripe's engineering team uses Hypothesis (Python) / fast-check (JS) for money invariants: "for all amounts a, b: `sum(a, b) == a + b`", "for all amounts a and refunds r: `net(a, r) >= 0`".

PayForge Phase 5 tests use `fast-check`.

### 8.4 · Chaos engineering

Netflix-style chaos monkey adapted for fintech: randomly kill worker pods, DB failover, network partition. Confirms outbox + inbox + saga survive.

Phase 13.

---

## 9 · Frontend patterns

### 9.1 · Merchant dashboard (Razorpay + Stripe Dashboard as references)

Both are Next.js-like SPAs consuming their own APIs:

- Payments timeline (list + filters).
- Refunds queue.
- Disputes triage.
- Settlement statements + reconciliation view.
- Webhook logs (see recent deliveries + replay).
- API key management + IP allowlist.

PayForge Phase 3 + Phase 9 build these iteratively.

### 9.2 · Realtime updates

Merchant dashboards show live txn updates via server-sent events (SSE) or websockets. Backed by the internal Kafka event bus.

Phase 9.

---

## 10 · What NOT to borrow

Some patterns from Stripe/Razorpay are only relevant at their scale — PayForge doesn't need day-one.

- **Multi-region active-active** — cross-region write replication. Overkill until multi-country.
- **Cellular architecture** (Stripe's "shards" of the app) — cost > benefit until 100M+ txns.
- **Custom-built KV stores for high-cardinality lookups** — Redis is fine.
- **In-house schema-first DB migrations** — Prisma migrations suffice.
- **Multi-currency net-settlement rails** — until we do FX, single-currency INR only.

---

## 11 · Reading list (blog posts to actually read)

**Stripe Engineering blog** (`stripe.com/blog/engineering`):
- "Online migrations at scale" — zero-downtime schema changes.
- "Designing robust and predictable APIs with idempotency"
- "Rate limiters"
- "How Stripe invests in technical infrastructure"
- "Building large-scale realtime systems"
- "Two-phase commit for high availability data replication"

**Razorpay blog + tech talks**:
- Their PA architecture at scale (multiple talks on YouTube from Razorpay engineers at HasGeek, DevOps India Summit).
- UPI stack + mandate lifecycle.
- Smart routing across acquirers.
- On-call playbook for Sev-1 incidents in payments.

**Other adjacent references**:
- Adyen's engineering blog — European PSP perspective.
- Uber's payments blog — global reconciliation at scale.
- Airbnb's payments architecture — multi-currency + escrow.
- Google Cloud's "Datastore for financial transactions" — modelling money.
- Martin Kleppmann's *Designing Data-Intensive Applications* — ch 5 (Replication), 7 (Transactions), 11 (Stream Processing).

---

## 12 · Distilled patterns PayForge WILL adopt (final list)

| Pattern | Source | Phase |
|---------|--------|-------|
| PaymentIntent 8-state model | Stripe | 4 |
| Refund + dispute as separate objects | Stripe + Razorpay | 5, 6 |
| Prefixed ids (pi_, re_, dp_, evt_, mer_) | Stripe | 3 |
| Cursor pagination | Stripe | 3 |
| Structured error object | Stripe | 3 |
| Metadata field on every resource | Stripe | 3 |
| Webhook HMAC-SHA256 signature | Stripe | 7 |
| Idempotency-Key header | Stripe | 4 |
| Outbox pattern | Both | 5 |
| Inbox pattern | Both | 5 |
| Circuit breakers on external hops | Both | 4 |
| Deadline propagation | Both | 4 |
| PCI out-of-scope via hosted UI | Stripe + Razorpay | 4 |
| Publishable + secret key split | Stripe | 3 |
| Rate limiting | Both | 2 |
| Structured JSON logs + correlation ids | Both | 1 |
| RED metrics + OpenTelemetry traces | Both | 10 |
| Sandbox mode + test identities | Both | 4 |
| Property-based tests for money | Stripe | 5 |
| Merchant dashboard + realtime updates | Both | 3, 9 |
| Ledger in Postgres, Kafka for events, Redis for cache | Both | 5 |

Every one of these becomes a Phase task or ADR when we hit that phase.

---

## 13 · What I still don't understand

- **Stripe's Terminal / physical POS** — not covered here; PayForge won't build hardware.
- **Razorpay's Smart Collect (virtual accounts)** — model unique bank-account-per-invoice for reconciliation. Interesting but out of scope day-one.
- **Multi-region deployment mechanics** — how Stripe replicates ledger cross-region without breaking append-only + immutable. Deferred to Phase 11+.
- **How Stripe / Razorpay actually implement the payment intent state machine internally** — public docs describe the API; internal implementation likely uses workflow engines (Cadence / Temporal). PayForge won't use Temporal day-one; question is when to introduce it.

**Instruction to future me:** re-read §12 (adopted patterns table) any time a new Phase starts — it's your reference to what's been decided.
