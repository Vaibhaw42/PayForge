# actors.md — Payment Ecosystem Actors & Money Movement

> Phase -1 · Day 1 deliverable. Written by @Vaibhaw42 with Q&A guidance.
> Focus: India-first (UPI + cards + RBI). Global patterns second.

---

## 1 · Glossary

- **Issuer** — the bank that issued the customer's card (credit or debit). Holds the customer's funds (debit) or extends credit (credit card). Bears fraud/credit risk. Earns **interchange** on every transaction — biggest single slice of the MDR pie.
- **Acquirer** — the bank with an acquiring relationship to the merchant (directly, or via a PA like Razorpay). Receives settled funds from the card network on the merchant's behalf. Earns a slice of MDR. Bears chargeback + merchant risk. In India: HDFC, ICICI, Axis, SBI are large acquirers.
- **Card Network (Visa / Mastercard / RuPay / Amex)** — the messaging switch + rulebook that routes transactions between issuers and acquirers and guarantees settlement between member banks. Publishes operating rules for chargebacks, disputes, and liability shifts. Earns a **scheme / assessment fee** (~0.10–0.15%) per transaction. **RuPay** is India's domestic scheme, operated by **NPCI**.
- **Payment Gateway (PG)** — pure tech middleware that encrypts, tokenizes, and routes card/UPI transactions between the merchant's checkout and the network/PA. **Cannot legally hold merchant funds** — that requires a PA license (RBI, 2020). Handles PCI-scope work: 3D Secure challenge, tokenization, hosted checkout. Revenue = per-txn processing fee.
- **Payment Aggregator (PA)** — a licensed non-bank entity that pools payment flows from many merchants under a single acquiring relationship, so small merchants can accept cards without signing directly with a bank. Merchant funds sit in the PA's **nodal / escrow account** at its **sponsor bank** for up to T+1 (or per contract) before payout. Requires an RBI PA license (mandated by RBI's March 2020 PA/PG guidelines). Revenue = markup on MDR (charges merchant more than its acquiring cost, keeps the spread). Examples: Razorpay, Cashfree, PayU, CCAvenue.
- **PSP (Payment Service Provider)** — umbrella term for any company providing payment services to merchants (may be a PG, a PA, or both). Stripe, Adyen, Razorpay are all PSPs. In the **UPI context** specifically, "PSP Bank" is a scheduled commercial bank licensed by **NPCI** to run the UPI-PSP interface on behalf of a **TPAP** app — YES Bank for PhonePe, HDFC/Axis for GPay, Paytm Payments Bank (historically) for Paytm. A TPAP app cannot talk to NPCI directly; must route through its PSP Bank.
- **Processor** — a backend tech vendor that runs the actual switching, authorization, and settlement software *on behalf of* the issuing or acquiring bank. Not a hop in the merchant's visible flow — an invisible layer inside the bank. **Issuer processors** (FIS, TSYS, Fiserv, M2P, Zeta) run card management + auth for issuers. **Acquirer processors** (Worldline, Fiserv, First Data) run POS + settlement for acquirers. Banks pay per-transaction.
- **Nodal / Escrow account** — a segregated bank account at a scheduled commercial bank (the PA's sponsor bank) where a PA holds merchant funds **in trust** before payout. Legally ringfenced: the PA cannot commingle these funds with its own operating cash, use them as working capital, or earn interest on them. If the PA becomes insolvent, merchant funds are protected. RBI mandates strict reconciliation and audit. Pre-2020 term was "nodal"; RBI's 2020 PA guidelines switched to "escrow" to emphasize the trust nature — both terms used interchangeably today.
- **Sponsor bank** — a scheduled commercial bank that hosts a PA's nodal/escrow account and acts as the regulatory + operational bridge between the non-bank PA and the payment rails (networks, NPCI, RBI). Every PA must have one; a non-bank cannot connect directly to rails. Bears compliance responsibility for the PA's activity on its account. **Concentration risk:** if the sponsor bank hits trouble, PA operations stall — the YES Bank moratorium (March 2020) froze PA/TPAP flows briefly. Large PAs mitigate by diversifying across multiple sponsors. In UPI, the equivalent is the **PSP Bank** for a TPAP.
- **MDR (Merchant Discount Rate)** — the percentage fee a merchant pays on every card transaction to accept payment. Deducted from the transaction amount before payout, so the merchant receives `amount − MDR`. Split across **interchange** (issuer, biggest slice), **scheme/assessment fee** (network), **acquirer margin**, **PA/PSP markup**, plus **18% GST** on the fees. India card MDR ranges roughly 1.5–2.5% (RBI caps by card type; AMEX/Diners up to 3.5%). **UPI P2M MDR is 0%** (government mandate, Jan 2020); PSPs subsidize UPI via card MDR and adjacent revenue like BBPS, cross-sell, and ads. RuPay debit is also 0% MDR for small transactions.

---

## 2 · Cards ecosystem

_(pending)_

---

## 3 · UPI ecosystem

_(pending)_

---

## 4 · Money-flow trace — ₹1000 card txn end-to-end

_(pending)_

---

## 5 · Fee breakdown

_(pending)_

---

## 6 · India-specific notes (RBI, NPCI, PA/PG, UPI)

_(pending)_

---

## 7 · What I still don't understand

_(pending)_
