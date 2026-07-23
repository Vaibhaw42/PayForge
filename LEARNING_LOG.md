# LEARNING_LOG

Daily learning journal. One entry per session. Written in Vaibhaw's own words after a topic is taught + quizzed. This file is portfolio-grade evidence of what has been mastered.

Format per entry:

```
## YYYY-MM-DD · Phase N · Topic
**What I learned (in my own words):**
- ...

**Key mental models:**
- ...

**Quiz results:**
- Q1: ✅/❌ (correction if ❌)
- ...

**Open questions / gaps to revisit:**
- ...

**Artifacts produced:**
- `docs/...`
```

---

## 2026-07-20 · Phase -1 · Kickoff

**What I learned:**
- Locked project: PayForge, personal fintech platform, learning-first.
- Locked stack (see `README.md`).
- Locked 14-phase roadmap (see `ROADMAP.md`).
- Locked collab rules (see `AGENTS.md` and `CLAUDE.md`).
- Decision: India-first domain focus (UPI + cards + RBI). Global patterns second.
- Env ready: Node 22 (pinned via `.nvmrc`), pnpm 11.15 (via corepack), Docker Desktop 29.6.1, Rosetta installed.

**Artifacts produced:**
- Repo scaffold: `README.md`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `STATUS.md`, `LEARNING_LOG.md`
- Doc skeletons: `docs/{domain,architecture,api,db,decisions,runbooks}/README.md`
- `.gitignore`, `.nvmrc`, `.node-version`

---

## 2026-07-21 · Phase -1 · Day 1 · Money Movement + Actors

**What I learned (in my own words — corrected + refined via coach Q&A):**

- The **four-corner model** of card payments: cardholder + issuer on one side, merchant + acquirer on the other, network in the middle. Everything else (PA, PG, processor) is glue slotting into one of the corners.
- **PA vs PG** is not a rename — it's an RBI legal category. PA can hold merchant funds in escrow; PG cannot. RBI's March 2020 PA/PG guidelines drew that line.
- **Two flows on the same rails** — messages (real-time, seconds) and money (T+1 batch). Bugs in fintech live at the boundary between them.
- **Network's dual role**: switch/router in messages; clearer + settlement facilitator in money. Never approves/denies — that is always the issuer.
- **UPI is architecturally different from cards** — NPCI runs a central switch on top of IMPS. Real-time money movement. No interchange. 0% MDR for P2M.
- **TPAP vs PSP Bank** — TPAP is the app (PhonePe); PSP Bank is the licensed bank behind it (YES Bank). NPCI accepts only banks as endpoints, so every TPAP contracts with 1+ PSP Banks.
- **VPA is a routing token** — `alice@ybl` maps to a bank account via NPCI's registry. Suffix identifies the PSP Bank, not the user's actual account bank.
- **Static QR reconciliation fails at scale** — no order id means manual matching. Dynamic QR with `tr=order-id` is mandatory for e-commerce. This becomes a first-class feature in PayForge Phase 4.
- **UPI monetization** — PSPs subsidize UPI via RuPay-CC-on-UPI MDR, BBPS commissions, cross-sell (insurance, MFs, gold, credit), merchant hardware (soundbox), ads.
- **India-specific regs** — RBI PA/PG guidelines, sponsor bank requirement, data localization (2018), UPI 0% MDR mandate, NPCI's operational scope (UPI, IMPS, NACH, AePS, RuPay, BBPS, NETC, CTS).

**Key mental models locked:**

- **Auth → Capture → Clearing → Settlement** — the four-stage payment lifecycle. Auth places a hold; capture converts to debit; clearing computes net between banks; settlement moves actual money. Miss this and Phase 4+ bugs will feel mystical.
- **RBI regulates. NPCI operates.** RBI licenses banks/PAs and writes rulebooks. NPCI runs the switches.
- **UPI = customer acquisition cost.** Monetize with financial products stacked on top.

**Quiz results (initial attempt on 20 glossary + 3 cards Q + 4 UPI Q):**

- Initial pass: ~30–40% correct on first attempt.
- Common mistakes:
  - Confused **PG** with **PA** (mixed tech vs licensed money handling)
  - Confused **TPAP** with **PSP Bank** (app vs bank behind the app)
  - Placed PA on the **issuing side** (wrong — PA is acquiring-side)
  - Attributed **approve/deny** to the network (wrong — always issuer)
  - Confused **clearing** (net-calc, no money moves) with **debit**
- All fixed in-line during Q&A; refined glossary + section text reflect the corrections.

**Open questions / gaps to revisit:** _(to fill Section 7 of actors.md)_

**Artifacts produced:**

- `docs/domain/actors.md` — full write-up: 20-term glossary, cards ecosystem, UPI ecosystem, ₹1000 money trace, fee breakdown, India-specific regs, open questions placeholder.

**Next session:** Day 2 — **Payment Methods** deep-dive (cards, UPI, netbanking, wallets, EMI, BNPL). Before starting Day 2, fill Section 7 of `actors.md` with honest gaps.

---

## 2026-07-21 · Phase -1 · Day 2 · Payment Methods Deep-Dive

**What I learned (in my own words, corrected in Q&A):**

**Cards:**
- Three card types (debit/credit/prepaid) share the same rails but differ in what the issuer's auth check verifies (balance / credit limit / loaded value).
- **EMV chip** generates a **cryptogram (ARQC)** per transaction — one-time signature using issuer-shared secret. That's why cloning fails. Magstripe was static → easy to copy → deprecated.
- **3D Secure (3DS)** proves cardholder-presence in card-not-present flows (OTP/biometric/passkey with the issuer). India RBI mandates OTP for all domestic e-comm since 2013.
- **Liability shift:** merchant did 3DS → issuer eats fraud loss. Merchant skipped 3DS on a required txn → merchant eats loss.
- **Tokenization** ≠ cryptograms. Token is a persistent, merchant-scoped PAN substitute. Bound to (merchant + real PAN + network). Reusable for subscriptions. Stolen tokens are useless because merchant-scope is enforced at auth.
- **PCI DSS scope reduction** — never let raw PAN touch merchant server. Standard patterns: PSP-hosted checkout (SAQ A), iframe/hosted fields (SAQ A/A-EP), client-side tokenization JS like Stripe Elements (SAQ A-EP). Server-side PAN handling (SAQ D) = full audits, avoid.
- **PayForge hard rule:** `payment_methods` table stores tokens only. No PAN in logs, URLs, webhooks, ever.

**UPI:**
- Five acceptance methods: Static QR, Dynamic QR, Intent deep-link, Collect, AutoPay.
- **`tr` (transaction reference)** field in UPI URI = merchant's order id, echoed back on webhook. This is what enables auto-reconciliation.
- **`tr` vs `utr`:** `tr` is merchant-generated (order id). `utr` is NPCI-generated (12-digit unique settlement ref). Both are stored.
- **UPI AutoPay** = mandate stored at NPCI + payer's PSP Bank. Merchant sends {mandate_id, amount, cycle} to trigger recurring debit. 24-h pre-debit notification rule for high-value.
- **Credit Line on UPI vs RuPay CC on UPI** — both bring credit to UPI's UX, but different rails: credit line uses UPI rails (small MDR); RuPay CC on UPI uses **card rails** underneath (full ~2% MDR). Distinct products.
- **U69 "deemed approve"** — debit succeeded, credit confirmation never came back. The reconciliation nightmare. Solution: idempotency on `tr` + polling PSP status API + three-state ledger (PENDING/SUCCESS/FAILED) + EOD reconciliation.
- **Design principle locked:** *absence of failure ≠ success. Only positive confirmation counts.*

**Netbanking, Wallets, EMI, BNPL:**
- Netbanking share dropped 15% → ~3-5% in India because UPI's UX, 0% MDR, real-time settlement, mobile-first all beat it. Still used for high-value / older cohorts.
- **Three PPI types:** open-loop (Paytm wallet — usable everywhere), closed-loop (Zomato Money — only inside brand), semi-closed-loop (Sodexo — contracted merchant network). Closed-loop is a **retention weapon** via instant refunds locking customers in.
- **"No-cost EMI":** never actually free. Merchant, brand, or occasionally card issuer pays the interest. Sometimes the trick is inflating sticker price then "discounting" back. RBI has flagged deceptive ads.
- **EMI vs BNPL rule:** ticket ≥ ₹5000 + infrequent → card EMI. Ticket ₹100–5000 + frequent → BNPL. Ticket < ₹100 → UPI only.

**Key mental models locked (Day 2):**

- **Cryptogram (per-txn) vs Token (persistent)** — the two mechanisms I keep swapping. Comparison table in `payment-methods.md` §1.5 is my emergency lookup.
- **Liability shift on 3DS** — who eats fraud loss.
- **`tr` = merchant's key to reconciliation** — no `tr`, no auto-reconcile.
- **Three-state ledger** — PENDING/SUCCESS/FAILED. Fulfill only on SUCCESS. This is Phase 4 core.
- **Merchant method choice = ticket size × customer segment × unit economics.** No merchant offers everything from day one.

**Quiz results (Day 2):**
- 13 questions total (5 cards + 4 UPI + 4 netbanking/wallets/EMI/BNPL).
- Roughly 50-60% correct on first attempt, corrected in-place.
- Recurring confusion: **cryptogram vs token** (twice). Locked with a comparison table.
- Cleared misconceptions: PA-issuing-side (already from Day 1), credit-line vs RuPay-CC-on-UPI, EMI-vs-BNPL ticket-size fit.

**Artifacts produced:**

- `docs/domain/payment-methods.md` — full write-up: 8 sections spanning cards, UPI, netbanking, wallets, EMI, BNPL, merchant decision framework, and open questions.

**Next session:** Day 3 — **Transaction lifecycle + states** (`docs/domain/txn-lifecycle.md`). State machines, retry semantics, idempotency contracts. Before starting Day 3, fill Section 8 of `payment-methods.md` with honest gaps.

---

## 2026-07-23 · Phase -1 · Day 3 · Transaction Lifecycle + States

Biggest domain day so far. Direct input to Phase 4 (Payment Engine) code contracts.

**What I learned (in my own words, corrected via Q&A):**

**Foundations:**
- Booleans cannot model real payments (10+ states, post-success events like chargebacks). State machines are non-negotiable.
- **The single most important rule: money is never un-moved.** Refund and chargeback are new rows, not row updates. Ledger is append-only.
- **Persist state locally, don't derive from PSP on every read.** PSP is source of truth for the wire; my DB is source of truth for my system.

**8-state unified payment intent model** (learned mid-quiz that I'd taught 7 initially, then corrected to 8 with REQUIRES_CAPTURE for auth-only flows):
- REQUIRES_PAYMENT_METHOD → REQUIRES_CONFIRMATION → REQUIRES_ACTION → PROCESSING → SUCCEEDED / FAILED / CANCELED. REQUIRES_CAPTURE for auth-only.
- Cancel legal in pre-flight + REQUIRES_CAPTURE only. PROCESSING onwards = only refund can undo.
- Payment intent ≠ order ≠ ledger entry. Three separate domains, linked by foreign keys.

**Card sub-states inside PROCESSING:**
- AUTH_PENDING → AUTH_APPROVED → CAPTURE_PENDING → CAPTURED → SETTLEMENT_PENDING → SETTLED
- Sale (auth+capture in one) vs Auth-only (capture separate). Auth-only used by hotels, Uber, marketplaces, petrol pumps.
- Void (auth reversal) is cheap + fast; refund is slow + expensive. Prefer void when capture hasn't happened.
- Decline codes: hard vs soft failed. 51/05/14/54 = hard. 91/96 = soft. **U28 (insufficient funds) is HARD, not soft** — retry doesn't create money.

**UPI state transitions:**
- No auth/capture split — atomic on the wire. No REQUIRES_CAPTURE, no void.
- Sub-states: INITIATED → AT_NPCI → DEBIT_PENDING → CREDIT_PENDING → CREDIT_SUCCESS / DEEMED_APPROVE / AUTO_REVERSED.
- **U69 deemed-approve stays external PROCESSING** — never fulfill. Poll status API. NPCI auto-reverses if credit truly failed (~T+2h) or late-confirm succeeds (up to 24h).
- **AutoPay mandate is a SEPARATE state machine from debit execution.** A failed debit does NOT kill the mandate. Netflix retries per its policy while mandate stays ACTIVE.

**Refund lifecycle:**
- Refund = new state machine object. Payment intent state remains SUCCEEDED forever.
- Partial refunds allowed. Invariant: `SUM(non-failed refunds) ≤ payment_intent.amount`. Concurrency-safe via SELECT FOR UPDATE.
- MDR usually not refunded to merchant — merchant eats fee on refund.
- Instant refund via IMPS available at extra cost.

**Chargeback lifecycle — very different from refund:**
- Refund = merchant-initiated, cooperative. Chargeback = customer-initiated via issuer, adversarial.
- 8-state adversarial state machine: DISPUTE_OPENED → UNDER_REVIEW → REPRESENTED → WON/LOST → ARBITRATED optional.
- Customer has ~120 days to dispute. Merchant has 7-14 days to represent with evidence.
- Chargeback rate > 1% is red-flag; >1.8% is termination-worthy. Consequences: rolling reserve, MDR bumps, network fines.
- Ledger effect distinct from refund: freezes funds, then either releases (WON) or debits (LOST) + fee.

**Idempotency (game-changing correction):**
- **Same key + same body = REPLAY cached response (do NOT reject).** I inverted this on Q-D3-17 — critical fix.
- Same key + different body = 409 Conflict (misuse).
- Concurrency race handled via unique-constraint INSERT with state='in_progress'.
- Webhook dedup on **event_id** (not body hash) — PSPs may include retry counters, timestamps in body.
- Idempotency key ≠ resource id. Key is one-shot, request-scoped. Resource id is stable.

**Retry semantics — the biggest lesson locked:**
- **Retry writes. Poll reads.** Confuse these = double-charge customers.
- Exp backoff + jitter (AWS formula) prevents thundering herds.
- Retry budget = max attempts + max wall-clock time. Budget exhausted → DLQ, page on-call.
- Circuit breakers OPEN/CLOSED/HALF_OPEN cut retry storms at scale.
- Non-terminal states (PROCESSING, DEEMED_APPROVE) require POLL, not retry.
- Response class decision: 4xx don't retry; 5xx retry with backoff; terminal FAILED (hard) don't retry, (soft) smart route; non-terminal state poll.

**Reconciliation:**
- Three loops: real-time (5-10s poll), hourly sweep, EOD settlement-file compare.
- Recon state machine per row: MATCHED / AMOUNT_MISMATCH / STATE_MISMATCH / MISSING_LOCAL / MISSING_REMOTE.
- Missed-webhook is common enough to auto-remediate (trust PSP truth, retroactively emit downstream events).
- Silent reconciliation failure is one of the worst anti-patterns — money leaks over months.
- **Aggregate reads (dashboards, settlement summaries) come from local DB.** Never call PSP for weekly totals — got this one wrong on Q-D3-23, need to lock.

**15 anti-patterns catalogued** — from `is_paid: boolean` to trusting client-side amounts. Each has caused a real production incident somewhere.

**Recurring mistakes (things to lock before Phase 4):**
- **Persist locally vs derive from PSP** — got Q-D3-23 wrong despite §1.4. Re-read.
- **Retry vs poll for non-terminal states** — got Q-D3-21 right but instinct still leans retry.
- **Refund vs chargeback** — got Q-D3-14 muddled despite Section 6.
- **Idempotency contract** — got Q-D3-17 fundamentally wrong (inverted purpose of the key). Locked with re-teach.
- **Cryptogram vs token** — carried over from Day 2. Watch.
- **Mandate state vs debit state** — got Q-D3-12 muddled despite §4.6.

**Key mental models locked:**

- **REQUIRES_ACTION = customer's turn. PROCESSING = system's turn. REQUIRES_CAPTURE = merchant's turn.**
- **Money never un-moved — only compensated with new rows.**
- **Retry writes, poll reads. When you don't know the outcome, poll.**
- **Same idempotency key + same body = replay. Same key + different body = 409. Different key = new operation.**
- **Refund is cooperative + merchant-initiated. Chargeback is adversarial + customer-via-issuer.**
- **Local DB is source of truth for MY system. PSP is source of truth for the wire. Reconcile at EOD.**

**Quiz results:**
- 24 questions across 8 topic sections.
- Roughly 40-50% correct on first attempt.
- Multiple critical corrections made (idempotency-key purpose inversion, PSP-on-every-read, mandate-state vs debit-state).
- The recurring confusions (persist-vs-derive, refund-vs-chargeback, retry-vs-poll) are the ones to burn into instinct before writing Phase 4 code.

**Artifacts produced:**

- `docs/domain/txn-lifecycle.md` — 11 sections, ~1200 lines. State-machine diagrams for payment intent (8-state), card sub-states, UPI sub-states, refund, chargeback, AutoPay mandate, reconciliation. Full idempotency contract + retry decision tree + 15 anti-patterns.

**Next session:** Day 4 — **Money representation + double-entry ledger 101**. Deliverables: `money-math.md` + `ledger-101.md`. Before Day 4, fill Section 11 of `txn-lifecycle.md`.
