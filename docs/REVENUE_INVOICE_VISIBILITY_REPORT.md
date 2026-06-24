# P0 Revenue + Invoice Visibility Repair

**Date:** 2026-06-13  
**Validation booking:** APG-2026-0036 (Dhruv)  
**Deposit truth preserved:** APG-2026-0032 transfer ₹330 · APG-2026-0036 held ₹950 · outstanding ₹0

---

## Root cause

1. **Invoice creation gap (historical)**  
   `recordPaymentSuccess()` in the booking lifecycle wrote deposit ledger entries but did **not** create `rent_invoices` / `financial_invoices` for `purpose='booking'` payments. Monthly rent payments already flowed through `rent_invoices`; fixed-date checkout payments did not.

2. **Reporting bucket (misleading UI)**  
   `invoiceCommandCenter.ts` summed full booking payment amounts into **"Reservation Payments"** while **Rent Collected** only read `rent_invoices.paid_paise`. Booking-origin rent was invisible in revenue until backfill.

3. **Double-count risk**  
   The same cash day could show reservation payments **and** deposit ledger totals, overstating inflow and hiding allocation (rent vs deposit cash vs prior due vs transfer credit).

**SSOT fix:** `allocateBookingCheckoutPayment()` mirrors checkout allocation order: rent → deposit cash → prior outstanding; transfer credit is metadata, not cash inflow.

---

## Files changed

| Area | File |
|------|------|
| Allocation SSOT | `src/lib/billing/bookingPaymentAllocation.ts` |
| Rent invoice on pay | `src/services/bookingPaymentInvoices.ts` (prior commit + allocation wiring) |
| Command center metrics | `src/services/invoiceCommandCenter.ts` |
| Daily summary UI | `src/components/admin/InvoiceDailySummary.tsx` |
| Timeline labels | `src/components/admin/InvoiceFinancialTimeline.tsx` |
| Admin booking detail | `app/(admin)/admin/bookings/[bookingId]/page.tsx` |
| Admin query | `src/db/queries/admin.ts` (`pricingSnapshot`, `discountPaise`) |
| Deposit reason export | `src/services/depositCredit.ts` |
| Backfill / discovery | `scripts/discover-booking-rent-invoice-gaps.ts`, `scripts/backfill-booking-rent-invoices.ts` |
| Vercel repair | `scripts/vercel-build-repair.sh` (`BACKFILL_BOOKING_RENT_INVOICES=1`) |
| Verification | `scripts/verify-apg-0036-production.ts` (Q5 rent invoice, Q10 command center) |
| Tests | `tests/unit/bookingPaymentAllocation.test.ts`, `tests/unit/bookingPaymentInvoices.test.ts`, `tests/unit/invoiceCommandCenter.test.ts` |

---

## Before / after — Invoice Command Center (payment day)

| Metric | Before (broken) | After (expected) |
|--------|-----------------|------------------|
| Rent collected | ₹0 | **₹1,900** |
| Reservation payments | ₹2,685 (misleading) | **removed** |
| Deposit cash collected | (buried in ₹1,115) | **₹620** |
| Deposit transfers | not shown | **₹330** |
| Prior deposit settled | not shown | **₹165** |
| Booking rent not invoiced | n/a | **₹0** (after backfill) |
| Net inflow | inflated / unclear | rent + electricity + deposits − refunds |

**APG-2026-0036 payment allocation (₹2,685 total):**

| Line | Amount |
|------|--------|
| Rent | ₹1,900 |
| Deposit cash | ₹620 |
| Prior deposit due | ₹165 |
| Deposit transfer (credit) | ₹330 |

---

## APG-2026-0036 validation matrix

| Surface | Check | Expected |
|---------|-------|----------|
| Admin Revenue | Rent from `rent_invoices` | ₹1,900 |
| Admin Invoices | Paid rent + financial mirror | Linked to booking payment |
| Invoice Command Center | Breakdown metrics | See table above |
| Resident Financial History | Paid rent row | ₹1,900 |
| Resident Account | Invoice card | Rent paid |
| Admin Booking | Allocation table + rent invoice link | 190k / 62k / 165k / 330 transfer |
| Deposits | Held / outstanding | ₹950 held · ₹0 outstanding (**unchanged**) |

---

## Production backfill

```bash
# Discovery (dry-run)
npx tsx scripts/discover-booking-rent-invoice-gaps.ts

# Apply (idempotent)
npx tsx scripts/backfill-booking-rent-invoices.ts --execute

# Or on Vercel deploy
BACKFILL_BOOKING_RENT_INVOICES=1
VERIFY_APG_0036_E2E=1
```

**Scan criteria:** `payments.status='succeeded'` AND `purpose IN ('booking','extension')` with no paid `rent_invoices` row for `payment_id`.

---

## Verification commands (production runtime)

```bash
npx tsx scripts/verify-apg-0036-production.ts
npx tsx scripts/verify-invoice-command-center.ts <payment-date>
```

Q5: paid rent invoice `paid_principal_paise = 190_000`  
Q10: command center rent ≥ 190k, deposit cash ≥ 62k, transfers ≥ 33k, prior ≥ 16.5k, uninvoiced = 0

---

## Local verification status

| Step | Status |
|------|--------|
| Unit tests (allocation, invoices, command center) | PASS |
| `npm run build` | PASS |
| Production DB query | **Blocked** — Vercel-pulled env has empty `DATABASE_URL` (secret not in pull). Run backfill + E2E on Vercel with flags above. |

---

## Screenshots

Capture after deploy + backfill:

1. `/admin/invoices` — Command Center daily summary (no "Reservation payments")
2. `/admin/bookings/<APG-2026-0036-id>` — Checkout payment allocation + rent invoice row
3. `/admin/revenue` — Rent collected includes booking day
4. Resident `/account` — Rent payment history ₹1,900
