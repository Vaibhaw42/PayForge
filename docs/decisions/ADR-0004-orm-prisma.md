# ADR-0004 · ORM = Prisma

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Need type-safe DB access with clean migration story. Fintech workloads need explicit control over money types (`BIGINT`), deferrable constraint triggers (for ledger L1 invariant), and strict schema evolution.

## Options considered

1. **Prisma** — generated typed client, best DX in Node, migration engine included.
2. **Drizzle** — SQL-first, no query engine, more explicit control.
3. **Kysely** — pure typed query builder, most explicit.
4. **Raw SQL + pg** — max control, most typing effort.

## Decision

**Prisma** for day-one across all phases.

Custom SQL used only where Prisma abstractions break down: the ledger L1 deferrable constraint trigger, materialised balances trigger, and any perf-critical query (Phase 11).

## Consequences

Good:
- Fastest schema evolution + typed client → sustains 14-phase velocity solo.
- Migration files versioned in repo, easy rollback story.
- First-class integration with Fastify + TypeScript.

Bad:
- Prisma's query engine is a black box — occasional surprises in generated SQL. Mitigation: `EXPLAIN ANALYZE` review in Phase 11.
- Some Postgres-specific features (constraint triggers, PL/pgSQL) require raw SQL migrations alongside Prisma migrations.
- `bigint` handling requires explicit `Prisma.Decimal` awareness — always use `bigint` in TS, never `number`.

## References
- `docs/domain/ledger-101.md` §5, §6 — schema + L1 invariant enforcement.
