# ADR-0003 · Backend framework = Fastify

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Vaibhaw is a MEAN dev — surface-level Express knowledge, no Fastify or NestJS. Need a framework that (a) is TS-native, (b) is schema-first (Zod-integrated), (c) maximises learning-per-hour, (d) keeps velocity high for solo across 14 phases.

## Options considered

1. **Fastify** — modern, 2× faster than Express, Zod integration via `@fastify/type-provider-zod`, minimal boilerplate.
2. **NestJS** — enterprise, DI + modules (Angular-like — familiar mental model for MEAN dev). Heavy boilerplate; meant for teams.
3. **Express** — already known (surface). Outdated, no schema-first story, slower.
4. **Hono / Elysia** — newer, edge-first / Bun-first. Smaller ecosystem, more surprises.

## Decision

**Fastify.** Reasons:

- Genuinely new mental model for Vaibhaw (schema-first + plugin-based) → highest learning-per-hour.
- Minimal boilerplate → sustains 14-phase velocity solo.
- First-class TypeScript + Zod integration.
- Real fintech Node backends increasingly use it.
- Native OpenAPI generation via `@fastify/swagger` + Zod schemas.

## Consequences

Good:
- Fast dev velocity; unopinionated enough to match domain-driven code layout in §7.4.
- Zod schemas double as validation + OpenAPI source.
- Plugin ecosystem covers rate limiting, auth, cors, swagger, sensible defaults.

Bad:
- Less scaffolding than NestJS — Vaibhaw builds more layout conventions himself (mitigated by writing them as ADRs as we go).
- Smaller "batteries-included" surface than NestJS DI system; must decide on our own service/repository patterns.

## References
- `docs/domain/reference-architecture-notes.md` §2.
- Discussion in Phase 0 planning (2026-07-31).
