# idempotency.md — Idempotency, Reliability, Delivery Semantics

> Phase -1 · Day 5 deliverable. Deep-dive beyond `txn-lifecycle.md` §7-8. Locks the patterns PayForge will use in Phase 4 (Payment Engine), Phase 5 (Ledger), Phase 7 (Webhook Engine), Phase 12 (Microservices).

Every reliability pattern here is a **response to distributed-system failure modes** — not academic. Bugs in these patterns show up as double charges, lost payments, stuck webhooks, and ledger drift.

---

## 1 · Reliability first-principles

### 1.1 · 8 fallacies of distributed computing (Deutsch, 1994)

Every fintech bug traces back to one:

1. The network is reliable — packets drop, connections reset, DNS lies.
2. Latency is zero — every hop adds time.
3. Bandwidth is infinite — burst traffic saturates links.
4. The network is secure — MITM, spoofed webhooks, forged HMACs.
5. Topology doesn't change — Kafka rebalance, DB failover, k8s pod eviction.
6. There is one administrator — different teams push infra concurrently.
7. Transport cost is zero — every message costs CPU, memory, and money.
8. The network is homogeneous — ISP quirks, IPv6 gaps, mobile carriers.

**PayForge assumes all 8 will violate.**

### 1.2 · Node failure taxonomy

| Failure | Definition | Detection |
|---------|-----------|-----------|
| **Fail-stop** | Node stops responding, never returns | Timeout |
| **Byzantine** | Node responds with corrupt/malicious data | Signatures, checksums |
| **Slow / partial** | Responds but with delays or dropped requests | Latency SLOs |

**Design rule:** always assume a node may have processed your request but crashed before responding. That's the entire justification for idempotency.

### 1.3 · The two-generals problem — why exactly-once is a myth

Two generals on opposite hills need to coordinate an attack via a valley where messages can be intercepted.

- A sends "attack at dawn" → arrives?
- A needs ACK from B.
- B sends ACK → arrives?
- B needs ACK-of-ACK.
- Infinite regress. **No finite protocol guarantees coordinated action.**

**Consequence for payments:** you can never be 100% sure "did the customer's bank debit or not?" via a single message. Settle for **at-least-once + idempotency** — deliver 1+ times, receiver dedupes.

**"Exactly-once" = at-least-once + idempotent receiver.** Not a delivery mode.

### 1.4 · Failure modes PayForge defends against

| Failure | Where | Defense |
|---------|-------|---------|
| Merchant client retries after timeout | Merchant → PayForge | Idempotency key |
| PSP webhook redelivery | PSP → PayForge | Event-id dedup (inbox) |
| Kafka duplicate delivery | Internal event bus | Idempotent consumer + inbox pattern |
| Merchant server slow on webhook | PayForge → Merchant | Async delivery + retry + DLQ |
| DB commit + Kafka publish not atomic | PayForge internal | **Outbox pattern** |
| Network partition mid-payment | Any layer | Saga with compensating actions |
| Merchant crashes mid-request | Merchant → PayForge | Idempotency key + poll |
| PayForge crashes mid-request | Internal | State persisted at every step |



---

## 2 · Delivery guarantees

### 2.1 · Three delivery modes

| Mode | Description | Use in payments |
|------|-------------|-----------------|
| **At-most-once** | Fire and forget; may lose messages | Telemetry, logs — never money |
| **At-least-once** | Retries until ACK; may duplicate | **Every payment path** |
| **Exactly-once (theoretical)** | Perfect coordination — impossible without idempotency | Real-world: at-least-once + idempotent receiver |

### 2.2 · Kafka EOS — real but scoped

Kafka since 0.11 has **Exactly-Once Semantics (EOS)** via transactional producer + `isolation.level=read_committed` consumer. Guarantee:

- Producer writes to Kafka topic(s) atomically.
- Consumer reads only committed txns.
- Duplicates prevented **within the Kafka boundary**.

**But EOS doesn't cross the boundary.** The moment you write to Postgres or call HTTP, you're back to at-least-once — the DB write must still be idempotent. That is exactly why Outbox and Inbox patterns exist.

### 2.3 · Practical delivery matrix — every PayForge path

| Path | Guarantee |
|------|-----------|
| Merchant HTTP → PayForge | at-least-once |
| PayForge HTTP → PSP | at-least-once |
| PSP webhook → PayForge | at-least-once |
| PayForge internal Kafka | at-least-once (EOS-scoped inside topic) |
| PayForge webhook → Merchant | at-least-once |
| DB write inside a txn | exactly-once (per DB txn only) |

**Rule:** everything outside a single DB transaction is at-least-once. Design consumers assuming duplicates.

### 2.4 · "Effectively-once" via idempotency

Industry-standard phrasing: **effect happens exactly once**, even though delivery is at-least-once. Achieved by:

1. Sender assigns a stable unique id (event_id, idempotency_key).
2. Receiver stores processed ids.
3. On duplicate → recognizes → skips (returns cached response).

### 2.5 · Ordering guarantees

- **Unordered** — messages may arrive in any order (SQS default).
- **Per-partition ordered** — Kafka's default within a partition.
- **Global ordered** — every message across topic in strict order (rare, expensive).

**Rule for PayForge:**
- Anything that needs strict ordering for the SAME entity → same partition. Partition key = `payment_intent_id` for payment events, `merchant_id` for merchant events.
- Kafka producer MUST have `enable.idempotence=true` — preserves order across producer retries.
- Consumer processes sequentially per partition — multi-threaded within partition = reorder risk.
- **Cross-partition ordering has no guarantee.**

### 2.6 · The read-your-writes trap

Sender writes to DB primary → publishes event to Kafka → consumer reads from DB replica. **Replica lag** = consumer sees stale data → double-processes or misses.

Defenses:
- Read from primary (slow, doesn't scale).
- Include full state in the event (event carries what consumer needs — no re-query).
- Version stamp in event; consumer waits until DB catches up.



---

## 3 · Idempotency deep-dive

### 3.1 · Two types of idempotency

- **Type A — HTTP endpoint idempotency** (covered in `txn-lifecycle` §7). Client sends `Idempotency-Key` header. Server dedupes by key + body hash. Returns cached response on duplicate. Scope: one HTTP request.
- **Type B — Message consumer idempotency** (this doc). Consumer dedupes by message's `event_id` before processing. Scope: one event.

Same principle (dedupe by unique key), different transport layers.

### 3.2 · Three flavours of idempotent operations

- **Natural** — the operation IS idempotent by nature. `UPDATE payment_intents SET state='SUCCEEDED' WHERE id=?`. Running twice = same final state.
- **Guarded** — operation has side effects; a guard check makes repeats safe. `INSERT ... ON CONFLICT DO NOTHING`.
- **Ledger-idempotence** — cannot naturally repeat (posting twice = double credit). Use event-id dedup table as a guard.

For PayForge:
- State updates → natural.
- Ledger postings → guarded via `journal_entries.event_id` unique.
- Webhook dispatch → guarded via `webhook_deliveries.event_id` unique.

### 3.3 · Idempotency scope levels

| Layer | Dedup granularity | Best for |
|-------|-------------------|----------|
| Request-level (HTTP) | Per HTTP request (idempotency-key) | External API endpoints |
| Event-level (queue) | Per message (event_id) | Kafka, webhooks |
| Business-key-level | Per business entity (payment_intent_id) | Preventing "one txn twice" from any source |

PayForge uses all three.

### 3.4 · The compare-and-set pattern for state transitions

Replace `SELECT then UPDATE` (races) with `UPDATE ... WHERE ... RETURNING`:

```ts
async function markAsSucceeded(intentId: string) {
  const result = await db.query(
    `UPDATE payment_intents
       SET state = 'SUCCEEDED', updated_at = now()
     WHERE id = $1 AND state = 'PROCESSING'
     RETURNING *`,
    [intentId]
  )

  if (!result.rowCount) {
    // No update: either already succeeded (idempotent replay) OR wrong state
    const current = await db.oneOrNone('SELECT state FROM payment_intents WHERE id = $1', [intentId])
    if (current?.state === 'SUCCEEDED') return current   // silent replay
    throw new IllegalStateTransition(current?.state, 'SUCCEEDED')
  }
  return result.rows[0]
}
```

Trick: the WHERE clause enforces both the row AND the source state atomically.

### 3.5 · Idempotency guards live in the DB, not memory

Wrong — in-memory `Set`:

```ts
const seen = new Set()
function handle(event) {
  if (seen.has(event.id)) return
  seen.add(event.id)
  process(event)
}
```

Restart → `seen` empty → duplicates re-process.

Right — DB-level:

```ts
async function handle(event) {
  await db.transaction(async tx => {
    const inserted = await tx.query(
      `INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
      [event.id]
    )
    if (inserted.rowCount === 0) return  // already processed
    await process(event, tx)
  })
}
```

Insert-and-process in ONE transaction — atomic.



---

## 4 · The Outbox Pattern

### 4.1 · The problem

Naïve approach:

```ts
await db.insert('payment_intents', {...})   // step 1
await kafka.publish('payments', event)       // step 2
```

Failure modes:

- Step 1 succeeds, step 2 fails → DB has it, downstream doesn't. Silent drift.
- Step 1 fails, step 2 succeeds → phantom event referencing non-existent DB row.
- Both fail after retry → duplicate record and duplicate event.

Without atomicity, drift **will** happen — question is when.

### 4.2 · The solution — write the event to an outbox table inside the same DB txn

```sql
create table outbox (
  id            bigserial primary key,
  event_id      uuid not null unique,
  topic         text not null,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  attempts      int not null default 0,
  last_error    text
);

create index on outbox (published_at) where published_at is null;
```

Business write (atomic):

```sql
BEGIN;
  INSERT INTO payment_intents (id, state, amount_minor, ...) VALUES (...);
  INSERT INTO outbox (event_id, topic, payload) VALUES ($1, 'payments', $2);
COMMIT;
```

Both atomic → either both, or neither.

### 4.3 · The outbox publisher (separate worker)

```ts
async function outboxWorker() {
  while (true) {
    const rows = await db.query(`
      SELECT * FROM outbox
       WHERE published_at IS NULL
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 100
    `)

    for (const row of rows) {
      try {
        await kafka.publish(row.topic, { id: row.event_id, ...row.payload })
        await db.query('UPDATE outbox SET published_at = now() WHERE id = $1', [row.id])
      } catch (err) {
        await db.query(
          'UPDATE outbox SET attempts = attempts + 1, last_error = $1 WHERE id = $2',
          [err.message, row.id]
        )
      }
    }
    await sleep(200)
  }
}
```

`FOR UPDATE SKIP LOCKED` = multiple workers process disjoint batches concurrently, no blocking. Publisher may publish twice (rare) → consumers dedupe via inbox → no harm.

### 4.4 · CDC-based outbox (production-grade)

Instead of polling, use **Debezium** to tail Postgres WAL → auto-publishes changes to Kafka in real time. Sub-millisecond latency. Standard in fintech at scale. PayForge day-one: polling; Phase 11: CDC.

### 4.5 · Why outbox beats 2PC

Two-Phase Commit was the classic answer. Slow (network round-trips), brittle (coordinator crash = stuck locks), doesn't scale. Outbox trades atomic-across for eventually-consistent — DB commit is authoritative, Kafka catches up in seconds. Correct tradeoff for payments.



---

## 5 · The Inbox Pattern

### 5.1 · Dual of outbox — read side

Outbox = write side. Inbox = read side. Consumer dedupes by `event_id` before processing.

```sql
create table inbox (
  event_id      uuid primary key,
  source        text not null,           -- 'psp_webhook' | 'internal_kafka' | ...
  received_at   timestamptz not null default now(),
  payload       jsonb not null,
  processed_at  timestamptz,
  attempts      int not null default 0
);
```

### 5.2 · Consumer flow

```ts
async function handleEvent(event) {
  await db.transaction(async tx => {
    const inserted = await tx.query(
      `INSERT INTO inbox (event_id, source, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.source, event]
    )

    if (inserted.rowCount === 0) return  // duplicate — silent skip

    await processEvent(event, tx)   // process in SAME transaction

    await tx.query('UPDATE inbox SET processed_at = now() WHERE event_id = $1', [event.id])
  })
}
```

Guarantees:

- Duplicate event → INSERT no-ops → silent skip.
- Processing crash mid-txn → whole txn rolls back → event redelivered → processes cleanly next time.
- Multiple workers concurrent on same event → DB unique constraint arbitrates.

### 5.3 · Why `ON CONFLICT DO NOTHING` beats `SELECT then INSERT`

`SELECT then INSERT` is two operations. Two concurrent handlers both SELECT → both see "not exists" → both INSERT → both process. Race.

`INSERT ... ON CONFLICT DO NOTHING` is one atomic op enforced by the unique-index B-tree. First wins, second silently no-ops. Requires a `UNIQUE` (or PRIMARY KEY) on `event_id`.

Same idea across DBs: `INSERT ... ON CONFLICT` (Postgres), `INSERT IGNORE` (MySQL), `MERGE` (SQL Server).

### 5.4 · Outbox + Inbox together — the industrial recipe

Event flowing `Service A → Kafka → Service B`:

```
Service A:
  DB commit + outbox row (atomic)
     ↓
  Outbox worker publishes to Kafka
     ↓
Service B:
  Kafka delivers (at-least-once)
     ↓
  Inbox insert + process (atomic)
```

Even if outbox publishes twice and Kafka delivers twice, Service B's inbox dedupes → effect happens exactly once. **This is the industrial-strength "effectively-once" recipe.** Every fintech uses some variant.



---

## 6 · Retry policies (production-grade)

### 6.1 · The retry decision matrix

`txn-lifecycle` §8 covered the basics. Adding production-grade nuances:

| Failure type | Retry? | Strategy | Notes |
|--------------|--------|----------|-------|
| Network timeout | Yes | Exp backoff + jitter | Ensure idempotency key |
| 5xx (server error) | Yes | Exp backoff + jitter, cap ~3 attempts | |
| 4xx (client error) | No | Fix input | 429 (rate limit) → back off + retry with jitter |
| 401/403 (auth) | No | Refresh token, then retry once | |
| Explicit terminal FAILED (hard) | No | Show error to user | |
| Explicit terminal FAILED (soft) | Yes | Smart-route or exp backoff | |
| PROCESSING / DEEMED_APPROVE | **No — poll instead** | | |

### 6.2 · Exponential backoff variants

```
attempt 0: base * random(0.5, 1.5)              # equal jitter
attempt 1: base * 2 * random(0.5, 1.5)
attempt 2: base * 4 * random(0.5, 1.5)
attempt n: min(cap, base * 2^n) * random(0.5, 1.5)
```

**"Full jitter" (AWS-recommended):**

```
delay = random(0, min(cap, base * 2^n))
```

Full jitter distributes retries more evenly across time — better for very high scale.

### 6.3 · Retry budget

Retries live inside two envelopes:

- **Max attempts** — 3-5 for interactive, 10-20 for background webhook delivery.
- **Deadline** — total wall-clock. Interactive: 30 s. Webhook delivery: 24-72 h.

**When both exhausted → route to DLQ** (Section 7). Never silently give up.

### 6.4 · Retry storm prevention

Simple retries multiply load during outages (see `txn-lifecycle` §8.8). Real defenses:

- **Circuit breakers** — cut off retries when failure rate > threshold.
- **Adaptive retries** — reduce retry count as observed error rate rises.
- **Retry budget windows** — cap total retries across all clients per time window (server-side "no more than X retries per second").
- **Deadline propagation** — every hop respects the caller's remaining time budget. If caller has 5 s left, downstream doesn't retry for 10 s.

### 6.5 · Timeouts at every layer

Deadline = `now() + budget`. Every downstream call must have a timeout **≤ remaining budget** — never a fixed timeout.

**Wrong:**

```ts
const resp = await psp.charge(req, { timeout: 30_000 })  // fixed 30s
```

**Right:**

```ts
const deadline = req.deadline
const remaining = deadline - Date.now()
if (remaining <= 0) throw new DeadlineExceeded()
const resp = await psp.charge(req, { timeout: Math.min(20_000, remaining) })
```



---

## 7 · Dead Letter Queue (DLQ) design

### 7.1 · What DLQ is

A DLQ is the **final destination for messages that failed all retries**. Instead of dropping (silent loss) or looping forever (retry storm), the message parks in the DLQ for human review.

### 7.2 · Schema

```sql
create table dlq_events (
  id                    uuid primary key,
  event_id              uuid not null,
  source                text not null,      -- 'psp_webhook' | 'internal_kafka' | ...
  original_payload      jsonb not null,
  first_failed_at       timestamptz not null,
  last_failed_at        timestamptz not null,
  attempts              int not null,
  errors                jsonb not null,     -- array of error objects
  status                text not null,      -- 'awaiting_triage' | 'requeued' | 'discarded'
  triage_notes          text
);
```

### 7.3 · Rules

- **Every retry-exhausted message MUST land in DLQ.** Never silently drop.
- DLQ is **paged / alerted** to on-call. Growing DLQ = incident.
- Triage tool allows: **inspect**, **re-queue** (send back for retry), **discard** (with reason), **replay** (send to a special replay topic for repair processing).
- DLQ items retain full payload + all error history — nothing lost.

### 7.4 · Common DLQ patterns

**Kafka native DLQ:**
```
main_topic → consumer → on failure → dlq_topic
```
Consumer group's `error.topic` config OR explicit publish on catch.

**PayForge webhook DLQ:**
- Merchant webhook fails 15 retries over 24h → move to `dlq_webhook_deliveries` table.
- Dashboard shows pending DLQ items per merchant.
- Merchant can manually replay from dashboard.



---

## 8 · Saga pattern — coordinating across services

### 8.1 · The problem

A payment flow may touch **multiple services**: payment engine → ledger → fraud → webhook. Each has its own DB. Cannot use a DB transaction across them.

If step 3 fails, how do you undo steps 1 and 2?

### 8.2 · Saga = a sequence of local transactions, each with a compensating action

**Forward direction:**

```
T1: Reserve payment intent
T2: Post ledger entry
T3: Run fraud check
T4: Emit webhook
```

**Compensations (reverse direction if any step fails):**

```
C1: Release payment intent reservation
C2: Post reversing ledger entry
C3: Skip (fraud check has no undoable effect)
C4: Cancel webhook (or emit reversal webhook)
```

If step T3 fails, execute C2, C1 in order → system returns to consistent state.

### 8.3 · Two saga coordination styles

**Choreography** (event-driven, decentralised):
- Each service listens to events, decides its next action.
- No central coordinator.
- Emergent behavior; harder to reason about.

**Orchestration** (central coordinator):
- A saga orchestrator service tracks state machine of the whole flow.
- Calls each service in sequence, handles compensations.
- Easier to reason about; single point of coordination logic.

PayForge Phase 12 (Microservice Extraction) will pick one — probably **orchestration for critical payment flows** (simpler), choreography for downstream fanout (webhook + analytics).

### 8.4 · Sagas are NOT transactions

- **No isolation** — other observers see partial states.
- **No atomicity** — compensation is a best-effort reverse; may itself fail.
- Design assuming intermediate states are visible.

### 8.5 · When you don't need saga

If your entire flow can commit in one DB transaction (e.g., ledger + payment_intent in same Postgres), **use a DB transaction**. Sagas are only for cross-service or cross-datastore flows.

PayForge day-one is a monolith — DB transactions cover most flows. Sagas relevant when we extract services in Phase 12.



---

## 9 · Choreography vs Orchestration — the tradeoffs

| Aspect | Choreography | Orchestration |
|--------|--------------|----------------|
| Coordinator | None (event-driven) | Central saga service |
| Coupling | Loose | Tighter (services know orchestrator) |
| Visibility | Distributed logs / tracing to understand flow | One place shows the full state |
| Failure handling | Each service must handle its own compensation | Orchestrator triggers compensations |
| Adding a step | Publish new event; new subscriber consumes | Update orchestrator's state machine |
| Debugging | Hard — flow implicit in event graph | Easier — flow explicit in orchestrator |
| Best for | Fanout, analytics, downstream projections | Critical business flows (payments) |

**PayForge's future split (Phase 12):**

- Payment intent state machine → **orchestration** (explicit, auditable).
- Webhook delivery, analytics, notifications → **choreography** (event-driven, loose).



---

## 10 · Common reliability bugs

Bugs I want burned into instinct before Phase 4.

### 10.1 · Missing outbox = event drift

Direct `kafka.publish()` after DB commit. Kafka down → event lost → downstream never learns. **Fix: outbox pattern.**

### 10.2 · Missing inbox = duplicate processing

Consumer processes event on every delivery → double debit / double ledger post. **Fix: inbox with `event_id` unique.**

### 10.3 · In-memory dedup

`Set<eventId>()` cache resets on process restart. Duplicates slip through. **Fix: DB-backed dedup table.**

### 10.4 · SELECT then INSERT for dedup

Race. Two threads both see "not exists" → both insert. **Fix: `INSERT ... ON CONFLICT DO NOTHING`.**

### 10.5 · Retry without idempotency key

Merchant's client SDK retries a `POST /payments` without setting the key → double charge. **Fix: SDK auto-generates and sets `Idempotency-Key` on every request.**

### 10.6 · Retry on non-terminal states

Retrying PROCESSING or DEEMED_APPROVE risks double execution. **Fix: poll status API, don't retry write.**

### 10.7 · Blocking retry (no jitter)

1000 clients retry at exactly 1s, 2s, 4s → synchronized spikes crush upstream. **Fix: exponential backoff + jitter.**

### 10.8 · Fixed timeouts

Downstream timeout > remaining request budget → context cancelled by caller, but downstream still runs → wasted work + no response. **Fix: deadline propagation.**

### 10.9 · Silent DLQ drain

DLQ fills up, no alerts, ops finds ₹10L of stuck events 2 weeks later. **Fix: DLQ item = page on-call, dashboard tile visible.**

### 10.10 · Cross-service DB txn

Trying to make a DB txn span two services → hangs, deadlocks, or reads phantom data. **Fix: saga with compensations.**

### 10.11 · Non-idempotent consumer of at-least-once queue

Consumer written assuming exactly-once → duplicate delivery breaks it. **Fix: assume duplicates; design idempotent.**

### 10.12 · No `enable.idempotence=true` on Kafka producer

Retries by producer can reorder messages within a partition → state-machine transitions applied out of order. **Fix: enable idempotent producer.**

### 10.13 · Reading from replica mid-flow

Publish event referencing a row you just wrote → consumer reads replica before replication catches up → phantom read. **Fix: include state in the event OR wait for replication OR read from primary.**

### 10.14 · Not deduplicating after DLQ replay

Replayed DLQ event has same `event_id` → inbox skips it (good). But if replay strategy assigns a NEW event_id, dedup fails and event double-processes. **Fix: preserve original event_id across replays.**

### 10.15 · Confusing exactly-once with idempotent

Team says "we have exactly-once via Kafka" and skips inbox dedup on DB writes. Downstream duplicates leak in via other paths (webhook retries, etc.). **Fix: assume at-least-once everywhere; idempotent consumers everywhere.**



---

## 11 · What I still don't understand

Vaibhaw to fill honestly. Candidate gaps:

- **Outbox row cleanup** — outbox table grows unbounded. When can I safely DELETE published rows? What's the retention policy?
- **CDC (Debezium) tradeoffs** — for Phase 11, should PayForge switch to CDC-based outbox? What breaks?
- **Saga orchestrator implementation** — libraries in Node? Or roll our own state machine?
- **Deadline propagation across HTTP + Kafka** — how does the deadline travel? Headers? Payload metadata?
- **Kafka producer configs I need to remember** — `enable.idempotence`, `acks=all`, `max.in.flight.requests.per.connection`, `retries`. What are the safe defaults?
- **Handling poison messages in DLQ** — event that literally cannot be processed. Manual triage flow?
- **Replay safety** — replaying a DLQ event with the original event_id — inbox dedupes it → skips. But what if we WANT the replay to process (previous attempt truly failed pre-inbox-insert)? How do I distinguish?

**Instruction to future me:** re-read §4 (outbox) + §5 (inbox) + §6.5 (deadline propagation) + §10 (bugs) before writing any Phase 4 / Phase 7 code.

