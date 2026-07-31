# ADR-0006 · Observability = Pino + Prometheus/Grafana + OpenTelemetry/Jaeger

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Fintech observability needs: structured logs with correlation ids, RED metrics per endpoint, distributed traces across services, SLO tracking.

## Decision

- **Logs:** Pino (JSON structured, high perf) + `correlation_id` middleware.
- **Metrics:** Prometheus + Grafana. RED per endpoint. Alerts on reconciliation drift, DLQ growth, P99 breaches.
- **Traces:** OpenTelemetry SDK → Jaeger backend. 100% sampling day-one; adjust in Phase 11 if needed.
- **Log scrubbing:** never log PAN, CVV, secrets, or full webhook signing keys. Regex-based scrubber in the Pino serializer.

## Consequences

Good:
- All four self-hostable via Docker Compose.
- OpenTelemetry is vendor-neutral — can swap to Tempo, Grafana Cloud, Datadog later without rewriting instrumentation.
- Prometheus alerting integrates with Alertmanager for PagerDuty-style routing (Phase 13).

Bad:
- Storage grows fast at scale — cardinality budgets required (avoid labels with high cardinality like `payment_intent_id`).
- 100% trace sampling is not sustainable at real prod scale; Phase 11 revisits.

## References
- `docs/domain/reference-architecture-notes.md` §7.
