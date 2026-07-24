# ADR-0001 · Simulate PA architecture, no real money, production-grade elsewhere

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** @Vaibhaw42

## Context

PayForge is a learning-first personal fintech platform. Two extremes to avoid:

- **Toy tutorial** — cuts corners on architecture, teaches nothing about real engineering.
- **Full production launch** — requires RBI PA license (₹25 cr net worth), PCI DSS Level 1 audit, sponsor bank agreements, legal counsel, insurance. Not the goal.

We need a middle path that lets us learn production-grade engineering without touching real money or requiring regulatory approvals.

## Options considered

1. **Full production PA** — apply for RBI license, get audited. Rejected: too much cost + delay for a learning project.
2. **Tutorial-grade demo** — skip production concerns to move faster. Rejected: defeats the whole purpose (mastering production engineering).
3. **Simulate PA architecture, no real money, production-grade for everything else** — chosen.

## Decision

**Simulate every PA-side flow end-to-end (message flows, ledger, settlement, webhooks, fraud, observability) without touching real customer/merchant/bank money.** Every other engineering concern — architecture, security posture, testing, docs, observability, DR — is built to production standard.

Specifically:

- **Simulate:** PSP integration (mock PSP connector), sponsor bank, nodal escrow, RBI reporting, PA license flows, real card issuance, real UPI wire messages. Fake amounts and fake identities in seed data.
- **Real / production-grade:** monorepo layout, Fastify + Prisma + Postgres + Redis + Kafka setup, idempotency + inbox/outbox patterns, double-entry ledger + reconciliation, JWT+refresh+Argon2 auth, structured logging (Pino), metrics (Prometheus), traces (OpenTelemetry + Jaeger), tests (Vitest + Supertest), load testing (k6), CI/CD (GitHub Actions), Docker + Compose, ADRs + runbooks.
- **PCI stance:** stay out of scope entirely. No raw PAN in DB. Ever. Token-only via a PSP-hosted UI simulation.

## Consequences

Good:
- Deep learning across the full fintech stack without regulatory blockers.
- Portfolio-quality output — every design choice defensible in an interview.
- Reusable architecture — if PayForge ever went real, the base is production-shaped, just needs licenses + audits layered.

Bad:
- No revenue, no real customers — the pressure of production traffic isn't there. We compensate with k6 load testing + chaos experiments in Phase 11.
- Some concerns (real-world PSP quirks, real chargeback timing) can't be fully faithful to reality — we approximate.

Neutral:
- Documentation load is high. Every non-obvious call becomes an ADR.
- Seed data must be realistic-shaped but fake-identified (no real PAN, real Aadhaar, real GSTIN even in dev).

## References

- Roadmap doc (repo root) — "Ground Rules" #1: 100% free and self-hosted.
- `docs/domain/compliance-map.md` §11 — feature-by-feature license map.
