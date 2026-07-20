# docs/decisions — Architecture Decision Records (ADRs)

Every non-obvious architectural or engineering choice on PayForge is captured here as an ADR.

## Format

One file per decision: `ADR-NNNN-short-slug.md`.

```
# ADR-NNNN · <title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Rejected
- **Date:** YYYY-MM-DD
- **Deciders:** @Vaibhaw42

## Context
What situation forced this decision?

## Options considered
1. ...
2. ...
3. ...

## Decision
What we chose and why.

## Consequences
- Good: ...
- Bad: ...
- Neutral: ...

## References
- Links, docs, prior ADRs
```

## Index

| # | Title | Status | Date |
|--:|-------|--------|------|
| _(none yet — first ADR will be captured in Phase 0)_ | | | |

## Rules

- Never edit an accepted ADR. If the decision changes, write a new one and mark the old as **Superseded**.
- Every dependency added to the repo needs an ADR.
- Every stack choice needs an ADR (though many will just cite the roadmap doc).
