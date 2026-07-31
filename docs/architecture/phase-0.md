# Phase 0 · Planning & Requirements

> Product spec + architecture baseline for PayForge. Locks scope, non-goals, personas, success metrics, and functional + non-functional requirements before code.
>
> Governing constraint: [ADR-0001](../decisions/ADR-0001-simulate-pa-no-real-money.md).

---

## 1 · Vision

**PayForge is a self-hosted, open-source payment platform built by one engineer to master fintech backend engineering by simulating a fully-licensed Indian Payment Aggregator end-to-end. It also stands as a reference architecture — other engineers can fork the repo, read the ADRs and domain docs, and learn how the pieces of a real Indian PA fit together.**

### 1.1 · What this vision commits us to

- **Learning-first** — every decision is documented, every line understood, no black boxes.
- **Reference-architecture-worthy** — the repo must be readable by another engineer with fintech interest and give them a working mental model.
- **India-first, extensible** — INR + UPI + RBI as day-one primary, but architecture must not preclude multi-currency, cross-border, or other jurisdictions in later phases.
- **Full depth** — 14-phase roadmap at real production-grade depth. Estimated ~9 months at 2-3 hr/day.
- **Simulated PA** — per [ADR-0001](../decisions/ADR-0001-simulate-pa-no-real-money.md), no real money, no real regulatory approvals; every other engineering concern production-grade.
- **Open-source, portfolio-quality** — public GitHub, MIT license, defensible in interviews and adjacent-domain conversations.

### 1.2 · Vision explicitly NOT

- **Not a business** — no revenue, no real customers, no paid support.
- **Not a fork-and-launch-your-fintech kit** — going real requires PA license, PCI Level 1 audit, sponsor bank agreements, legal counsel that this repo does not replace.
- **Not a tutorial** — deep, opinionated, unforgiving; assumes reader has TS/Node + Postgres + Kafka comfort.
- **Not vendor-locked** — no proprietary managed services; every dependency self-hostable via Docker Compose.

---

## 2 · Personas

### 2.1 · Day-one personas (Phase 1-9)

**P1 · Merchant (primary user)**

- Segment: mid-market e-commerce (10–50 employees). Has a dev team; uses APIs; wants a dashboard.
- Needs: fast onboarding, KYC done digitally, sandbox for testing, production activation, live txn view, payout schedule visible, refunds one-click, dispute tracking, monthly settlement reports.
- Signup mode: self-serve via web form → internal ops reviews KYC → activation.
- Pain points if underserved: unclear txn state, delayed payouts, no refund control, dispute confusion.

**P2 · Customer / Payer (indirect user)**

- Encounters PayForge only via a merchant's checkout — never signs up directly.
- Needs: fast checkout (< 30 s), no card detail typing (hosted UI or intent-based UPI), clear success/failure feedback, refund visible in own bank statement within promised window.
- We design the checkout UX; customer is the beneficiary; identity is bound to their bank/card.

**P3 · PayForge Ops (internal operator)**

- Role: KYC reviewer, disputes triager, reconciliation investigator, SLO monitor, DLQ triager, fraud escalation.
- Needs: internal admin UI (Phase 3 scaffold, expanded through Phase 10), read-only + destructive-action guardrails, audit trail on every action, escalation runbook.
- Distinct security posture from merchant — role-based access, IP allowlist, no external API exposure.

### 2.2 · Later personas (Phase 8+, in priority order)

**P4 · Developer (merchant's integration engineer)** — Phase 3+
- Reads API docs, embeds client-side JS SDK, calls REST endpoints, handles webhook signatures.
- Needs: clear reference docs, code samples, sandbox environment, error taxonomy, changelog.
- Persona activates when Phase 3 (Merchant Platform) ships API keys + hosted checkout SDK.

**P5 · Fraud analyst** — Phase 8+
- Tunes rules, reviews risk-scored txns, decides accept/reject/manual-review.
- Needs: review queue UI, rule editor, cohort analysis, historic query.
- Activates with Phase 8 Fraud Detection.

**P6 · Auditor / Compliance officer** — Phase 10+
- External RBI auditor, GST officer, external QSA, merchant's CA.
- Needs: read-only access to reconciliation reports, immutable ledger, retention-compliant records, export APIs.
- Activates with Phase 10 observability + full retention wiring.

### 2.3 · Explicitly not day-one

- BNPL lender partner interface — out of scope per ADR-0001 (no NBFC license).
- Insurance / MF distribution partners — out of scope (no IRDAI / SEBI).
- Cross-border PSP partners — Phase 12+ only if we ever add PA-CB flows.

---

## 3 · Scope & non-goals

### 3.1 · In-scope (14-phase roadmap)

**Money movement:**
- Payment intent lifecycle (auth → capture → settle → refund → dispute)
- Card + UPI (day-one)
- Netbanking + wallets + EMI + BNPL as later methods (Phase 7+)
- Full + partial refunds
- Chargebacks / disputes

**Merchant-facing:**
- Merchant signup + KYC (simulated verification, real-shape flow)
- Merchant dashboard (Next.js + Tailwind + shadcn/ui)
- API keys (publishable + secret)
- Webhook config + signature verification
- Sandbox mode with test cards + test VPAs
- Settlement statements
- Refund initiation + dispute triage UI

**Internal platform:**
- Double-entry ledger + reconciliation
- Settlement engine (batching, cutoffs, payouts)
- Webhook engine (signed delivery, retries, DLQ, replay)
- Fraud detection (rules engine — day-one)
- Analytics dashboard
- Observability (Prometheus, Grafana, OpenTelemetry, Jaeger)
- Performance optimization + load tests (k6)
- Microservice extraction (Phase 12)
- CI/CD, runbooks, DR docs

### 3.2 · Explicit non-goals (never build)

- **Real money** — mock PSP only; no live acquirer / bank connections. ADR-0001.
- **PPI / wallet issuance** — needs RBI PPI license.
- **Credit issuance / BNPL underwriting** — needs NBFC license; if a BNPL flow is simulated, we mock the NBFC decision.
- **Insurance, mutual funds, gold distribution** — needs IRDAI / SEBI.
- **Cross-border remittance** — FEMA scope.
- **Card issuance** — banking + network membership required.
- **UPI-PSP interface as our own** — needs to BE a scheduled bank.
- **Native mobile apps (iOS / Android / React Native / Flutter)** — web-first; responsive is enough.
- **Multi-region active-active deployment** — India single-region, DR-ready but not active-active.
- **Multi-tenant white-label PA-as-a-service** — this is one PA, not a platform-of-platforms.
- **Hardware POS terminals** — software only.
- **Feature-phone (UPI 123Pay)** — architecturally aware but not built.
- **Compliance filing UI** — we generate report data but do not build an RBI-submission portal.

### 3.3 · Deferred scope (in-scope conceptually, later)

Explicit **priority order** on what we actually try to reach:

1. **★ Advanced ML fraud detection** — Phase 11+ elevated. Vaibhaw explicitly wants this. Baseline in Phase 8 is a rules engine; ML lands as an add-on on top of it once fraud events accumulate for training data.
2. **International UPI corridors** — Phase 12+ if we get there.
3. **Cross-currency FX** — Phase 12+ if extended.
4. **Public developer portal + docs website** — Phase 13+.
5. **Real production deploy** — Phase 13 makes it deploy-ready; actually running is a separate decision.

### 3.4 · Scope-change protocol

Any addition or removal from §3.1 / §3.2 requires:

- A new ADR proposing the change with rationale.
- Update of the roadmap and phase estimates.
- Reason recorded in `LEARNING_LOG.md`.

This is a solo project, but the discipline matters for the reference-architecture use case — future readers must see why scope moved.

---

## 4 · Success metrics

Five top-level metrics. Traditional business KPIs (revenue, DAU) don't apply — PayForge is a learning + reference-architecture project, not a business.

### M1 · Phase-completion rate

- All 14 phases shipped in ≤ **9 months** (target) from Phase-1 completion.
- Each phase = full lifecycle: plan → DB → API → impl → tests → docs → perf → git tag.
- Missed a phase deadline = revisit scope, don't lower quality.

### M2 · Ledger integrity

- Reconciliation drift = **0 rupees** at every EOD reconcile job.
- Any non-zero drift = **incident-grade bug** — halt current phase, root-cause, fix.
- Enforced via automated test in CI + EOD job in production simulation.

### M3 · Test coverage on money-touching code

- **≥ 90%** coverage on:
  - `packages/database/ledger/*`
  - `apps/backend/payment-engine/*`
  - `apps/backend/settlement/*`
- Coverage measured via Vitest + reported in CI.
- Non-money code (dashboard UI, docs site) has no coverage floor.

### M4 · Documentation completeness — CONCISE, not encyclopedic

- Every phase has: `architecture/phase-N.md` + relevant ADRs + runbook from Phase 10 onward.
- Every non-obvious decision has an ADR.
- **Docs are BRIEF and specific.** No treatises. Learning-topic notes go in `LEARNING_LOG.md` tightly (~10-20 lines per topic, not 100+). Recap docs bullet-point mental models, not narrative essays.
- If a doc exceeds ~2 screens of scroll without adding new information, cut it.

### M5 · Cold-read test — self-attested

- **Every 3 phases**, Vaibhaw self-attests: "if I opened this repo today for the first time, could I orient in 5 minutes from `AGENTS.md` + `STATUS.md` + recap docs?"
- No external tester required.
- Recorded as a checkpoint entry in `LEARNING_LOG.md`.

### 4.1 · What is explicitly NOT a top-5 metric

- **Load test targets** (P99 latency, throughput) — phase-internal to Phase 11, not top-level.
- **Uptime** — meaningless without real traffic; phase-internal to Phase 10.
- **DLQ size, error rate** — phase-internal to Phase 10.
- **GitHub stars / external portfolio signal** — nice, not chased.

### 4.2 · Timeline (M1 breakdown)

Rough allocation across 9 months, 2-3 hr/day:

| Months | Phase(s) | Focus |
|--------|----------|-------|
| M1 | 0 + 1 | Planning + foundation + Docker |
| M2 | 2 + 3 | Auth + merchant platform |
| M3 | 4 | Payment engine |
| M4 | 5 | Double-entry ledger |
| M5 | 6 + 7 | Settlement + webhook |
| M6 | 8 + 9 | Fraud + analytics |
| M7 | 10 | Observability |
| M8 | 11 + 12 | Perf + microservices |
| M9 | 13 | Production readiness |

Slips allowed but tracked — each slip forces a scope review, never a quality cut.

---

## 5 · Functional requirements

Grouped by phase. Terse — one bullet per feature; expanded specs live in each phase's own `architecture/phase-N.md` when we get there.

**MVP cutoff = Phase 4.** Phases 1–4 are the earliest end-to-end usable slice (foundation + auth + merchant + payment engine). Phases 5+ are must-have to be defensible + reference-architecture-worthy, but not blocking a first working demo.

### Phase 2 · Auth & Merchant Accounts
- Merchant signup + login
- JWT + refresh tokens, Argon2 hashing
- Forgot-password / session revocation
- RBAC roles: `merchant` / `ops`

### Phase 3 · Merchant Platform
- API key management: publishable + secret, IP allowlist, revoke
- Merchant dashboard (Next.js): profile, KYC status, keys
- Webhook endpoint config: URL + secret rotation

### Phase 4 · Payment Engine — MVP cutoff
- `POST /payment_intents` (Idempotency-Key header)
- 8-state PaymentIntent per `txn-lifecycle` §2
- Mock PSP with test cards + test VPAs (`success@psp`, `failure@psp`, etc.)
- Confirm / capture / cancel endpoints
- Refunds — full + partial
- 3DS simulation (cards) + PIN simulation (UPI)

### Phase 5 · Double-Entry Ledger
- Chart of accounts seeded from `ledger-101` §4
- `journal_entries` + `postings` tables, L1–L5 invariants enforced (deferrable trigger)
- Balance view + materialised balances
- Compensating entries for corrections

### Phase 6 · Settlement Engine
- EOD batching cutoff, configurable per merchant
- Payout scheduling (T+1 default)
- Merchant statements (monthly + on-demand)
- Rolling reserve / holdback per merchant risk tier

### Phase 7 · Webhook Engine
- HMAC-SHA256 signed delivery
- Exp backoff + jitter, DLQ after N retries
- Replay from dashboard
- Event catalog: `payment.*`, `refund.*`, `dispute.*`, `mandate.*`

### Phase 8 · Fraud Detection
- Rules engine: velocity, geo, BIN, MCC, amount, sanction-list
- Risk score per txn
- Review queue for manual triage
- Blocklist / allowlist

### Phase 9 · Analytics Dashboard
- Merchant-facing: volume, success rate, MDR, latency, top failures
- Ops-facing: platform health, reconciliation drift, DLQ size
- Recharts + materialised views

### Phase 10 · Observability
- Prometheus RED metrics per endpoint
- Grafana dashboards
- OpenTelemetry traces → Jaeger
- Pino structured logs with correlation ids
- SLO / SLI definitions per service

### Phase 11 · Performance Optimization
- k6 load tests
- Postgres index tuning + `EXPLAIN ANALYZE`
- Redis caching strategy
- N+1 hunt
- pgbouncer

### Phase 12 · Microservice Extraction
- Split: payment / ledger / settlement / webhook services
- Kafka event choreography
- Pact contract testing

### Phase 13 · Production Readiness
- CI/CD pipelines
- Secrets management
- Backups + PITR
- DR drill
- Runbooks + on-call docs
- Security review + threat model
- Chaos tests

---

## 6 · Non-functional requirements

Design targets, not contractual SLAs. Slight looseness acceptable per Vaibhaw's rule.

### Latency (P99)
- Payment intent create < 500 ms (ex. customer OTP wait)
- Auth confirm < 3 s (includes mock PSP roundtrip)
- Read endpoints (list txns, statements) < 300 ms
- Webhook delivery < 5 s

### Throughput
- 1000 payment req/s sustained in Phase 11 k6 load tests
- 10,000 events/s on internal Kafka bus

### Availability (target, not SLA)
- Backend API: 99.9% in demo runs
- Merchant dashboard: 99.5%
- Webhook delivery: 99.5% success within 24h

### Consistency
- Ledger drift = 0 rupees at every EOD reconcile (M2)
- PaymentIntent state machine enforces one-way transitions
- Read-your-writes for merchant dashboard (read from primary OR replica lag < 100 ms)

### Security
- Zero raw PAN in DB. Ever.
- Secrets in env vars → Vault/AWS Secrets Manager in Phase 13
- JWT: 15-min access + 7-day refresh
- Rate limit: 100 req/s per API key (429 above)
- HTTPS everywhere prod; TLS 1.3
- HMAC-SHA256 on every webhook
- SQL injection defense: Prisma parameterized only
- XSS: strict CSP on dashboard

### Scalability
- Stateless app tier — horizontal scale
- Postgres primary + read replica by Phase 11
- Redis for cache + rate limit
- Kafka partition keys: `payment_intent_id` (payments), `merchant_id` (merchant events)

### Observability
- 100% requests traced (OpenTelemetry, sampling later if needed)
- Structured JSON logs, `correlation_id` propagated
- Prometheus RED per endpoint
- Alerts: recon drift > 0, DLQ > 0, P99 breach

### Maintainability
- TypeScript strict mode everywhere
- Tests: unit + integration + property-based on money math
- Every non-obvious decision → ADR
- No new dependency without an ADR

### Compliance
- Data localization: India-region (ap-south-1) for prod-simulation
- PMLA: 5+ year retention on merchant + ledger data
- STR events: 10-year retention
- Immutable ledger — append-only, DELETE/UPDATE forbidden on `postings` and `journal_entries`

---

## 7 · Baseline architecture

### 7.1 · Monorepo layout (pnpm workspaces)

```
payforge/
  apps/
    backend/         # Fastify API server
    frontend/        # Next.js merchant dashboard
    ops/             # Next.js internal ops dashboard (Phase 3+)
  packages/
    config/          # env loader (Zod-validated)
    database/        # Prisma schema + migrations + typed client
    logger/          # Pino wrapper
    shared/          # domain types + Zod schemas
    types/           # cross-package TypeScript types
  docker/            # Compose files per env
  scripts/           # dev + ops scripts
  .github/workflows/ # CI
```

### 7.2 · Locked stack

| Layer | Choice | ADR |
|-------|--------|-----|
| Language | TypeScript strict | 0002 |
| Runtime | Node.js 22 LTS | 0002 |
| Backend framework | Fastify | 0003 |
| ORM | Prisma | 0004 |
| DB | Postgres 17 | 0005 |
| Cache | Redis 7 | 0005 |
| Event bus | Kafka (KRaft mode) | 0005 |
| Validation | Zod | 0002 |
| Auth | JWT + Argon2 | Phase 2 ADR |
| Logging | Pino | 0006 |
| Metrics | Prometheus + Grafana | 0006 |
| Tracing | OpenTelemetry + Jaeger | 0006 |
| Testing | Vitest + Supertest + fast-check | 0007 |
| Load testing | k6 | 0007 |
| Frontend | Next.js + Tailwind + shadcn/ui + Recharts | 0008 |
| Containers | Docker + Compose | 0009 |
| CI/CD | GitHub Actions | 0009 |
| Deploy target | Hybrid: compose dev/staging, k8s Phase 13 prod-sim | 0009 |

### 7.3 · API shape

- REST + JSON only
- OpenAPI generated from Zod schemas (Phase 4+)
- URL-versioned (`/v1/...`)
- Stripe-style resource-oriented paths + prefixed ids (`pi_`, `re_`, `dp_`, `evt_`, `mer_`)
- Error object per `reference-architecture-notes.md` §2.4

### 7.4 · Internal boundaries (day-one monolith → Phase 12 microservices)

Seven domains, all inside one Fastify app day-one, but code organised as if they were separate:

1. Payment engine
2. Ledger
3. Settlement
4. Webhook
5. Fraud
6. Merchant / auth
7. Analytics

**Boundary rules (preserve extractability):**
- Each domain gets its own tables + Prisma schema section.
- Cross-domain READS via service functions, never JOINs across domain boundaries.
- Cross-domain WRITES via events on Kafka, never direct DB writes.
- Phase 12 extracts each domain into its own service without a refactor.

### 7.5 · Deployment plan

- **Dev:** `docker compose up` — all services on local
- **Staging (prod-simulation lite):** docker-compose on a single VM
- **Phase 13 prod-sim:** k8s (EKS in India region)

### 7.6 · Data localization compliance

- Primary DB, Kafka, Redis, all logs, all traces: India region only (ap-south-1)
- Backup replicas: India-only
- No non-India vendor without an ADR

---

## 8 · Open questions (for Phase 1+)

- **Secrets management** — env vars day-one; Vault vs AWS Secrets Manager in Phase 13?
- **k8s specifics** — EKS vs self-hosted; Helm charts; secrets store CSI?
- **DB migration strategy** — Prisma migrate deploy vs shadow-DB in prod?
- **Feature flags** — LaunchDarkly (paid) vs Unleash (self-host) vs env-config?
- **Retention automation** — pg_partman for 5-year immutable ledger partitioning?
- **Cost of running k8s in India** — worth it for prod-sim, or overkill?
- **Frontend state mgmt** — Zustand vs Redux Toolkit vs TanStack Query only?

These become ADRs in the phase where they land.
