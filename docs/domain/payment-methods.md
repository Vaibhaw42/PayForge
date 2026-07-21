# payment-methods.md — Payment Methods Deep-Dive

> Phase -1 · Day 2 deliverable. Focus: India-first — cards, UPI, netbanking, wallets, EMI, BNPL.
>
> For actors (who does what) see [`actors.md`](./actors.md). This doc is about **what** each method is, how it works, and its tradeoffs.

---

## 0 · Method comparison snapshot

| Method | Rail | Auth latency | Money latency | India MDR (P2M) | Failure rate | Use when |
|--------|------|--------------|---------------|-----------------|--------------|----------|
| Debit card | Card networks | ~1–3s | T+1 | 0–0.9% (RBI-capped) | Low | Mass adoption; RuPay ≤ ₹2000 is free |
| Credit card | Card networks | ~1–3s | T+1 | 1.8–2.5% | Very low | Premium checkouts, EMI, points-earners |
| Prepaid card | Card networks | ~1–3s | T+1 | Similar to debit | Low | Wallets loaded to card, gift cards |
| UPI | NPCI switch | ~2–5s | Real-time | **0%** (P2M) | Higher (~2–3%) | Default in India; QR + Intent |
| Netbanking | Bank hosted-page | ~10–30s | T+1 typical | ~0.9–1.5% | Higher, UX-heavy | High-value, older cohort, non-UPI users |
| Wallets (PPI) | Wallet-issuer's own | Sub-second | Real-time to T+1 | ~1.5% | Very low (in-wallet) | Small-ticket P2M, apps |
| EMI (card-based) | Card network + issuer | 3–10s | T+1 | Merchant subvented / customer-interest | Low | High-ticket goods |
| Cardless EMI | Lender NBFC + KYC | 30s–days (first time) | T+1 | Merchant subvented | Medium | ZestMoney-style, EMI without card |
| BNPL | Lender NBFC | Sub-second (post-onboard) | T+1 | ~1.5–2% | Low | Repeat customers, small-ticket |

---

## 1 · Cards deep-dive

### 1.1 · Three card types

| Type | Funds source | Auth check verifies | RBI angle |
|------|--------------|--------------------|-----------|
| **Debit** | Customer's bank account | Available balance + daily/channel limits | RBI caps MDR by MCC |
| **Credit** | Issuer's credit line to customer | Available credit (limit − outstanding − held) + risk rules | Risk-priced |
| **Prepaid (PPI)** | Loaded balance on the card | Loaded balance + KYC-tier limits | RBI PPI Master Directions govern |

All three share **identical card rails** — same ISO 8583 messages, same actors, same T+1 settlement. Only the issuer's internal auth check differs.

### 1.2 · Card anatomy

- **PAN** (Primary Account Number) — 16-digit card number.
- **BIN** (first 6 digits) — identifies issuer + card type. Networks route by BIN.
- **Expiry**, **CVV/CVC**, **cardholder name**.
- **EMV chip** — tamper-resistant cryptographic microprocessor.
- **Magstripe** — static-data legacy strip (being phased out; India mandated chip+PIN issuance ~2015).
- **NFC / contactless** — tap-to-pay antenna.

### 1.3 · EMV — chip beats magstripe

- **Magstripe** stores **static data**. Any reader copies it byte-for-byte → cloning trivial.
- **EMV chip** holds an **issuer-shared secret key** that never leaves the chip. On every txn, the chip signs the txn data (amount, terminal id, timestamp, counter) with the key and produces an **ARQC (Application Request Cryptogram)** — a one-time signature.
- The issuer verifies the signature (only they hold the key). Replay attacks fail because the counter/timestamp change every txn. Extracting the key from the tamper-resistant chip is infeasible at consumer scale.

Mental model: *magstripe = photocopy; chip = ink-signature that changes every time.*

### 1.4 · 3D Secure (3DS) — the online cardholder-presence layer

For card-not-present (e-commerce), no chip → merchant has only PAN + CVV + expiry, all of which are phishable. **3DS** adds a **cardholder-presence check** at the issuer.

- **How it works:** at auth, merchant/PSP calls the issuer's **3DS server**; issuer challenges the customer (**OTP / biometric / passkey**); customer answers; assertion returns; auth continues.
- **3DS 2.0** allows **risk-based silent challenges** ("frictionless auth" for low-risk sessions), still fully liability-shifted.
- **Liability shift:**
  - Merchant did 3DS → txn is 3DS-authenticated → if fraud is reported later, **issuer eats the loss.**
  - Merchant skipped 3DS on a 3DS-required txn → **merchant eats the loss** — chargeback with no defense.
- **India:** RBI mandates OTP for **all** domestic e-commerce card txns since 2013 — skipping 3DS is not an option locally. Merchants only face the skip decision on cross-border txns.

### 1.5 · Tokenization

**Problem:** storing raw PAN is a PCI DSS nightmare and a breach jackpot.

**Solution:** replace PAN with a **merchant-scoped, persistent token**.

- Token is bound to `(merchant, real PAN, network)` — sometimes also to a card reference number the network issues.
- **Reusable** — subscriptions and saved cards use the same token for months/years.
- **Merchant scope enforced at auth** — network+issuer verify the request is coming from the same merchant the token was issued to. Cross-merchant token hopping fails.

Regulated in India by RBI's **Card-on-File tokenization mandate (Oct 2022)** — merchants cannot store raw PAN; must use tokens issued by the network (Visa Token Service / MC MDES / RuPay Tokenization).

**Cryptogram vs Token — the two easy-to-confuse mechanisms:**

| Mechanism | Purpose | Lifetime | Bound to |
|-----------|---------|----------|----------|
| **Cryptogram (ARQC)** | Prove card present at THIS transaction | One transaction only | Issuer–chip shared secret |
| **Token** | Replace stored PAN | Months / years | Merchant + real PAN + network |

### 1.6 · PCI DSS & scope reduction

**PCI DSS** = Payment Card Industry Data Security Standard. Applies to any system that **stores, processes, or transmits** Cardholder Data (PAN, CVV, expiry) or Sensitive Authentication Data.

**Rule of thumb:** if raw PAN touches your server, you're in scope. In scope = costly audits, quarterly scans, key management, network segmentation.

**Standard scope-reduction patterns (ranked from least to most PCI burden):**

| # | Pattern | How | Scope |
|--:|---------|-----|-------|
| 1 | **PSP-hosted checkout page** | Redirect customer to PSP's domain (`checkout.razorpay.com/...`). PSP handles all card data. Merchant gets a webhook with txn id + token. | SAQ A — smallest |
| 2 | **Iframe / hosted fields** | PSP serves an iframe embedded in merchant checkout. Card input lives on PSP's origin. | SAQ A or A-EP |
| 3 | **Client-side tokenization JS** (Stripe Elements / Razorpay Standard Checkout) | PSP JS binds card fields; on submit, POSTs card data directly to PSP → returns opaque token to merchant JS → merchant server sends token to PSP to charge. | SAQ A-EP |
| 4 | **Server-side PAN handling** | Merchant server receives raw PAN → proxies to PSP. | SAQ D — full scope, expensive |

**PayForge decision (learning-first):** never touch raw PAN on our servers. Choose Pattern 1 or 3 at Phase 4 and record as an ADR.

**Hard rules for PayForge:**
- `payment_methods` table stores **tokens only**, never PAN.
- No PAN in logs, URLs, webhooks, or crash traces. Ever.
- Card entry always via PSP-hosted UI or PSP JS.

### 1.7 · Auth latency + common failure modes

Auth latency is 1–3 s typical; up to 30 s under retry loops.

| Failure | Cause | Common decline code |
|---------|-------|--------------------|
| Insufficient funds / limit | Balance/limit exhausted | 51 |
| Bad OTP | 3DS challenge failed | 3DS failure |
| Do not honor | Generic issuer risk flag — most common, opaque | 05 |
| Card expired | Expiry past | 54 |
| Fraud flag | Issuer risk engine | 59 |
| Invalid card | Bad PAN | 14 |
| Timeout | Any upstream hop | (retry) |

**Merchant defenses against high failure:** smart routing across acquirers (PA's job), scheme fallback (Visa → RuPay), method fallback (card → UPI).

### 1.8 · India card quirks

- **RBI OTP mandate** — all domestic e-comm requires OTP (since 2013).
- **Tokenization mandate** — since Oct 2022, merchants cannot store raw PAN.
- **e-Mandate for recurring** — subscriptions require explicit mandate registration with issuer (RBI-controlled).
- **Debit MDR caps** by MCC.
- **RuPay push** — govt mandate: RuPay debit ≤ ₹2000 is 0% MDR; RuPay CC on UPI carries MDR under the hood.



---

## 2 · UPI deep-dive

Day 1 covered UPI ecosystem (TPAP, PSP Bank, NPCI). This section is the **methods themselves** and their tradeoffs.

### 2.1 · Five UPI acceptance methods (merchant POV)

| Method | Initiation | Where used | Reconciliation |
|--------|-----------|------------|----------------|
| **Static QR** | Payer scans printed QR, enters amount | Kirana, small shops | Manual — name + amount + UTR |
| **Dynamic QR** | Payer scans per-order QR (amount + `tr` embedded) | E-commerce, POS | Automatic via `tr` |
| **UPI Intent (deep-link)** | Merchant app fires `upi://pay?...` → OS app picker → pre-filled | Merchant mobile apps | Automatic via `tr` |
| **UPI Collect** | Merchant pushes collect req to payer VPA | Bill pay, some subs | Automatic (req id) |
| **UPI AutoPay (e-Mandate)** | One-time mandate approval → recurring auto-debits | Netflix, EMI, SIPs | Automatic (mandate id) |

### 2.2 · UPI Intent deep-link + Dynamic QR (same URI, different delivery)

Both encode the same URI scheme:

```
upi://pay?pa=merchant@ybl
        &pn=PayForge
        &am=500.00
        &cu=INR
        &tr=ORDER-8842
        &tn=PayForge+order+8842
```

Fields:

- `pa` — payee VPA (required)
- `pn` — payee name
- `am` — amount
- `cu` — currency (INR)
- `tr` — **transaction reference** = merchant's order id. **This is the field that enables auto-reconciliation.** Echoed back on webhook.
- `tn` — transaction note (customer-facing memo)
- `mc` — merchant category code (optional)

Delivery split:

- **Dynamic QR** = the URI encoded as a QR image (desktop checkout scan).
- **UPI Intent** = the URI fired as a deep-link (mobile app → OS shows installed UPI apps → user picks → app opens pre-filled).

**Design rule for PayForge:** generate **one URI per order**, expose as both QR (desktop) and Intent link (mobile). Same `tr`, same reconciliation.

### 2.3 · Reconciliation IDs — `tr` vs `utr`

| Field | Who generates | Purpose |
|-------|--------------|---------|
| **`tr`** | **Merchant** — one per order | Merchant's own tracking id; links webhook back to order |
| **`utr`** | **NPCI** — one per successful UPI txn | 12-digit unique reference; used for bank-statement reconciliation |

Both must be stored on the merchant side. Miss either and reconciliation breaks.

### 2.4 · UPI AutoPay (e-Mandate) — the subscription rail

**Problem:** UPI is push-only by default. How does Netflix debit you every month?

**Solution:** a **mandate** stored in NPCI's mandate registry **and** payer's PSP Bank (redundantly).

**Two-phase flow:**

1. **Mandate creation (one-time)** — merchant sends mandate params to PSP → NPCI creates mandate: "authorize up to ₹499/month on `payer@ybl` for merchant PayForge until 2028-01-01". Payer approves with PIN. Mandate id returned.
2. **Recurring execution** — merchant sends `{mandate_id, amount, cycle}` to PSP → NPCI checks mandate active + amount ≤ cap + within frequency + funds → debits.

**Rules:**

- **24-hour pre-debit notification** to payer via TPAP push/SMS, mandatory for high-value debits (thresholds evolve with RBI).
- Payer can revoke mandate anytime.
- Merchant can pause/resume.

**PayForge:** subscription products need a `mandates` table (mandate_id, payer_vpa, cap, frequency, next_debit_at, status). This lands in Phase 4/6.

### 2.5 · UPI Lite — small, low-friction, offline-capable

- **Per-device on-device wallet** loaded from payer's bank account.
- Balance cap ₹2000 (raised from earlier ₹500 → ₹2000; keeps increasing).
- Per-txn cap ₹500 (raised from ₹200).
- **No PIN required** for txns from the on-device balance.
- **Works offline** — txn goes through, syncs later.

Trade-off: fast + frictionless, but small ticket. Merchant sees credit only when device syncs.

### 2.6 · UPI 123Pay — UPI for feature phones

For ~300M feature-phone users. Four modes: IVR, missed-call callback, ultrasonic sound, feature-phone apps. Rarely needs direct merchant handling — usually routed through PSP layer. **Not day-one PayForge scope**, but know it exists.

### 2.7 · Credit on UPI — two distinct flavours

Both spend credit via UPI's UX, but the rails differ:

| Feature | **Credit Line on UPI** | **RuPay Credit Card on UPI** |
|---------|------------------------|-------------------------------|
| Sponsor | Bank pre-sanctions a credit line to customer | Bank issues RuPay CC to customer |
| Physical card | No | Yes (RuPay-branded card) |
| Rail | **UPI (NPCI switch)** | **Card rails (RuPay network)** — UPI is only the front-end UX |
| MDR | ~1% (RBI allows MDR here) | Full card-tier MDR (~2%) |
| Repayment | Bank bill cycle | Card bill cycle |
| Live since | 2023 (RBI enabled) | 2022 |

**Why this matters:** UPI's 0% MDR punishes PSPs. Credit-on-UPI (either flavour) **restores revenue**. Expect PhonePe/GPay to push these variants aggressively at checkout.

### 2.8 · UPI International

Live corridors (as of 2026):

- **Inbound tourism** — UAE, Singapore, France, Sri Lanka, Nepal, Bhutan, Mauritius. Foreign wallet → NPCI → Indian merchant.
- **Outbound spend by Indians** — UAE, Singapore, Bhutan, Nepal.
- Interoperability at NPCI + partner scheme, currency conversion at partner side.

**PayForge:** not day-one. Merchant VPAs already support foreign payers — zero extra work.

### 2.9 · UPI failure modes

UPI's failure rate is higher than cards (~2–3% vs <1%). Merchants must plan for retries + fallbacks.

| Code | Meaning | Response |
|------|---------|----------|
| **U16** | Payer's bank unavailable | Retry, or suggest another UPI app / method |
| **U28** | Insufficient funds | Show error; suggest lower amount |
| **U54** | PIN attempts exceeded | Wait period / fallback |
| **U66** | Beneficiary bank down | Retry to a different beneficiary VPA if available |
| **U69** | **"Deemed approve"** — debit succeeded, credit confirmation never returned | See §2.10 |
| Timeout | Any leg slow | Poll status; UI shows processing |

### 2.10 · U69 "deemed approve" — the classic reconciliation bug

Symptom: payer's bank debits the money, but the credit-confirmation path times out. Merchant doesn't see success; customer sees "debited but processing".

**Danger:** if merchant treats it as failure → customer might pay again → free goods on double-fulfil. If merchant assumes success → refund/dispute if credit truly failed.

**Safety nets and playbook:**

- **NPCI auto-reverses** the debit within a fixed window (~T+2h) if credit truly failed. Late-arriving success is also possible (up to 24h).
- **Merchant playbook (real code in Phase 4):**
  1. **Idempotency** — everything keyed to your `tr`. Duplicate webhooks / re-attempts with same `tr` = one txn.
  2. **Polling / Status Query API** — call PSP's `/status?tr=...` every ~5s / on webhook / on customer refresh, until a terminal state (`success` / `failed`).
  3. **Three-state ledger** — `PENDING` / `SUCCESS` / `FAILED`. Fulfill **only on SUCCESS**, never on PENDING.
  4. **End-of-day reconciliation** — reconcile PSP's settlement file against your ledger; catch any silently-resolved PENDING.

**Design principle:** *In payments, absence of failure ≠ success. Only positive confirmation counts.*

### 2.11 · UPI limits

- **Per-txn (P2P/P2M)** — ₹1L standard; specific categories (tax, education, insurance, capital markets) up to ₹5L / ₹5cr.
- **Daily** — typically ~20 txns / ₹1L, varies by PSP Bank.
- **UPI Lite** — ₹500/txn, ₹2000 device balance.
- **Merchants have no cap on receiving.** Caps are sender-side.

### 2.12 · UPI vs Card — merchant tradeoff snapshot

| Dimension | UPI | Card |
|-----------|-----|------|
| MDR (P2M) | 0% | 1.5–2.5% |
| Auth latency | 2–5s | 1–3s |
| Money latency | Real-time | T+1 |
| Failure rate | ~2–3% | <1% |
| Ticket size | Small–medium (₹1L standard cap) | Small to very large |
| Global reach | India-only (corridors expanding) | Global |
| Chargeback risk | Very low (real-time, KYC binding) | Real (5–7% e-comm typical) |
| Recurring | AutoPay (e-Mandate) | e-Mandate on card |
| UX | 3 taps (scan → amount → PIN) | Multi-step (details → OTP) |
| Refund latency | Real-time | 5–7 business days |

**When merchant picks UPI:** small-ticket, India-only audience, MDR-sensitive.
**When merchant picks card:** large-ticket, international, subscriptions with saved cards, EMI.
**Real answer:** offer **both** and let customer choose. PayForge should support both from Phase 4.



---

## 3 · Netbanking

Payment via customer's bank internet-banking portal — customer redirected from merchant checkout to their bank's hosted page, logs in, authorizes debit, returns.

### 3.1 · Flow

1. Merchant checkout lists ~50+ Indian bank options.
2. Customer picks bank → redirected to bank's netbanking portal.
3. Customer logs in (username + password + OTP).
4. Bank shows txn confirmation with amount.
5. Customer approves.
6. Bank sends payment via NEFT/IMPS to merchant's acquirer.
7. Bank redirects back to merchant with success/fail marker.

### 3.2 · Properties

- **Auth latency:** 10–30 s (customer types password + OTP; slow bank sites even slower).
- **Money latency:** T+1 typical; some banks IMPS-instant.
- **MDR:** ~0.9–1.5% depending on bank.

### 3.3 · Failure modes

- **High UX drop-off** — 30–40% abandonment during bank redirect (slow bank sites, session timeouts).
- Bank portal downtime — several banks have poor uptime.
- Customer forgets password → drop-off.
- Return-URL mismatch → merchant sees no confirmation → orphaned txn (reconciliation via bank statement or PSP status API).

### 3.4 · Why netbanking is dying

Share in Indian e-comm dropped from ~15% (2018) to ~3–5% today because:

- **UPI's UX is dramatically better** (3 taps vs 8+, no passwords, no OTP fatigue on top of login OTP).
- **UPI's 0% MDR** vs netbanking's ~1% — merchants push UPI.
- **Mobile-first India** — netbanking was designed for desktop, painful on phones.
- **No session-timeout drop-offs, no redirect loops** on UPI.
- **Real-time money** on UPI vs T+1 on netbanking.

### 3.5 · When netbanking is still relevant

- Older cohorts (cards + UPI-averse).
- High-value txns (₹1L+, above UPI cap for some banks).
- Bank cashback promotions.
- Government / utility payments where netbanking is default.

**India integration nuance:** PSPs aggregate all ~50 banks into one checkout dropdown — merchant integrates once via PSP, not per bank. Historic aggregators here were **BillDesk** and **CCAvenue**.



---

## 4 · Wallets (PPI — Prepaid Payment Instruments)

RBI-defined category. A wallet is a **prepaid balance stored on the wallet-issuer's books**, tied to the customer's KYC.

### 4.1 · Three PPI KYC tiers (RBI Master Directions)

| Tier | KYC | Balance cap | Load/mo | Merchant use |
|------|-----|-------------|---------|--------------|
| **Small (Min-KYC)** | Mobile OTP | ₹10k | ₹10k | P2M only, no cash-out |
| **Full-KYC** | Aadhaar + PAN or video KYC | ₹2L | Unlimited (sub-limits apply) | P2P + P2M + cash-out to bank |
| **Gift** | Buyer's KYC | ₹10k | One-time load | P2M only, no reload |

### 4.2 · Three loop types

- **Open-loop PPI** — usable at any merchant that accepts it. Paytm Wallet, PhonePe Wallet, Amazon Pay Wallet. MDR applies at external merchants.
- **Closed-loop PPI** — usable **only inside issuer's own ecosystem**. Zomato Money, Swiggy Money, Ola Money (early). RBI has minimal jurisdiction over closed-loop.
- **Semi-closed-loop PPI** — usable across a **contracted merchant network**, not full-open. Sodexo food coupons is the classic example.

### 4.3 · Properties

- **Auth latency:** sub-second to 2 s.
- **Money latency:** real-time to T+1 (issuer settles to merchant).
- **MDR:** ~1.5% for open-loop wallets.

### 4.4 · Failure modes

- Insufficient wallet balance → decline.
- KYC expired (RBI mandates periodic re-KYC) → wallet blocked until refreshed.
- Wallet issuer downtime (rare — wallets are operationally reliable).

### 4.5 · Why wallets declined + where they're still relevant

Post-UPI, wallets collapsed in India — UPI directly debits bank accounts, cutting out the wallet middleman. Wallets still useful for:

- **Refund locking** — merchant refunds to closed-loop wallet → customer uses it next time → retention play + zero-MDR next txn.
- **Sub-optimal bank customers** on UPI (bank not supported / down).
- **Loyalty / prepaid programmes** (gift cards, employee benefits).

### 4.6 · Paytm Payments Bank collapse (2024) — concentration risk

RBI restricted Paytm Payments Bank in early 2024 → Paytm wallets migrated to Axis / YES / SBM. Textbook example of concentration risk on a PPI issuer: single-bank dependency broke the entire wallet's operations for weeks.



---

## 5 · EMI (Equated Monthly Installments)

Customer splits payment into monthly installments. Merchant gets full amount upfront (or after subvention offset); customer pays lender monthly.

### 5.1 · Three flavours

**Card-based EMI:**
- Customer's credit-card issuer converts the txn into EMI at checkout.
- Merchant integrates with issuer's EMI API via PSP.
- Customer picks tenure, gets OTP, issuer creates EMI plan.
- Merchant receives: full amount − MDR (~1.8–2.2%).
- Customer pays: monthly installments to issuer with EMI interest (~13–18% APR, or subvented to 0%).

**Cardless EMI (NBFC-backed):**
- No credit card required. Customer applies at checkout with PAN + Aadhaar.
- **Lender NBFC** (ZestMoney, EarlySalary, Cashe, Kissht, LendingKart, Flipkart's underlying NBFC) does instant credit check.
- First-time onboarding: 30 s–days for underwriting. Repeat: sub-second.
- Merchant receives: full amount − MDR (~2%) or − subvention (for no-cost EMI).

**Bank-EMI on debit card:**
- Some banks (HDFC, ICICI, Axis) offer EMI on debit — customer's savings balance is blocked, then EMI-ed. Rare but growing.

### 5.2 · "No-cost EMI" — where the interest actually comes from

Nothing is free — someone pays. Three payers:

- **Merchant subvention** — merchant discounts the sticker price by the EMI interest so customer pays a flat monthly = product cost / tenure. Merchant's margin absorbs the interest.
- **Manufacturer subvention** — brand pays (Apple + HDFC + Amazon "no-cost EMI" campaigns).
- **Card issuer marketing budget** (rarer) — issuer funds it as a cashback offer.

**Common trick:** the sticker price is silently inflated to include the interest, then "discounted" back to make it look free. RBI has flagged deceptive advertising and now mandates disclosure of the effective rate.

**PayForge design lesson:** if we ever offer EMI, track **actual cost to merchant** (subvention line) separately in the ledger. Never pretend it is zero on our books.

### 5.3 · Merchant economics

- Regular EMI: MDR ~2%, no subvention.
- No-cost EMI: MDR + subvention (~5–12% of the ticket depending on tenure). Very expensive per txn — but converts high-ticket sales that would otherwise abandon.



---

## 6 · BNPL (Buy Now Pay Later)

Short-term credit at checkout — buy now, pay in 14–30 days or in 3-4 installments. No credit card required.

### 6.1 · How BNPL differs from EMI

| Aspect | EMI | BNPL |
|--------|-----|------|
| Tenure | 3–36 months | 14–30 days (Pay Later) or 3–4 installments (Split) |
| Interest | 13–18% APR (or subvented) | 0% if paid on time; 24–36% if late |
| Underwriting | Full credit check first time | Very light — mobile+Aadhaar KYC + behavioural scoring |
| Ticket size | ₹5k–₹5L | ₹100–₹50k (small-ticket focus) |
| Repayment | Auto-debit each month | Single bill at cycle end OR 3-4 split |

### 6.2 · Examples

- **Simpl** (India) — Pay Later, 15-day cycle.
- **LazyPay** (PayU) — Pay Later + Later Split.
- **Amazon Pay Later**, **Flipkart Pay Later**.
- **Slice** (India) — card-like BNPL.
- **Klarna, Affirm** (US/EU) — Split-Pay 4×.
- **ZestMoney** (India) — hybrid EMI + BNPL.

### 6.3 · Checkout flow

1. Customer picks BNPL at checkout.
2. First-time: quick KYC (mobile OTP + PAN + sometimes Aadhaar).
3. NBFC underwrites in seconds using bureau data + behavioural signals.
4. Approved → merchant paid immediately; customer's BNPL account gets the debit.
5. Customer repays via UPI/card/netbanking at end of cycle.

### 6.4 · Merchant economics

- **MDR:** ~1.5–2% (slightly higher than UPI/debit due to underwriting cost baked in).
- **AOV uplift:** removing "do I have money right now?" friction boosts conversion and average order value in impulse categories.

### 6.5 · RBI 2022 restrictions

RBI restricted non-bank prepaid wallets from being loaded with credit lines (2022) — killed a subclass of BNPL that funded wallet balances from credit lines (LazyPay's wallet model had to change). Legit BNPL today routes through **licensed NBFCs directly**, not wallet-mediated.

### 6.6 · When BNPL fits vs EMI (merchant rule of thumb)

- **Ticket ≥ ₹5000** and **infrequent** → card EMI.
- **Ticket ₹100–₹5000** and **frequent / impulse** → BNPL.
- **Ticket < ₹100** → UPI only, no credit product.

BNPL is a **conversion tool** for small-ticket high-frequency categories: food delivery, fashion, gaming, groceries. EMI is a **conversion tool** for high-ticket infrequent categories: electronics, furniture, travel, education.

Design mistake to avoid: don't offer EMI on ₹300 checkouts — clutters UI and confuses users.



---

## 7 · Which method to accept when — merchant decision framework

No merchant accepts everything from day one. Choose based on customer segment, ticket size, unit economics, and regulatory scope.

### 7.1 · Choose by ticket size

| Ticket | First method | Fallbacks |
|--------|--------------|-----------|
| **< ₹500** | UPI | Wallets, BNPL, no card |
| **₹500 – ₹5,000** | UPI | Debit card, BNPL |
| **₹5,000 – ₹50,000** | UPI + Credit card | EMI (card-based), Cardless EMI |
| **₹50,000 – ₹5L** | Credit card + EMI | Netbanking, Cardless EMI |
| **> ₹5L** | Netbanking + RTGS + Credit card | EMI |

### 7.2 · Choose by customer segment

| Segment | Preferred methods | Why |
|---------|-------------------|-----|
| Tier-1 urban, tech-native | UPI, credit card | Speed + rewards |
| Tier-2/3 India | UPI, debit card | UPI ubiquity, no credit access |
| Older cohorts | Netbanking, cards | Trust in bank UI |
| Students / young | UPI + BNPL | No credit card yet |
| High-net-worth | Credit card, EMI, netbanking | Rewards + high ticket |
| International customers | Credit card, PayPal | UPI not yet global-default |

### 7.3 · Choose by category

| Category | Must accept | Should offer |
|----------|-------------|--------------|
| Food delivery, quick commerce | UPI, BNPL | Wallets |
| Fashion, small e-comm | UPI, cards, BNPL | Wallets, PPI |
| Electronics, appliances | UPI, cards, **EMI (card+cardless)** | BNPL for accessories |
| Travel, hotels | Cards, UPI, EMI, netbanking | Wallets for refunds |
| Education, insurance, tax | Netbanking, cards, UPI | AutoPay for premiums |
| Subscriptions | UPI AutoPay, card e-Mandate | Wallets |

### 7.4 · Choose by unit economics

- **Low margin (< 10%):** minimize MDR → UPI first, restrict card use, no EMI subvention.
- **Mid margin (10–30%):** accept UPI + cards + BNPL, absorb MDR.
- **High margin (> 30%):** offer EMI + no-cost EMI as conversion tools, absorb subvention.

### 7.5 · PayForge's phased method rollout

- **Phase 4 (Payment Engine):** cards + UPI as first two methods. State machine, idempotency, mock PSP.
- **Phase 7+ (post-Ledger + Webhook):** add wallets, netbanking, EMI, BNPL as new connectors on the same engine.
- **Not day-one:** international UPI, UPI 123Pay, feature-phone flows.



---

## 8 · What I still don't understand

Vaibhaw to fill honestly after re-reading. Coach will close gaps before Day 3.

Candidate gap areas to consider:

- ISO 8583 fields I'd need to know (or not) at PayForge's abstraction level.
- Exactly which network calls (e.g. VTS API for tokenization) belong at merchant vs PSP layer.
- UPI mandate lifecycle (create → suspend → revoke → expire) — need a state diagram of my own.
- BNPL / EMI economics — subvention accounting on the ledger is still fuzzy.
- Netbanking reconciliation without webhooks — practical fallback path.
- PPI KYC re-verification cycles (RBI Master Directions detail).
- Failure retry policies per method — how many retries, over what window, before terminal.

- ...
- ...

**Instruction to future me:** don't skip. Naming the gap is 90% of closing it.

