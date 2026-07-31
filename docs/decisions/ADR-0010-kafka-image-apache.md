# ADR-0010 · Kafka image = apache/kafka (KRaft mode)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** @Vaibhaw42

## Context

Phase 1 Docker Compose infra needs a Kafka image. Three real options: `bitnami/kafka`, `confluentinc/cp-kafka`, `apache/kafka`.

## Decision

**`apache/kafka:3.9`** — the official Apache Software Foundation image.

Reasons:
- Official upstream, tracks Kafka releases directly.
- Full KRaft (no Zookeeper) support since 3.7.
- Simpler env-var surface than bitnami/confluent (fewer proprietary wrappers).
- Learning value — real deployments increasingly move to the official image over vendor forks.

## Consequences

Good:
- No vendor lock-in; env vars map 1:1 to Kafka's own broker.properties.
- Smaller image than confluent's stack (which bundles Schema Registry, Connect, etc.).

Bad:
- Documentation is thinner than bitnami/confluent for edge cases.
- KRaft mode env-var surface differs subtly from Zookeeper docs — must be careful with `KAFKA_LISTENERS`, `KAFKA_ADVERTISED_LISTENERS`, `KAFKA_CONTROLLER_QUORUM_VOTERS`, `KAFKA_PROCESS_ROLES`.

## References
- Apache Kafka 3.9 release notes.
- KRaft mode docs: https://kafka.apache.org/documentation/#kraft
