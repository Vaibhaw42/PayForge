# ADR-0008 · Frontend = Next.js + Tailwind + shadcn/ui + Recharts

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Two frontend surfaces: merchant dashboard (Phase 3+) and internal ops dashboard (Phase 3+). Need SSR + client, styled with production-grade primitives, dashboards with charts.

## Decision

- **Next.js (App Router)** — SSR + streaming + RSC where suitable.
- **Tailwind CSS** — utility-first styling.
- **shadcn/ui** — copy-in components (no lock-in, full ownership).
- **Recharts** — dashboards + analytics visualisations.
- **State:** TanStack Query for server state; Zustand only if truly needed for client state (deferred decision).

## Consequences

Good:
- Vaibhaw is a MEAN dev — Next.js is close-enough to Angular's SSR story to feel familiar; new mental model is React + RSC.
- shadcn ownership prevents future version-lock pain.
- Recharts is adequate for merchant + ops dashboards; Highcharts overkill.

Bad:
- Next.js App Router is younger than Pages Router; some ecosystem quirks.
- Server components + `use client` boundary can be confusing initially — mitigated by writing an ADR when boundaries change.

## References
- `docs/domain/reference-architecture-notes.md` §9.
