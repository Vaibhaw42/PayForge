# docs/decisions — Architecture Decision Records (ADRs)

Every non-obvious architectural or engineering choice on PayForge is captured here as an ADR.

## Format

One file per decision: `ADR-NNNN-short-slug.md`.

```
# ADR-NNNN · <title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Rejected
- **Date:** YYYY-MM-DD
- **Deciders:** @Vaibhaw42

## Context
What situation forced this decision?

## Options considered
1. ...
2. ...
3. ...

## Decision
What we chose and why.

## Consequences
- Good: ...
- Bad: ...
- Neutral: ...

## References
- Links, docs, prior ADRs
```

## Index

| # | Title | Status | Date |
|--:|-------|--------|------|
| 0001 | [Simulate PA, no real money, prod-grade elsewhere](ADR-0001-simulate-pa-no-real-money.md) | Accepted | 2026-07-24 |
| 0002 | [Language = TypeScript strict + Node 22 LTS + Zod](ADR-0002-language-typescript-strict.md) | Accepted | 2026-07-31 |
| 0003 | [Backend framework = Fastify](ADR-0003-backend-framework-fastify.md) | Accepted | 2026-07-31 |
| 0004 | [ORM = Prisma](ADR-0004-orm-prisma.md) | Accepted | 2026-07-31 |
| 0005 | [Data plane = Postgres 17 + Redis 7 + Kafka (KRaft)](ADR-0005-data-plane-postgres-redis-kafka.md) | Accepted | 2026-07-31 |
| 0006 | [Observability = Pino + Prometheus/Grafana + OpenTelemetry/Jaeger](ADR-0006-observability-stack.md) | Accepted | 2026-07-31 |
| 0007 | [Testing = Vitest + Supertest + fast-check + k6](ADR-0007-testing-stack.md) | Accepted | 2026-07-31 |
| 0008 | [Frontend = Next.js + Tailwind + shadcn/ui + Recharts](ADR-0008-frontend-nextjs-tailwind-shadcn.md) | Accepted | 2026-07-31 |
| 0009 | [Infra + Deploy = Docker Compose (dev/staging) + k8s Phase 13 prod-sim](ADR-0009-infra-deploy-hybrid.md) | Accepted | 2026-07-31 |

## Rules

- Never edit an accepted ADR. If the decision changes, write a new one and mark the old as **Superseded**.
- Every dependency added to the repo needs an ADR.
- Every stack choice needs an ADR (though many will just cite the roadmap doc).
