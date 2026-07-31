# ADR-0002 · Language = TypeScript strict + Node 22 LTS + Zod

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Solo learning-first fintech project. Vaibhaw is a MEAN-stack dev — daily TS/Node. Need language that maximises learning-per-hour without adding a mid-project language switch, while keeping fintech-grade correctness (money types, no float, strict null checks).

## Options considered

1. **TypeScript strict + Node 22 LTS** — daily-use, shared types front/back, strong ecosystem.
2. **Go** — better perf, simpler concurrency, common in fintech. Cost: new language.
3. **Rust** — safest, best perf. Cost: steep curve, would derail the 9-month timeline.
4. **Kotlin/JVM** — enterprise-grade. Cost: heavier tooling, slower cold starts.
5. **Python** — poor money-type story, slower runtime for payment throughput.

## Decision

**TypeScript strict** on **Node 22 LTS**. All monetary values as `bigint`; all validation via **Zod**. `tsconfig` in `strict: true` mode, no implicit `any`, no `!` non-null assertions in money-touching code.

## Consequences

Good:
- Existing TS familiarity → learning budget goes to fintech patterns, not language.
- Shared types across `apps/backend`, `apps/frontend`, `apps/ops`, and `packages/*`.
- Zod as runtime + compile-time validation for every API boundary.
- Node 22 LTS support window through Apr 2027.

Bad:
- Node's single-threaded runtime is not ideal for CPU-bound fraud ML — future ML work may need worker threads or a Python microservice.
- `bigint` interop with JSON is manual; must serialize as string when > 2^53.

## References
- `docs/domain/money-math.md` §2, §9 — minor units + storage.
- Roadmap doc — stack list.
