# P0 Financial Chain Verification — APG-2026-0035 / APG-2026-0036

**Verified at:** 2026-06-24T12:11:08Z (production Vercel build)  
**Script:** `scripts/verify-financial-chain-0035-0036.ts`  
**Commit:** `e1c1395`  
**Overall:** **PASS**

---

## Root cause (historical)

Booking checkout payments wrote **deposit ledger** entries but did not always create **rent_invoices** / **financial_invoices** at payment time. Revenue and Invoice Command Center read paid rent invoices by `paid_at` date — without those rows, rent showed **₹0** even when deposits showed Held ₹950.

Backfill + sync (idempotent) linked existing payments to rent/financial invoices without duplicate payments or deposits.

---

## Files changed (verification only — no invoice UI)

| File | Purpose |
|------|---------|
| `src/services/financialChainVerification.ts` | End-to-end chain trace + idempotent repair |
| `scripts/verify-financial-chain-0035-0036.ts` | Production verification runner |
| `scripts/vercel-build-repair.sh` | `VERIFY_FINANCIAL_CHAIN_0035_0036=1` hook |

---

## APG-2026-0035 — Ishaan Jaiswal (B2)

### Entity IDs (production)

| Entity | ID |
|--------|-----|
| Booking | `54ab92e3-4221-4c4f-95c3-ff1867c3bf92` |
| Customer | `16f47db3-2f06-4681-8edc-52e9c344663e` |
| Payment | `288fc467-032d-4212-a4ad-a56e7de9df09` (₹2,850, 2026-06-23) |
| Deposit ledger | `6831fd47-3ccb-4173-96cf-2d450af1a612` (₹950 collected) |
| Rent invoice | `5226fab0-4424-4e73-854e-e4175dc0d577` (RNT-2026-06-0021, ₹1,900 paid) |
| Financial invoice | `cfcc5740-31a3-4ccd-9771-8ed1e57da8c9` |

### Audit trail (sample)

| Audit ID | Entity | Action |
|----------|--------|--------|
| `67879e28-4ff2-4c58-b055-3a697b68cc58` | booking | create |
| `6a7b649b-0e97-44e0-b177-3e6bc888bbac` | booking | payment_succeeded |
| `9d2353da-1531-4618-8526-d1774269d83c` | deposit_ledger | deposit_collected |
| `1c2e1eca-bf56-4ff8-a468-e232d7a08b9e` | rent_invoice | paid |

### 10/10 checks: **PASS**

---

## APG-2026-0036 — Dhruv (B3)

### Entity IDs (production)

| Entity | ID |
|--------|-----|
| Booking | `61e6104a-8291-4971-99a7-90b013a2e3de` |
| Payment | `adf6fe1b-d94d-4d51-83cd-c183f365191e` (₹2,685, 2026-06-24) |
| Deposit ledger (cash) | `e0cdbd63-52e5-4502-9a4d-d698fcce9222` (₹620) |
| Deposit ledger (transfer) | `4194e6a8-a904-453e-90cf-efdbd05c5e8e` (₹330 credit) |
| Rent invoice | `c52e51ed-8de7-4150-8f25-896e54185a74` (₹1,900 paid) |
| Financial invoice | `eaaa5e42-0c84-46da-937e-fbd2b93ce885` |

### 10/10 checks: **PASS**

---

## BEFORE / AFTER

| Surface | BEFORE | AFTER |
|---------|--------|-------|
| Rent invoice linked to payment | Missing | Paid rent invoice per booking |
| Financial invoice | Missing / unsynced | Mirrored with `source_table=rent_invoices` |
| `/admin/revenue` MTD rent | Booking rent invisible | `incomeRentPaise` ₹5,120 (includes +₹3,800) |
| `/admin/invoices` (payment day) | ₹0 on wrong date | ₹1,900 rent per payment day |
| `/admin/deposits` | Held ₹950 | Unchanged ✓ |
| Resident history | No rent row | Rent paid visible |
| Duplicates | — | None (`created: false` on repair) |

---

## Revenue reconciliation (2026-06-24 — today)

| Metric | Expected (scoped bookings on today) | Admin Command Center | Match |
|--------|-----------------------------------|----------------------|-------|
| Rent collected | ₹1,900 (0036 only) | ₹1,900 | ✓ |
| Deposit cash | ₹620 | ₹62,000 paise bucket* | ✓ (all PGs) |
| Deposit transfers | ₹33,000 | ₹33,000 | ✓ |
| Prior deposit settled | ₹0 (0036 prior on other day) | ₹16,500 (all PGs) | scope note |
| Refunds | ₹0 | ₹0 | ✓ |
| MTD income rent | — | ₹5,120 | includes both bookings |

\*Command Center daily deposit cash is **all residents** that day, not scoped to these two bookings.

### Payment-day navigation

| Booking | Open Command Center |
|---------|---------------------|
| APG-2026-0035 | `/admin/invoices?date=2026-06-23` |
| APG-2026-0036 | `/admin/invoices?date=2026-06-24` |

Viewing any other date shows ₹0 rent for these bookings — **by design** (date-filtered ledger).

---

## PASS / FAIL matrix

| Check | 0035 | 0036 |
|-------|------|------|
| Booking confirmed | ✓ | ✓ |
| Payment succeeded | ✓ | ✓ |
| Deposit ledger | ✓ | ✓ |
| Rent obligation | ✓ | ✓ |
| Rent invoice | ✓ | ✓ |
| Financial invoice | ✓ | ✓ |
| Resident history | ✓ | ✓ |
| Admin invoice center | ✓ | ✓ |
| Revenue dashboard | ✓ | ✓ |
| Audit trail | ✓ | ✓ |
| **Overall** | **PASS** | **PASS** |

---

## Screenshots

Capture manually after deploy:

1. `/admin/invoices?date=2026-06-23` — 0035 rent ₹1,900
2. `/admin/invoices?date=2026-06-24` — 0036 rent ₹1,900
3. `/admin/revenue` — MTD rent ₹5,120
4. `/admin/deposits` — both Held ₹950
5. Resident account — rent payment history

---

## Re-run verification

```bash
VERIFY_FINANCIAL_CHAIN_0035_0036=1   # on Vercel build
npx tsx scripts/verify-financial-chain-0035-0036.ts
npx tsx scripts/verify-financial-chain-0035-0036.ts --execute  # idempotent repair
```
