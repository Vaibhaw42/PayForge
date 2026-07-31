# ADR-0009 · Infra + Deploy = Docker Compose (dev/staging) + k8s Phase 13 prod-sim + GitHub Actions

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Learning-first project — dev velocity matters, but Phase 13 should end in a production-shaped deployment that could plausibly host a real PA. Full k8s day-one would slow Phase 1-4 too much.

## Decision

Hybrid deploy path:

- **Dev:** `docker compose up` — Postgres, Redis, Kafka (KRaft), Grafana, Prometheus, Jaeger, backend, frontend all locally.
- **Staging:** docker-compose on a single India-region VM (AWS EC2 in ap-south-1 for prod-sim).
- **Phase 13 prod-sim:** k8s (EKS ap-south-1) — real fintech-shaped topology. Helm charts, secrets store CSI, HPA, PDB, ingress.
- **CI/CD:** GitHub Actions — lint, typecheck, test on PR; build + push image + deploy on merge to `main`.

## Consequences

Good:
- Sustains dev velocity across Phase 1-12; k8s complexity confined to Phase 13.
- k8s learning value at the end of the project (matches real fintech infra).
- All components self-hostable, aligned with roadmap Ground Rule #1.

Bad:
- Docker Compose ≠ k8s — some infra concepts (network policies, HPA, DNS, service mesh) only surface at Phase 13.
- Cost consideration: EKS control plane $73/mo. If cost is a blocker, fallback = k3s on a single VM.

## References
- Roadmap doc — Phase 1 (foundation), Phase 13 (production readiness).
- `docs/domain/compliance-map.md` §5 — India-region requirement.
