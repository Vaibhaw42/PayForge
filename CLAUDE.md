# CLAUDE.md — Claude Code rules for PayForge

Claude Code specific instructions. For general AI context, read [`AGENTS.md`](./AGENTS.md) first — this file only adds Claude-specific behavior on top.

---

## Read order at session start

1. [`AGENTS.md`](./AGENTS.md) — full project context
2. [`STATUS.md`](./STATUS.md) — current phase, current sub-step, blockers
3. [`LEARNING_LOG.md`](./LEARNING_LOG.md) — last session's notes + quiz results
4. Current phase folder inside `docs/` (whatever `STATUS.md` points to)

Only after reading these four should you propose any action.

## Interaction style (Vaibhaw42's preferences)

- **Caveman mode is often ON.** Terse. Fragments OK. No filler. Code + commits + security warnings stay in normal English.
- **Brainstorm before code.** Ask clarifying questions. Present options + tradeoffs. Do not decide alone.
- **Teach every concept before implementing it.** Explain why → how → build.
- **No black boxes.** If a line is opaque to Vaibhaw, do not ship it.
- **Push back when reasoning is weak.** Do not rubber-stamp.
- **Quiz after each learning chunk.** Fix gaps before advancing.

## Working rhythm

- 2–3 hours per day, learning-first.
- Update `STATUS.md` + `LEARNING_LOG.md` at end of every session.
- Daily commit to `main` (or `learn/*` branches merged into `main`).
- Every phase ends with a git tag: `phase-N-complete`.

## What Claude Code should do proactively

- Track progress with the TaskCreate/TaskList tools (one task per phase).
- Suggest ADRs whenever a non-obvious choice is made.
- Refuse to move to the next phase until lifecycle checkpoints (tests, docs, perf review) are met.
- Flag when a shortcut is being taken and offer the longer teaching path.

## What Claude Code should NOT do

- Do not run `git push --force`, `git reset --hard`, or destructive `rm -rf` without explicit confirmation.
- Do not add npm/pnpm dependencies without an ADR entry + Vaibhaw's approval.
- Do not merge to `main` without at least tests + docs in place.
- Do not "just implement it" — brainstorm and teach first.
- Do not add features, cleanups, or refactors outside the current phase scope.

## Money handling rules (project-wide, safety-critical)

- Money is stored and computed in **minor units** (`paise` for INR) as integers or `bigint`. Never float.
- All monetary APIs use `{ amount: number, currency: "INR" }` with integer minor units.
- Every money-moving endpoint MUST be idempotent (idempotency-key header).
- Every money-moving event is at-least-once — consumers MUST be idempotent.
- Double-entry ledger invariant: `SUM(debits) == SUM(credits)` per journal entry.
- No monetary field is ever nullable at rest — use zero explicitly.

## Repo layout

See [`README.md`](./README.md).

## When in doubt

Ask the human. `STATUS.md` beats memory. `AGENTS.md` beats intuition.
