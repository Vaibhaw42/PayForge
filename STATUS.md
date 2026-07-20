# STATUS

**Updated:** 2026-07-20

## Current phase

🟡 **Phase -1 · FinTech Fundamentals** — Day 0 (kickoff)

Domain-only phase. No code. All artifacts land in [`docs/domain/`](./docs/domain/).

## This week's plan

| Day | Topic | Deliverable |
|-----|-------|-------------|
| 1 | Money movement + actors | `docs/domain/actors.md` |
| 2 | Payment methods (cards + UPI deep-dive) | `docs/domain/payment-methods.md` |
| 3 | Transaction lifecycle + states | `docs/domain/txn-lifecycle.md` |
| 4 | Money representation + double-entry basics | `docs/domain/money-math.md` + `ledger-101.md` |
| 5 | Idempotency + reliability | `docs/domain/idempotency.md` |
| 6 | Compliance map (PCI, RBI PA/PG, KYC/AML) | `docs/domain/compliance-map.md` |
| 7 | Stripe + Razorpay reference architectures | `docs/domain/reference-architecture-notes.md` |
| 8 | Recap + quiz | Green light to Phase 0 |

## Environment state

| Tool | Installed | Version | Needed by |
|------|-----------|---------|-----------|
| git | ✅ | 2.52 | now |
| Node.js | ⚠️ | v16 (need 22 LTS) | Phase 1 |
| pnpm | ❌ | — | Phase 1 |
| gh CLI | ❌ | — | soon (push + PRs) |
| Docker Desktop | ❌ | — | Phase 1 |
| Homebrew | ✅ | 6.0.1 | now |

Install commands (when ready):

```bash
brew install gh
gh auth login

brew install fnm
fnm install 22 && fnm use 22
npm install -g pnpm

brew install --cask docker
```

## Recent commits

See `git log`.

## Blockers

None.

## Next session

- Day 1: **Money Movement + Actors** teaching + `actors.md` deliverable.
