# PayForge

Personal fintech platform built from scratch as a **learning-first, production-inspired** project. Goal: master backend architecture, PostgreSQL, Redis, Kafka, Docker, security, observability, testing, scalability, payment systems, and system design — by building a real fintech platform, not by reading tutorials.

**Focus market:** India (UPI + cards + RBI-regulated flows), with global patterns second.

**Status:** 🟡 Phase -1 — FinTech Fundamentals (domain learning)
See [`STATUS.md`](./STATUS.md) for the current-week state.

---

## Vision

Build an open-source, self-hosted fintech platform that could plausibly be a real payment-processing product. Every feature must teach a backend concept and be defended with docs (architecture, ADRs, ERD, sequence diagrams, runbooks).

**Ground rules:**
1. 100% free and self-hosted wherever possible.
2. Every feature must teach a backend engineering concept.
3. Production-quality architecture + documentation.
4. Testing, refactoring, docs, review before moving to next phase.
5. Revisit and validate the design before every phase.

## Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Runtime | Node.js 22 LTS |
| Framework | Fastify |
| ORM | Prisma |
| Database | PostgreSQL 17 |
| Cache | Redis |
| Event Bus | Kafka (KRaft) |
| Validation | Zod |
| Auth | JWT + refresh tokens |
| Password hashing | Argon2 |
| Logging | Pino |
| Metrics | Prometheus + Grafana |
| Tracing | OpenTelemetry + Jaeger |
| Testing | Vitest + Supertest |
| Load testing | k6 |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Frontend | Next.js + Tailwind + shadcn/ui |
| Charts | Recharts |

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for all 14 phases (-1 → 13).

## For AI agents

If you are an LLM/coding-agent (Claude Code, Cursor, Codex, Copilot, etc.) opening this repo — **start with [`AGENTS.md`](./AGENTS.md)**. It gives you full project context in under two minutes.

Claude Code users: see [`CLAUDE.md`](./CLAUDE.md) for Claude-specific rules (mirrors `AGENTS.md`).

## Repo layout

```
payforge/
├── README.md              ← you are here
├── AGENTS.md              ← AI onboarding (read first if you're an LLM)
├── CLAUDE.md              ← Claude Code rules (mirrors AGENTS.md)
├── ROADMAP.md             ← 14 phases, current phase marked
├── STATUS.md              ← what's done, next up, blockers
├── LEARNING_LOG.md        ← daily learning journal
├── docs/
│   ├── domain/            ← Phase -1 outputs (fintech fundamentals)
│   ├── architecture/      ← per-phase architecture docs
│   ├── api/               ← OpenAPI + API.md per phase
│   ├── db/                ← ERDs, migration story
│   ├── decisions/         ← ADRs (Architecture Decision Records)
│   └── runbooks/          ← ops docs (Phase 10+)
├── apps/                  ← backend, frontend (Phase 1+)
├── packages/              ← shared config, logger, types (Phase 1+)
├── docker/                ← Compose files (Phase 1+)
├── scripts/               ← dev + ops scripts
└── .github/               ← workflows
```

## License

MIT — see [`LICENSE`](./LICENSE).
