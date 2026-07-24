# Phase -1 · FinTech Fundamentals — RECAP

> Written 2026-07-24 at the end of Phase -1. Green-light document for entering Phase 0 (Planning & Requirements).

---

## What Phase -1 was

**Domain-only phase. No code.** Purpose: master the fintech domain before touching architecture, so every Phase 4+ code decision is defensible.

Governing operating model: [ADR-0001](../decisions/ADR-0001-simulate-pa-no-real-money.md) — simulate PA architecture end-to-end, no real money, production-grade engineering elsewhere.

---

## Deliverables shipped

| # | File | Topics |
|---|------|--------|
| 1 | [`actors.md`](actors.md) | 20-term glossary, cards ecosystem, UPI ecosystem, ₹1000 money-flow trace, India-specific regs |
| 2 | [`payment-methods.md`](payment-methods.md) | Cards, UPI, netbanking, wallets, EMI, BNPL — deep-dive per method + merchant decision framework |
| 3 | [`txn-lifecycle.md`](txn-lifecycle.md) | 8-state payment intent model, card sub-states, UPI sub-states, refund + chargeback state machines, idempotency + retries, reconciliation, 15 anti-patterns |
| 4 | [`money-math.md`](money-math.md) | Integer minor units, banker's rounding, ISO 4217, GST math, storage + display conventions |
| 5 | [`ledger-101.md`](ledger-101.md) | Double-entry accounting, chart of accounts, journal_entries + postings + accounts three-table shape, invariants, ₹1000 walkthrough |
| 6 | [`idempotency.md`](idempotency.md) | Delivery guarantees, outbox + inbox patterns, retries, DLQ, saga, choreography vs orchestration, pattern-selection matrix |
| 7 | [`compliance-map.md`](compliance-map.md) | RBI PA/PG, PCI DSS, KYC/AML, data localization, FIU-IND, PMLA, GST, IT Act + DPDP, feature-license map |
| 8 | [`reference-architecture-notes.md`](reference-architecture-notes.md) | Stripe + Razorpay patterns distilled; 20+ patterns PayForge adopts across all phases |

---

## Key mental models locked (memorize before Phase 4)

1. **Message flow vs money flow** — messages travel real-time (seconds); money settles T+1 (batch). Bugs live at the boundary.
2. **PA sits on the ACQUIRING side**, not issuing.
3. **RBI regulates. NPCI operates.** Different bodies, different scope.
4. **TPAP ≠ PSP Bank.** TPAPs are apps. PSP Banks are the licensed banks behind them.
5. **VPA `x@y` — `y` is PSP Bank code, not user's actual bank.**
6. **Money never un-moved.** Refund + chargeback = new rows, never updates.
7. **8 payment intent states.** REQUIRES_ACTION = customer's turn. REQUIRES_CAPTURE = merchant's turn (auth-only). PROCESSING = system's turn.
8. **Auth → Capture → Clearing → Settlement.** Never confuse.
9. **U28 is HARD failed** (insufficient funds — retry can't help). U16/U66 are SOFT.
10. **U69 DEEMED_APPROVE stays PROCESSING externally.** Never fulfill.
11. **Refund ≠ Chargeback.** Cooperative vs adversarial.
12. **Cryptogram (per-txn EMV) ≠ Token (persistent PAN sub).**
13. **Idempotency: same key + same body = REPLAY. Same key + different body = 409.**
14. **Retry writes, poll reads.** Never confuse.
15. **Local DB is source of truth for OUR system. PSP is source of truth for the wire.**
16. **Multiply first, divide last** in percent math. Basis points as integers.
17. **Banker's rounding** for money. Half-even, no drift at scale.
18. **DR = CR per journal entry.** Ledger's iron law.
19. **Ledger is append-only.** Fix via compensating JE.
20. **`merchant_payable` = liability**, not asset. Their money in our escrow.
21. **`accounts` = static chart. `journal_entries` = events. `postings` = DR/CR lines with amounts.**
22. **Exactly-once = at-least-once + idempotent receiver.**
23. **Outbox + Inbox = the effectively-once industry recipe.**
24. **`INSERT ... ON CONFLICT DO NOTHING` is your race gate.**
25. **`FOR UPDATE SKIP LOCKED` for worker pools on queue tables.**
26. **RBI PA license required in the real world; we simulate.**
27. **Data must be stored in India** — AWS ap-south-1 or on-prem India.
28. **Stay out of PCI scope** — never touch raw PAN.
29. **Adopt Stripe API design + Razorpay India ops patterns.**
30. **Postgres owns the money. Kafka is transport. Redis is cache.**

---

## Numbers to memorize

- **UPI P2M MDR** = 0% (Jan 2020 mandate).
- **Card MDR** ≈ 1.5–2.5% (RBI caps by type).
- **GST on MDR** = 18% (CGST 9 + SGST 9 intra-state; IGST 18 inter-state).
- **Interchange** ≈ 1–1.2% of MDR (largest slice).
- **Scheme fee** ≈ 0.10–0.15% of MDR.
- **RBI PA min net worth** — ₹15 cr to apply, ₹25 cr ongoing.
- **PMLA retention** — 5 years for records, 10 years for STRs.
- **PA settlement to merchant** — T+1.
- **Card refund latency** — 5–7 business days.
- **UPI refund latency** — real-time.
- **Auth window / capture TTL** — 5–7 days retail, up to 30 days T&E.
- **Chargeback filing window** — up to 120 days from txn.
- **Merchant representment window** — 7–14 days.
- **Chargeback rate threshold** — 0.9% early-warning, >1.8% termination.

---

## Recurring mistakes to lock

Documented in per-day logs. Highest-frequency errors:

- **Refund vs chargeback confusion** (Day 3 + Day 3-repeat).
- **Idempotency key: same-key-same-body = REPLAY, not reject** (Day 3).
- **Mandate state vs debit execution state** (Day 2 + Day 3).
- **Persist locally vs derive from PSP** (Day 3).
- **Cryptogram vs Token** (Day 2 twice).
- **Multiple state machines mingling** (Day 3).
- **Pattern selection ambiguity** (Day 5).

Each has an in-file lookup table for fast recall (see §11 in the respective doc).

---

## Phase -1 exit checklist

- [x] `docs/domain/actors.md` complete
- [x] `docs/domain/payment-methods.md` complete
- [x] `docs/domain/txn-lifecycle.md` complete
- [x] `docs/domain/money-math.md` complete
- [x] `docs/domain/ledger-101.md` complete
- [x] `docs/domain/idempotency.md` complete
- [x] `docs/domain/compliance-map.md` complete
- [x] `docs/domain/reference-architecture-notes.md` complete
- [x] ADR-0001 (simulate PA, no real money) filed
- [x] All 8 docs have a "What I still don't understand" section
- [x] LEARNING_LOG entries per day
- [x] Git tag `phase-minus-1-complete`

---

## Green-light criteria (checked at Phase-0 gate)

- [x] Can name every actor in Indian payment ecosystem + role + revenue model.
- [x] Can trace a ₹1000 card txn end-to-end (auth → capture → clearing → settlement → payout).
- [x] Can trace a ₹500 UPI txn end-to-end.
- [x] Can explain PA vs PG legal distinction.
- [x] Can explain interchange, scheme fee, MDR, GST breakdown.
- [x] Can draw the 8-state payment intent state machine.
- [x] Can distinguish refund vs chargeback state machines.
- [x] Can explain idempotency-key contract for same-key-same-body vs same-key-different-body.
- [x] Can name outbox + inbox patterns and when to use each.
- [x] Knows the RBI PA license requirements (net worth, escrow, KYC, data localization).
- [x] Knows what NOT to store (raw PAN, CVV, full track).
- [x] Knows PayForge's operating model per ADR-0001.

---

## Next phase

**Phase 0 — Planning & Requirements.**

Goal: translate domain knowledge into a functional + non-functional requirements document for PayForge as a product. Includes:

- Vision, personas, scope, non-goals.
- Functional requirements (user stories per feature).
- Non-functional requirements (latency, availability, consistency, security).
- Success metrics.
- Baseline architecture ADRs (stack, framework, monorepo choices).

Deliverable: `docs/architecture/phase-0.md` + ADRs 0002+ for foundational choices.

**Estimated duration:** 3–5 sessions.

---

*Phase -1 done. Foundation locked. To Phase 0.*
