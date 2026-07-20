# AGENTS.md — AI onboarding for PayForge

If you are an LLM/coding-agent opening this repo, **read this file first**. It is designed to give you full working context in under two minutes.

---

## What is PayForge?

A personal, open-source fintech platform being built from scratch by [@Vaibhaw42](https://github.com/Vaibhaw42) as a learning-first project. It is NOT a tutorial follow-along — it is meant to be defended like a production system, with architecture docs, ADRs, tests, and observability.

**Focus market:** India (UPI + cards + RBI-regulated flows), global patterns second.

## Where are we right now?

Always check [`STATUS.md`](./STATUS.md) — it is the single source of truth for the current week's state. `STATUS.md` beats anything in this file if they disagree.

## The 14 phases

See [`ROADMAP.md`](./ROADMAP.md) for the full plan. Summary:

| Phase | Name | Purpose |
|------:|------|---------|
| -1 | FinTech Fundamentals | Domain knowledge before code |
| 0 | Planning & Requirements | Functional + non-functional reqs |
| 1 | Foundation & Architecture | Monorepo, Fastify, Prisma, Docker |
| 2 | Auth & Merchant Accounts | JWT, refresh, Argon2 |
| 3 | Merchant Platform | API keys, org/user, dashboard scaffold |
| 4 | Payment Engine | Intents, idempotency, state machine |
| 5 | Double-Entry Ledger | Debits/credits, invariants |
| 6 | Settlement Engine | Batching, cutoffs, payouts |
| 7 | Webhook Engine | Signed delivery, retries, DLQ |
| 8 | Fraud Detection | Rules, velocity, risk scoring |
| 9 | Analytics Dashboard | Next.js + Recharts |
| 10 | Observability | Prometheus, Grafana, OTel, Jaeger |
| 11 | Performance Optimization | k6, indexes, caching, N+1 hunt |
| 12 | Microservice Extraction | Split services, event choreography |
| 13 | Production Readiness | CI/CD, secrets, backups, runbooks |

## Tech stack

TypeScript · Node.js 22 LTS · Fastify · Prisma · PostgreSQL 17 · Redis · Kafka (KRaft) · Zod · JWT+refresh · Argon2 · Pino · Prometheus · Grafana · OpenTelemetry · Jaeger · Vitest · Supertest · k6 · Docker + Compose · GitHub Actions · Next.js · Tailwind · shadcn/ui · Recharts.

## Collaboration rules (non-negotiable)

The human owner (`Vaibhaw42`) is learning through this project. Every agent must follow:

1. **Brainstorm before code.** Present options + tradeoffs. Do not decide alone.
2. **Teach every concept.** Explain why → how → build. No black boxes.
3. **No shortcuts.** If a snippet is opaque to the human, it does not ship.
4. **Push back when reasoning is weak.** Do not rubber-stamp.
5. **Per-phase lifecycle:** Plan → DB design → API design → Impl → Tests → Refactor → Docs → Perf review → Git tag → Next.
6. **Docs are code.** Every non-obvious decision becomes an ADR in [`docs/decisions/`](./docs/decisions/).
7. **Update `STATUS.md` and `LEARNING_LOG.md`** at the end of every working session.
8. **No secrets in the repo.** `.env.example` only. Real secrets go through env vars locally.

## How to orient yourself in 5 files

1. [`STATUS.md`](./STATUS.md) — where we are today
2. [`ROADMAP.md`](./ROADMAP.md) — where we are in the 14-phase arc
3. [`LEARNING_LOG.md`](./LEARNING_LOG.md) — what has been learned so far
4. [`docs/decisions/`](./docs/decisions/) — every architectural decision
5. Current phase folder inside [`docs/`](./docs/) — the artifacts being produced right now

## Docs to maintain (per phase)

- `docs/architecture/phase-N.md`
- `docs/api/phase-N.md` (or `openapi.yaml`)
- `docs/db/phase-N-erd.md`
- Sequence diagrams (Mermaid) inside architecture doc
- ADR entries in `docs/decisions/`
- Update `ROADMAP.md`, `STATUS.md`, `LEARNING_LOG.md`
- `docs/runbooks/` from Phase 10 onward

## What NOT to do

- Do not skip Phase -1 (domain). Every downstream design depends on it.
- Do not "improve" the stack unilaterally — stack is locked in `README.md`.
- Do not merge to `main` without at least one lifecycle checkpoint (tests + docs).
- Do not add dependencies without an ADR.
- Do not use floats for money. Ever. Minor units (integers) only.
- Do not treat exactly-once semantics as achievable — assume at-least-once + idempotency.

## Contact

Owner: [@Vaibhaw42](https://github.com/Vaibhaw42) · Repo: <https://github.com/Vaibhaw42/PayForge>
