# STATUS

**Updated:** 2026-07-21

## Current phase

✅ **Phase -1 · FinTech Fundamentals — COMPLETE (2026-07-24)** · Git tag `phase-minus-1-complete`

🟡 **Phase 0 · Planning & Requirements** — starting next session

Domain-only phase. No code. All artifacts land in [`docs/domain/`](./docs/domain/).

## This week's plan

| Day | Topic | Deliverable | Status |
|-----|-------|-------------|--------|
| 1 | Money movement + actors | `docs/domain/actors.md` | ✅ done |
| 2 | Payment methods (cards + UPI deep-dive) | `docs/domain/payment-methods.md` | ✅ done |
| 3 | Transaction lifecycle + states | `docs/domain/txn-lifecycle.md` | ✅ done |
| 4 | Money representation + double-entry basics | `docs/domain/money-math.md` + `ledger-101.md` | ✅ done |
| 5 | Idempotency + reliability | `docs/domain/idempotency.md` | ✅ done |
| 6 | Compliance map (PCI, RBI PA/PG, KYC/AML) | `docs/domain/compliance-map.md` | ✅ done |
| 7 | Stripe + Razorpay reference architectures | `docs/domain/reference-architecture-notes.md` | ✅ done |
| 8 | Recap + quiz | `docs/domain/PHASE_MINUS_1_RECAP.md` | ✅ done — green light to Phase 0 |

## Environment state

| Tool | Installed | Version | Needed by |
|------|-----------|---------|-----------|
| git | ✅ | 2.52 | now |
| Node.js | ✅ | v22.23.1 (LTS, pinned via `.nvmrc`) | Phase 1 |
| nvm | ✅ | 0.40.4 | now |
| pnpm | ✅ | 11.15.1 (via corepack) | Phase 1 |
| Docker Desktop | ✅ | 29.6.1 + Compose v5.3 + Buildx | Phase 1 |
| Rosetta 2 | ✅ | installed | Docker (arm64 mostly) |
| gh CLI | ❌ | — | later (PR mgmt) |
| Homebrew | ✅ | 6.0.1 | now |

Install commands (only gh left):

```bash
brew install gh          # for PRs and repo mgmt
gh auth login
```

Node auto-switch on `cd` into repo (nvm hook — add to `~/.zshrc` once):

```bash
autoload -U add-zsh-hook
load-nvmrc() {
  local node_version="$(nvm version)"
  local nvmrc_path="$(nvm_find_nvmrc)"
  if [ -n "$nvmrc_path" ]; then
    local nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")
    if [ "$nvmrc_node_version" = "N/A" ]; then
      nvm install
    elif [ "$nvmrc_node_version" != "$node_version" ]; then
      nvm use
    fi
  elif [ "$node_version" != "$(nvm version default)" ]; then
    nvm use default
  fi
}
add-zsh-hook chpwd load-nvmrc
load-nvmrc
```

## Recent commits

See `git log`.

## Blockers

None.

## Next session

**Phase 0 — Planning & Requirements** kickoff.

- Vision, personas, scope, non-goals.
- Functional requirements (user stories per feature).
- Non-functional requirements (latency, availability, consistency, security).
- Success metrics.
- Baseline ADRs 0002+ (stack, framework, monorepo, testing, observability choices).
- Deliverable: `docs/architecture/phase-0.md` + additional ADRs.

Governing decision: [ADR-0001](docs/decisions/ADR-0001-simulate-pa-no-real-money.md) — simulate PA, no real money, production-grade elsewhere.
