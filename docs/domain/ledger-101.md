# ledger-101.md — Double-Entry Accounting for Fintech

> Phase -1 · Day 4 (part 2) deliverable. Direct input to Phase 5 (Double-Entry Ledger).

Fintech ledgers are the source of truth for every rupee that moves. This doc locks the vocabulary and invariants a real ledger must enforce.

---

## 1 · Why fintech needs a ledger

A `payment_intents` table records what happened at the wire (state machines, retries). It does not answer:

- How much does PayForge owe merchant X right now?
- How much MDR did we earn this month?
- What's my net payable balance at end of March?
- Show every rupee that touched my account, categorised.
- Reconcile: total captured = paid out + fees + unsettled + reversed.

These are **accounting** questions. Every serious payment company runs a **separate double-entry ledger** alongside the payment engine. Stripe, Adyen, Razorpay all do. PayForge's Phase 5 delivers this.

Two different domains:

- **payment_intents** — what happened on the wire.
- **ledger** — who owes whom, right now.



---

## 2 · Double-entry — the fundamental rule

**Every transaction is recorded as at least two equal and opposite postings.**

Money doesn't appear or vanish — it moves **between accounts**.

```
Customer paid ₹1000
  DR customer_receivable  ₹1000
  CR merchant_payable     ₹1000

  SUM(DR) = ₹1000 = SUM(CR) ✓
```

The equality `SUM(DR) = SUM(CR) per journal entry` is the invariant that catches every bug. If your ledger is off by ₹1, the journal entry cannot be committed — something is wrong upstream.



---

## 3 · Accounts and account types

Every posting hits an **account**. An account has: unique code + slug, type, **normal balance direction**, currency.

Five account types:

| Type | Normal balance | Meaning | Example |
|------|---------------|---------|---------|
| **Asset** | DR | PayForge owns | `cash_nodal_yesbank`, `customer_receivable` |
| **Liability** | CR | PayForge owes | `merchant_payable`, `tax_payable_gst` |
| **Revenue** | CR | Money earned | `mdr_income` |
| **Expense** | DR | Cost of business | `refund_expense`, `chargeback_fee_expense` |
| **Equity** | CR | Owner's stake | (not day-one) |

Normal balance direction tells you which side increases the account. For an asset, DR increases (more cash on hand). For a liability, CR increases (we owe more).

**Why `merchant_payable` is a liability, not an asset:** money we owe merchants is not our own money. It sits in our nodal (asset side) but we can never claim it — it's a debt.

Balance sheet identity at any point in time:

```
cash_nodal   ≈  merchant_payable + tax_payable_gst + merchant_payable_frozen
(asset)          (liabilities)
```

If `cash_nodal < merchant_payable`, PayForge is technically insolvent for merchant obligations — the failure mode RBI's nodal-escrow rules exist to prevent.



---

## 4 · Chart of accounts for PayForge

Baseline chart (Phase 5 seed). Every posting hits one account from this list.

```
ASSETS (DR normal)
  1001  cash_nodal_yesbank              funds in PayForge's nodal at YES Bank
  1002  cash_nodal_icici                secondary sponsor bank
  1010  customer_receivable             owed from customer, before capture
  1020  psp_receivable                  in flight from PSP to us

LIABILITIES (CR normal)
  2001  merchant_payable                owed to merchants, ready to pay out
  2002  merchant_payable_frozen         frozen due to open chargebacks
  2010  customer_prepaid                customer credits sitting (rare)
  2020  tax_payable_gst                 GST collected, owed to govt
  2030  merchant_payable_reserve        rolling reserve on high-risk merchants

REVENUE (CR normal)
  3001  mdr_income                       our fee earnings
  3002  markup_income                    additional PA markup on MDR

EXPENSES (DR normal)
  4001  interchange_paid                 to issuers, pass-through
  4002  scheme_fee_paid                  to networks, pass-through
  4003  acquirer_fee_paid                acquirer cut, pass-through
  4010  chargeback_fee_expense           chargebacks lost + fees
  4020  refund_expense                   refund-processing fees if any
  4030  fx_loss                          FX conversion cost
```

Accounts are typed + immutable. Never repurpose. Add new codes, don't reuse old.



---

## 5 · Journal entries + postings — three-table shape

Three tightly linked tables at three granularities:

```sql
create table accounts (
  id           uuid primary key,
  code         text not null unique,       -- '1001'
  slug         text not null unique,       -- 'cash_nodal_yesbank'
  type         text not null,              -- 'asset'|'liability'|'revenue'|'expense'|'equity'
  normal       char(2) not null,           -- 'DR'|'CR'
  currency     char(3) not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table journal_entries (
  id             uuid primary key,
  merchant_id    uuid not null,
  event_type     text not null,           -- 'payment.succeeded'|'refund.succeeded'|...
  ref_type       text,                    -- 'payment_intent'|'refund'|'dispute'
  ref_id         text,
  currency       char(3) not null,
  posted_at      timestamptz not null default now(),
  metadata       jsonb
);

create table postings (
  id                    uuid primary key,
  journal_entry_id      uuid not null references journal_entries(id),
  account_id            uuid not null references accounts(id),
  direction             char(2) not null,  -- 'DR'|'CR'
  amount_minor          bigint not null,
  currency              char(3) not null,
  created_at            timestamptz not null default now(),
  constraint amount_positive check (amount_minor > 0)
);

create index on postings (account_id, created_at);
create index on postings (journal_entry_id);
```

Granularities:

- **Account** — the ledger dimension (a column of the balance sheet).
- **Journal entry** — one event. Groups its postings.
- **Posting** — one DR or CR line hitting one account.

**One journal entry = 2+ postings. `SUM(DR) = SUM(CR)` within the JE.**



---

## 6 · Invariants the ledger MUST enforce

**L1 — DR = CR per journal entry.** Enforced at write time; reject unbalanced entries.

```sql
create function check_je_balanced() returns trigger as $$
begin
  if (
    select sum(case when direction='DR' then amount_minor else -amount_minor end)
    from postings where journal_entry_id = new.journal_entry_id
  ) <> 0 then
    raise exception 'journal entry not balanced';
  end if;
  return new;
end;
$$ language plpgsql;

create constraint trigger je_balanced
after insert on postings
deferrable initially deferred
for each row execute function check_je_balanced();
```

**L2 — postings are immutable.** No UPDATE, no DELETE on `postings` and `journal_entries`. Fixes = compensating JEs (§7). Grant permissions such that even ops cannot UPDATE these tables.

**L3 — currency consistency within a journal entry.** All postings within one JE must be the same currency. Cross-currency = a new JE with explicit FX rate metadata.

**L4 — atomicity.** A journal entry and all its postings write in ONE database transaction. Never a half-posted entry.

**L5 — accounts are typed + immutable.** Never repurpose an account. Add new codes.



---

## 7 · Immutability + compensating entries

The ledger never lies about the past. Bugs are fixed by **compensating journal entries**, not updates.

Example: accidentally posted `DR merchant_payable / CR mdr_income ₹100` (wrong direction on JE-001).

```
JE-002 (compensating)
  DR mdr_income        100     -- reverse the wrong CR
  CR merchant_payable  100     -- reverse the wrong DR
  metadata: { corrects: 'JE-001', reason: 'DR/CR direction inverted' }
```

Net: `mdr_income = 100 − 100 = 0`, `merchant_payable` unchanged. Both entries visible.

**Why never UPDATE:**

1. Audit trail lost — auditor cannot see "what did ledger say at 14:32 yesterday?"
2. RBI compliance — immutable financial records for 5+ years.
3. Fraud detection — historical patterns depend on immutability.
4. Consistency — every derived report is built assuming append-only.



---

## 8 · End-to-end walkthrough — ₹1000 payment life

Trace every JE in the life of one ₹1000 card txn (MDR 2%, GST 18% on MDR). Amounts in paise.

### JE-A · payment succeeded

```
DR customer_receivable   100000     (asset ↑)
CR merchant_payable      100000     (liability ↑)
```

We owe merchant ₹1000.

### JE-B1 · MDR recognised

```
DR merchant_payable        2000     (liability ↓ — we take our cut)
CR mdr_income              2000     (revenue ↑)
```

### JE-B2 · GST on MDR recognised

```
DR merchant_payable         360     (liability ↓ — we collect GST for govt)
CR tax_payable_gst          360     (liability ↑ — we owe govt)
```

After JE-A + JE-B1 + JE-B2: `merchant_payable = 100000 − 2000 − 360 = 97640` paise. Merchant will receive ₹976.40.

### JE-C · payout to merchant

```
DR merchant_payable       97640     (liability ↓ — we no longer owe)
CR cash_nodal_yesbank     97640     (asset ↓ — money left our nodal)
```

`merchant_payable = 0`. Payment fully closed. Money now in merchant's own bank via RTGS.

### JE-D · refund initiated (customer wants ₹1000 back)

```
DR merchant_payable      100000     (liability ↑ — we owe customer)
CR customer_receivable   100000     (asset ↓)
```

We've already paid out ₹97640 to merchant. `merchant_payable` may go negative → clawback from merchant's next settlement (business rule, not ledger's problem).

Original MDR usually **not refunded** — merchant eats ~₹23.60 net loss.

### Final tally for txn + full refund

- **4 journal entries** (A, B1, B2, C, D... actually 5 JEs)
- **10 postings**
- `mdr_income = ₹20`
- `tax_payable_gst = ₹3.60` (owed to govt regardless of refund)
- `cash_nodal = −₹976.40` (outflow to merchant)
- `merchant_payable = −₹976.40` (owed back by merchant, clawback)

Everything visible, nothing deleted.

### For a ₹500 UPI P2M txn (0% MDR, 0% GST)

Simpler:
- JE-A: 2 postings, DR customer_receivable / CR merchant_payable
- JE-C (payout): 2 postings, DR merchant_payable / CR cash_nodal
- **4 postings across 2 JEs.** No MDR, no GST.

UPI = **3× less ledger volume** than a card txn.



---

## 9 · Ledger reads — balances, statements, reports

**Account balance** for an account:

- Asset / Expense: `SUM(DR) − SUM(CR)`
- Liability / Revenue / Equity: `SUM(CR) − SUM(DR)`

```sql
create view account_balances as
select
  a.id, a.slug, a.type, a.currency,
  case
    when a.normal = 'DR' then
      coalesce(sum(case p.direction when 'DR' then p.amount_minor else -p.amount_minor end), 0)
    when a.normal = 'CR' then
      coalesce(sum(case p.direction when 'CR' then p.amount_minor else -p.amount_minor end), 0)
  end as balance_minor
from accounts a
left join postings p on p.account_id = a.id
group by a.id;
```

**Materialised balances (Phase 11 perf work):** cache `account_balances` in a table, incrementally updated per posting via trigger. Turns `O(n_postings)` reads into `O(1)`.

**Reports:**

- **Merchant statement** — postings filtered by `merchant_id`, grouped by day, DR/CR/net columns.
- **MDR report** — sum `mdr_income` per month.
- **GST report** — sum `tax_payable_gst` per state (CGST/SGST split).



---

## 10 · Reconciliation from the ledger

Two invariants that MUST hold every EOD:

- `cash_nodal_yesbank` (per PayForge ledger) **==** actual balance at YES Bank (per bank statement).
- `merchant_payable` (per PayForge ledger) **==** sum of merchant balance views (per merchant portal).

Any drift = a bug somewhere upstream (missed webhook, wrong posting direction, race). Ops investigates via a **reconciliation report** (Phase 6 + Phase 10).

**Monthly external audit:** RBI + external auditors demand ledger-vs-bank match. Being off by rupees is a serious finding.



---

## 11 · What I still don't understand

Vaibhaw to fill honestly. Candidate gaps:

- **Materialised balance concurrency** — under 1000 QPS of postings, is the trigger-based cache safe? Deadlocks?
- **Chart of accounts evolution** — how to add / rename accounts over time without breaking historical postings?
- **Multi-currency merchant** — how to model a merchant with balances in both INR and USD? Two rows in `merchant_payable`? Or per-currency account slugs (`merchant_payable_inr`, `merchant_payable_usd`)?
- **Chargeback ledger vs dispute state machine** — do frozen funds move via JE (with `_frozen` account) or via a state field on `merchant_payable`? The former is cleaner but adds JEs.
- **Trigger complexity** — for L1 balanced-JE check, is a deferrable constraint trigger the right pattern? Or better to enforce at application layer?

**Instruction to future me:** re-read §2 (DR=CR invariant), §6 (L1-L5), §7 (compensating entries) before writing any Phase 5 code.

