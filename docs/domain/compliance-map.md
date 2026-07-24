# compliance-map.md — Regulatory Landscape for PayForge

> Phase -1 · Day 6 deliverable. Every PayForge feature is checked against this map before implementation.
>
> India-first regulatory scope. Rules paraphrased as engineering context — never as legal advice.
>
> Governing decision: [ADR-0001](../decisions/ADR-0001-simulate-pa-no-real-money.md) — we simulate PA architecture without real money; production-grade engineering elsewhere.

---

## 1 · Regulator + operator map

| Body | Type | Sets rules on | Grants licenses for |
|------|------|---------------|---------------------|
| **RBI** (Reserve Bank of India) | Central bank + regulator | Banks, NBFCs, PA/PG, PPI, Payments Banks, monetary policy | PA/PG, Bank, NBFC, PPI, Payments Bank |
| **NPCI** | Operator (not regulator) | UPI, RuPay, IMPS, NACH, AePS, BBPS, NETC, CTS | TPAP approval, PSP Bank approval |
| **FIU-IND** | AML intelligence | STR/SAR reporting, PMLA reports | — |
| **CERT-In** | Cybersecurity | Incident reporting, cybersecurity controls | — |
| **MeitY** | IT policy | IT Act 2000, DPDP Act 2023 | — |
| **GST Council + CBIC** | Tax | GST rules, tax invoices | GSTIN registration |
| **Ministry of Finance** | Policy | UPI 0-MDR mandate, RuPay push | — |
| **SEBI** | Securities regulator | MFs, equities on wallets/apps | If PayForge distributes MF |
| **IRDAI** | Insurance regulator | Insurance distribution | If PayForge distributes insurance |

Rule: whenever RBI says "must have X license" and PayForge doesn't, we can't do that feature until we have the license OR route through a licensed partner.

---

## 2 · RBI PA/PG Guidelines (March 2020)

The single most important regulation for PayForge.

### 2.1 · What it did

Formally recognized:

- **PA (Payment Aggregator)** — can hold merchant funds temporarily in escrow. RBI-licensed.
- **PG (Payment Gateway)** — pure tech; cannot hold funds. No license needed.

### 2.2 · Key rules for PAs

- **Minimum net worth** — ₹15 crore to apply, ₹25 crore ongoing.
- **Escrow account** at a scheduled commercial bank (sponsor bank):
  - No commingling with own funds.
  - No interest earned by PA on escrow.
  - No working-capital use.
  - Strict weekly reconciliation.
- **Settlement timeline** — merchant funds settled within T+1 (or as per agreement).
- **Merchant KYC** — PA's responsibility.
- **Data localization** — see §5.
- **Cybersecurity** — ISO 27001, PCI DSS, VAPT, incident response plans.
- **Grievance redressal** — published + 30-day response SLA.
- **RBI reporting** — monthly + on-demand.

### 2.3 · Key rules for PGs (non-PA)

- Zero fund handling. The moment they touch money, they must be a PA.
- Basic security (encryption, PCI DSS).
- No RBI license required.

### 2.4 · What PayForge is

Per ADR-0001: **PayForge simulates PA architecture end-to-end** — no real money, but every design assumes PA rules apply. To go real, would need PA license.

### 2.5 · Timeline (for real-world applicants — info only)

- Application → 6-12 months RBI review.
- In-principle approval → 1 year to satisfy conditions.
- Full authorization.
- Ongoing: annual audits, quarterly reports.

---

## 3 · PCI DSS

Recap and expansion of `payment-methods.md` §1.6.

### 3.1 · Levels (annual card txn volume)

| Level | Volume | Requirements |
|-------|--------|--------------|
| Level 1 | > 6M txns/yr | External QSA + ROC, quarterly ASV scan, pentesting |
| Level 2 | 1M–6M | SAQ D + external scan |
| Level 3 | 20k–1M e-comm | SAQ D |
| Level 4 | < 20k | SAQ A / A-EP |

PayForge at real-scale would be Level 1. Learning-time PayForge stays out of scope via PSP-hosted UI — SAQ A minimal.

### 3.2 · The 12 PCI DSS requirement families

1. Secure network — firewalls, no default passwords.
2. Protect cardholder data — never store CVV; PAN encrypted.
3. Vulnerability management — anti-virus, patches.
4. Access control — need-to-know, unique IDs.
5. Monitor + test networks — access tracking, scans.
6. Information security policy — documented, communicated.

### 3.3 · Sensitive Authentication Data (SAD) — never store

- Full track / chip data.
- CVV / CVC / CVV2 / CID.
- PIN / PIN block.

Storing SAD = criminal violation. Both RBI and PCI enforce.

### 3.4 · PAN storage (if ever)

- Encrypted at rest with strong key management (HSM preferred).
- Truncated on display (`411111******1111`).
- Tokenized where possible (RBI mandate Oct 2022).
- Access logged.

### 3.5 · PayForge PCI stance (locked, per ADR-0001)

- No raw PAN in DB, ever.
- Token-only. Entry via PSP-hosted UI or client-side tokenization JS.
- Target **SAQ A** (out of scope entirely).
- CVV never seen — PSP handles.

---

## 4 · KYC / AML

### 4.1 · Two KYC contexts

- **Customer KYC** — done by issuing bank (cards) or PSP Bank (UPI VPA). PayForge inherits.
- **Merchant KYC** — done by PA. PayForge's responsibility.

### 4.2 · Merchant KYC requirements

- PAN card (mandatory).
- GSTIN (for GST-registered).
- Bank account proof (cancelled cheque / statement).
- Address proof.
- Incorporation docs (for corporates).
- Director/promoter KYC (for corporates).
- Business type + MCC (Merchant Category Code) declared.
- Website / app URL verified.
- Penny-drop verification — send ₹1, verify beneficiary name matches business name.

### 4.3 · Ongoing monitoring

- Volume + txn pattern anomaly detection.
- MCC drift (declared "clothing" but transacts like "gaming").
- Chargeback rate.
- Complaint / dispute rate.

### 4.4 · AML

- Every txn screened against sanction lists (OFAC, UN, MHA).
- Txns > ₹10L → CTR (Cash Transaction Report).
- Structured txns (multiple smaller to evade CTR) → flagged.
- Suspicious patterns → STR to FIU-IND.

PayForge Phase 8 (Fraud Detection) implements this.

---

## 5 · Data localization (RBI, April 2018)

### 5.1 · The rule

**All payment system data stored ONLY in India:**

- Transaction details
- Payer + payee info
- Bank details
- Card details / tokens
- IP, geo, device info

### 5.2 · Copies abroad — conditional

Copy may exist abroad only **after** primary storage in India, for legitimate global-processor use (e.g., Visa's global fraud engine). Must be recallable on demand.

### 5.3 · PayForge implications

- Primary DB in India — AWS `ap-south-1` (Mumbai) or `ap-south-2` (Hyderabad).
- Backups replicated only within India regions.
- Vendors constrained — cloud, monitoring, logging must offer Indian regions.
- DR site in India.

### 5.4 · Enforcement

- Annual audit by external auditor (RBI-empaneled).
- SAR (System Audit Report) filed with RBI.
- Non-compliance → license suspension.

---

## 6 · FIU-IND + STR/SAR reporting

### 6.1 · FIU-IND

Financial Intelligence Unit — India. Central AML intelligence agency. Reports to Ministry of Finance.

### 6.2 · Reports a PA must file

- **CTR** (Cash Transaction Report) — cash > ₹10L in a day.
- **STR** (Suspicious Transaction Report) — flagged patterns.
- **CBWTR** (Cross-Border Wire Transfer Report) — international transfers.
- **NTR** (Non-profit Transaction Report) — NGO accounts.

### 6.3 · STR triggers

- Structuring (multiple smaller txns to evade CTR).
- Round-number txns (₹9,99,999).
- Sanction-list match.
- Merchant category mismatch (declared "IT" but pattern looks like "gambling").
- Rapid volume escalation.

### 6.4 · Timelines

- STR filed within 7 days of detection.
- Reports retained 10 years.
- FIU-IND audits anytime.

---

## 7 · PMLA (Prevention of Money Laundering Act, 2002)

### 7.1 · What it does

Criminalizes money laundering. Requires PAs / banks / NBFCs to:

- KYC all customers / merchants.
- Retain txn records for 5 years, STRs for 10 years.
- Disclose beneficial ownership for corporate accounts.
- Cooperate with Enforcement Directorate.

### 7.2 · Penalties

- Fines up to ₹1L per contravention.
- Imprisonment for repeat offenders.
- License revocation.

### 7.3 · PayForge implications

- `merchants` retained 5+ years after account closure.
- `payment_intents`, ledger postings retained 5+ years.
- STR events retained 10 years.
- **Deletion forbidden in retention window — immutable log required.**

---

## 8 · GST invoicing for payment services

### 8.1 · Rate

**18% GST** on payment service fees (MDR + markup) — not on the underlying txn amount.

### 8.2 · Invoice requirements

- Merchant GSTIN + PA GSTIN.
- Fee amount (MDR + markup).
- GST 18% split:
  - **CGST 9% + SGST 9%** — intra-state (merchant + PA same state).
  - **IGST 18%** — inter-state.
- Invoice number (sequential per FY).
- HSN/SAC code for payment services.

### 8.3 · PayForge implications

- `merchants` stores GSTIN + state code.
- Ledger posts CGST + SGST separately for intra-state, IGST for inter-state.
- Monthly aggregate invoice, sequential numbering.
- 6-year retention (GST Act).

**Worked example — merchant in Karnataka, PA in Maharashtra:** different states → **IGST 18%** applies. No CGST/SGST split.

---

## 9 · IT Act 2000 + DPDP Act 2023

### 9.1 · IT Act 2000

- Recognizes electronic contracts + signatures.
- §43A — reasonable security practices for sensitive personal data.
- §66 — cyber offenses.
- §79 — intermediary liability.

### 9.2 · DPDP Act 2023 (Digital Personal Data Protection)

Newer. Replaces earlier IT Rules for personal data.

- **Data fiduciary** (PayForge) must:
  - Consent-based processing.
  - Breach notifications to Data Protection Board.
  - Data subject rights: access, correction, erasure.
  - Appoint DPO if large-scale processor.
- **Cross-border transfer** — restricted (list of allowed countries; India-preferred).
- **Penalties** — up to ₹250 crore.

### 9.3 · Interaction with RBI localization

RBI's payment localization is stricter than DPDP's cross-border rules. **Follow stricter (RBI).**

---

## 10 · Recent RBI directions (2022-2026)

- **Card-on-File Tokenization** (Oct 2022) — merchants cannot store raw PAN; must use network tokens.
- **e-Mandate for cards** (Oct 2021, refined 2023) — recurring card debits need explicit registered mandate + 24-h notification.
- **UPI 0-MDR** for P2M (Jan 2020, ongoing).
- **RuPay Credit Card on UPI** (Jun 2022) — enabled; MDR applies.
- **Credit Line on UPI** (Sep 2023) — bank pre-sanctioned lines accessible via UPI.
- **PA-CB Guidelines** (Oct 2023) — cross-border PA license category.
- **Payments Vision 2025** (2022) — RBI's digital-first roadmap.
- **Offline digital payments framework** — UPI Lite sub-₹500 offline.
- **NPCI 30% TPAP market cap** — deferred multiple times; latest deadline Dec 2026.
- **DPDP Act phased rollout** (2024-2026).

---

## 11 · What PayForge can/can't do — feature-by-feature license map

| Feature | Requires license | Workaround for learning-PayForge |
|---------|------------------|-----------------------------------|
| Hold merchant funds in escrow | RBI PA license | Simulate — no real money (ADR-0001) |
| Store raw PAN | PCI Level 1 + RBI approval | **Never do it** — use tokens |
| Issue prepaid wallet | RBI PPI license | Out of scope |
| Extend credit (BNPL) | NBFC license | Out of scope; partner with NBFC |
| Distribute insurance | IRDAI | Out of scope |
| Distribute mutual funds | SEBI | Out of scope |
| Cross-border remittance | RBI FEMA license | Out of scope |
| UPI-PSP interface | Scheduled bank + NPCI approval | Out of scope; simulate |
| Card issuance | RBI banking + network membership | Out of scope |
| Merchant onboarding + KYC | RBI PA license | Simulate as PA |
| Payment processing (routing only) | PG (no license needed) | Simulate |
| Ledger + reconciliation | Internal | **Build fully** |
| Fraud detection | Internal | **Build fully** |
| Analytics + reporting | Internal | **Build fully** |
| Webhook engine | Internal | **Build fully** |

Bottom line: PayForge simulates PA architecture end-to-end but never touches real money. See [ADR-0001](../decisions/ADR-0001-simulate-pa-no-real-money.md).

---

## 12 · What I still don't understand

Candidate gaps (Vaibhaw to fill):

- **PA-CB (Cross-Border PA)** — how the Oct 2023 guidelines change PA architecture for international flows.
- **DPDP Act — data subject erasure** vs PMLA 5-year retention conflict. How does the retention override work legally?
- **STR filing mechanics** — is it an API to FIU-IND, or manual form? Turnaround expectations?
- **Sponsor bank agreements** — what specific clauses affect engineering (e.g., escrow reconciliation cadence)?
- **NPCI 30% TPAP cap** — will it actually be enforced Dec 2026? Impact on PhonePe / GPay?
- **PCI DSS 4.0** (adopted Mar 2024) — what's different from 3.2.1?

**Instruction to future me:** re-read §2 (RBI PA guidelines) + §11 (feature-license map) any time considering a new feature. If the feature needs a license we don't have, we simulate — never fake real regulatory approval.
