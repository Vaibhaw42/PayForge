# PayForge Roadmap

14 phases, each following the same lifecycle. Current phase is marked 🟡.

Every phase ends with a git tag `phase-N-complete` and an updated `STATUS.md` + `LEARNING_LOG.md`.

---

## Lifecycle for every phase

1. **Planning** — brainstorm scope, non-goals, learning objectives
2. **Database design** — ERD, tables, indexes, constraints
3. **API design** — endpoints, contracts, OpenAPI, error model
4. **Implementation** — code, incremental commits
5. **Testing** — unit + integration + (from Phase 4) property-based
6. **Refactoring** — pass 2 for code quality
7. **Documentation** — architecture doc, sequence diagrams, ADRs, API.md
8. **Performance review** — quick perf pass (k6 from Phase 4+)
9. **Git tag** — `phase-N-complete`
10. **Move to next phase**

## Pre-execution checklist (every phase)

- Why are we building this?
- How do real fintech companies solve it?
- Functional requirements?
- Non-functional requirements? (latency, throughput, availability, consistency, security)
- Database design?
- API contracts?
- Edge cases + failure scenarios?
- Testing strategy?
- Documentation plan?
- Review + revise before implementation

## Phases

### 🟡 Phase -1 · FinTech Fundamentals *(in progress)*

Purely domain, no code. Deliverables land in [`docs/domain/`](./docs/domain/).

- Money movement + actors (issuer, acquirer, network, PSP, gateway, aggregator, RBI, NPCI)
- Payment methods (cards, UPI focus, netbanking, wallets, EMI, BNPL)
- Transaction lifecycle (auth, capture, clearing, settlement, refund, chargeback)
- Money representation (minor units, currency, rounding, FX)
- Double-entry accounting 101
- Idempotency + reliability (at-least-once, exactly-once myth)
- Compliance map (PCI DSS, RBI PA/PG, KYC/AML, data localization)
- Reference architectures (Stripe, Razorpay engineering blogs)

### Phase 0 · Planning & Requirements

- Vision, personas, scope, non-goals
- Functional requirements (user stories)
- Non-functional requirements (latency, availability, consistency, security)
- Success metrics
- Baseline ADRs (stack, language, framework)

### Phase 1 · Foundation & Architecture *(Docker onboarding lives here)*

- Monorepo (pnpm workspaces)
- Fastify skeleton (health check, error handler, request id, logging)
- Prisma + Postgres schema baseline
- Redis + Kafka (KRaft) local via Docker Compose
- Pino structured logging
- `packages/config`, `packages/logger`, `packages/shared`, `packages/types`
- `.env.example`, config loader with Zod
- CI baseline (lint + typecheck)

### Phase 2 · Authentication & Merchant Accounts

- Merchant signup / login
- Password hashing with Argon2
- JWT access + refresh tokens
- Session/refresh rotation strategy
- Basic RBAC
- Rate limiting

### Phase 3 · Merchant Platform

- Merchant org / user model
- API keys (hashed at rest, prefix-lookup)
- Merchant dashboard scaffold (Next.js)
- Webhook endpoint config UI

### Phase 4 · Payment Engine

- Payment intents (create, confirm, cancel)
- State machine (pending → authorized → captured → settled)
- Idempotency keys
- Mock PSP connector
- Retries, timeouts, circuit breaker basics

### Phase 5 · Double-Entry Ledger

- Chart of accounts
- Journal entries (immutable postings)
- Debit/credit invariants
- Balance queries
- Reconciliation basics

### Phase 6 · Settlement Engine

- Batch cutoffs
- Payout scheduling
- Holds and reserves
- Settlement file generation
- Merchant statement

### Phase 7 · Webhook Engine

- Signed HMAC delivery
- Retry with exponential backoff + jitter
- Dead-letter queue
- Replay UI
- At-least-once semantics + consumer idempotency guidance

### Phase 8 · Fraud Detection

- Rules engine (velocity, geo, BIN, amount)
- Risk scoring
- Blocklists / allowlists
- Review queue

### Phase 9 · Analytics Dashboard

- Merchant-facing analytics (volume, success rate, latency, MDR)
- Recharts
- Materialized views for aggregations

### Phase 10 · Observability

- Prometheus metrics (RED + USE)
- Grafana dashboards
- OpenTelemetry traces → Jaeger
- Structured Pino logs with trace correlation
- SLO/SLI definitions

### Phase 11 · Performance Optimization

- k6 load tests
- Postgres index tuning + `EXPLAIN ANALYZE`
- Redis caching strategy
- N+1 hunt
- Connection pooling (pgbouncer)

### Phase 12 · Microservice Extraction

- Split payment / ledger / settlement / webhook services
- Kafka event choreography
- Contract testing (Pact)
- Service topology diagram

### Phase 13 · Production Readiness

- CI/CD pipelines
- Secrets management
- Backups + PITR
- Disaster recovery drill
- Runbooks + on-call docs
- Security review + threat model
- Chaos tests (fault injection)
