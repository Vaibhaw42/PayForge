# ADR-0005 · Data plane = Postgres 17 + Redis 7 + Kafka (KRaft)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Fintech data plane needs: source-of-truth (ACID), cache, and event bus. Each choice affects invariants like immutability, ordering, and dedup.

## Decision

**Postgres 17** — the source of truth for all financial state (payment_intents, ledger, mandates, refunds, disputes, outbox, inbox).
- Reasons: append-only ledger, deferrable constraint triggers, jsonb + strong typing, mature replication + PITR story.

**Redis 7** — cache + rate limit + session store.
- Reasons: sub-ms latency, Lua scripts for atomic rate-limit windows, ephemeral by design.

**Kafka (KRaft mode)** — internal event bus for domain events.
- Reasons: partition-ordered delivery (needed for state-machine transitions of a payment), Vaibhaw's daily-use signal, EOS-within-Kafka boundary.
- KRaft (no Zookeeper) — simpler dev setup for Docker Compose.

## Consequences

Good:
- **Postgres owns the money.** Kafka is transport, Redis is cache. Clear separation.
- Kafka's per-partition ordering matches our state-machine needs (partition by `payment_intent_id`).
- All three self-hostable via Docker Compose (aligns with roadmap Ground Rule #1).

Bad:
- Three moving parts in local dev — mitigated by docker-compose bootstrap in Phase 1.
- Kafka is heavy relative to NATS or Redis Streams for our real load, but the learning value + industry-standard alignment justifies it.

## References
- `docs/domain/idempotency.md` §2, §4, §5 — delivery guarantees, outbox, inbox.
- `docs/domain/ledger-101.md` §6 — invariants Postgres must enforce.
