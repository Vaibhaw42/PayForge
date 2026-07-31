# ADR-0007 · Testing = Vitest + Supertest + fast-check + k6

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Fintech testing needs: unit + integration + property-based on money math + load. Money invariants (never negative, always sums exactly, DR=CR per JE) are natural property-test targets.

## Decision

- **Vitest** — unit tests, ESM-native, faster than Jest.
- **Supertest** — HTTP integration tests against Fastify.
- **fast-check** — property-based tests for money math + state-machine transitions.
- **k6** — load tests (Phase 11).
- **Coverage target:** ≥ 90% on money-touching code (`packages/database/ledger/*`, `apps/backend/payment-engine/*`, `apps/backend/settlement/*`).

## Consequences

Good:
- All open-source, self-hostable.
- fast-check catches subtle money invariants a hand-written test suite would miss.
- k6 uses JS-based scripts — no new language for load tests.

Bad:
- Property-based tests are slower per-run — CI budget must account.
- Vitest + Supertest combo has minor quirks (mocking Prisma, tearing down PG per test) — solved with `pg-mem` or per-test-DB in Phase 1.

## References
- `docs/domain/reference-architecture-notes.md` §8.
- `docs/domain/money-math.md` §6 — invariants to property-test.
