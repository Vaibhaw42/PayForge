# Phase 1 · Foundation & Architecture + Docker onboarding

> Deliver: scaffolded monorepo + local Docker Compose infra + Fastify health-check backend + CI baseline + Docker fluency for Vaibhaw.
>
> Governance: [ADRs 0001–0009](../decisions/).

---

## Scope

- pnpm monorepo skeleton
- Docker Compose local infra: Postgres 17, Redis 7, Kafka (KRaft)
- `packages/config` (Zod env loader)
- `packages/logger` (Pino + correlation id + secret scrubbing)
- `packages/database` (Prisma init + baseline schema + first migration)
- `packages/shared` + `packages/types` (domain types, shared errors)
- `apps/backend` — Fastify skeleton with `/health` only
- `apps/frontend` + `apps/ops` — Next.js scaffolds (structure only, no features)
- CI: lint + typecheck + build on PR
- Docker fluency exercises (Vaibhaw's gap)

## Non-scope

- Auth (Phase 2)
- Merchant tables + API keys (Phase 3)
- Payment endpoints (Phase 4)
- Ledger tables (Phase 5)
- No frontend features in `apps/frontend` / `apps/ops` — pages just render "Phase 3+" placeholders

## Design decisions this phase locks

- Node package manager = **pnpm** via corepack (already installed).
- Monorepo layout per [ADR-0009](../decisions/ADR-0009-infra-deploy-hybrid.md) §7.1.
- Container names locked: `payforge-postgres`, `payforge-redis`, `payforge-kafka`.
- Postgres port `5432`, Redis `6379`, Kafka `9092` externally.
- Only `apps/backend` runs on host in dev (via `pnpm dev`); infra always via Docker.
- Env config = Zod-validated, fail-fast on boot.
- Logging = Pino, JSON, correlation id from request header `X-Request-Id` or auto-generated.
- Health endpoint = `GET /health` returning `{ status, version, uptime, deps: { postgres, redis, kafka } }`.

## Workstream sequence (checkpoint per step)

1. Plan doc (this file)
2. Monorepo bootstrap (root `package.json`, `pnpm-workspace.yaml`, tsconfig, lint/format)
3. Docker Compose infra + verification
4. `packages/config` + env schema
5. `packages/logger`
6. `packages/database` (Prisma init + baseline)
7. `packages/shared` + `packages/types`
8. `apps/backend` Fastify skeleton + `/health`
9. `apps/frontend` + `apps/ops` Next.js scaffolds (placeholder pages)
10. CI baseline (`.github/workflows/ci.yml`)
11. Docker fluency exercises
12. Phase 1 recap + git tag

Estimated ~10 days at 2–3 hr/day.

## Exit criteria

- [ ] `docker compose up` boots all infra
- [ ] `pnpm install` succeeds at root
- [ ] `pnpm -r build` builds all packages+apps
- [ ] `pnpm --filter backend dev` starts Fastify
- [ ] `curl localhost:3000/health` returns `200` with dep-check truthy
- [ ] `pnpm test` runs (even if empty)
- [ ] CI green on `main`
- [ ] Vaibhaw can write a Dockerfile from scratch + explain layer caching + multi-stage
- [ ] `docs/architecture/phase-1.md` recap section filled

## Open questions (to close during phase)

- Kafka image choice: `bitnami/kafka` vs `confluentinc/cp-kafka` — decide in step 3.
- Postgres extensions (pg_partman for retention? uuid-ossp vs pgcrypto for UUIDs?) — decide in step 6.
- Prisma migration naming convention.
- CI cache strategy for pnpm store.

## Recap (fill at Phase 1 close)

_(pending)_
