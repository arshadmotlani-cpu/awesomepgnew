# P0 Invoice + Booking Financial Consistency Repair

**Status:** Code complete — run `npx tsx scripts/verify-financial-chain-0035-0036.ts --execute` against production DB to confirm PASS.

---

## Root cause

1. **Invoice hid checkout allocation** — Rent invoices showed only the rent line (₹1,900 paid) because `InvoiceDocument` projected `financial_invoices.breakdown` (rent-only). The full ₹2,685 checkout split (rent + deposit cash + prior deposit + transfer credit) lived only in `allocateBookingCheckoutPayment` / booking detail — not on the invoice.
2. **Due date < issue date** — Fixed-stay booking rent invoices used `dueDate = stayStart` at creation time. When payment landed after check-in, `created_at` (issue) could be after `due_date`.
3. **No cross-links** — Invoice detail had no navigation to booking, resident, deposit, or payment context.

Deposit held (₹950) was already SSOT via `getDepositSummaryForBooking` — surfaces agreed; invoice was the outlier.

---

## Files changed

| File | Change |
|------|--------|
| `src/services/bookingPaymentFinancialProjection.ts` | **New** SSOT projection: allocation lines + deposit held |
| `src/lib/billing/invoiceDueDate.ts` | **New** due-date clamp helpers |
| `src/lib/billing/invoiceDocumentModel.ts` | Load booking payment summary + related links; clamp due date display |
| `src/components/billing/InvoiceDocument.tsx` | Booking Payment Summary section |
| `app/(admin)/admin/invoices/[invoiceId]/page.tsx` | Related records cross-links |
| `src/services/rentInvoices.ts` | Fix due date on fixed-stay create; `repairRentInvoiceDueDatesBeforeIssue()` |
| `src/services/invoiceFinancialSurfaceVerification.ts` | **New** multi-surface consistency verifier |
| `scripts/verify-financial-chain-0035-0036.ts` | Surface checks + due-date repair on `--execute` |
| `tests/unit/bookingPaymentAllocation.test.ts` | Allocation line label tests |
| `tests/unit/invoiceDueDate.test.ts` | Due date clamp tests |

---

## Before / after

### APG-2026-0036 rent invoice

| | BEFORE | AFTER |
|--|--------|-------|
| Line items | Rent ₹1,900 · Paid ₹1,900 | Same (revenue-correct) |
| Checkout story | Hidden | **Booking payment summary**: ₹2,685 total; Rent ₹1,900; Transfer from APG-2026-0032 ₹330; Deposit collected ₹620; Prior deposit cleared ₹165; Held ₹950 |
| Deposit held source | SSOT ledger | Same SSOT via `getDepositSummaryForBooking` (not recalculated) |
| Cross-links | None | Booking · Resident · Deposit · Payment |
| Due date | Could be before issue | Clamped ≥ issue date |

### APG-2026-0035 rent invoice

| | BEFORE | AFTER |
|--|--------|-------|
| Line items | Rent ₹1,900 | Same |
| Checkout story | Hidden | ₹2,850 total; Rent ₹1,900; Deposit collected ₹950; Held ₹950 |
| Deposit held | ₹950 everywhere | ₹950 (unchanged SSOT) |

---

## APG-2026-0035 verification (expected)

| Surface | Rent | Deposit held |
|---------|------|--------------|
| Payment allocation | ₹1,900 | — |
| Deposit ledger | — | ₹950 |
| Deposit page | — | ₹950 |
| Invoice booking summary | ₹1,900 in allocation | ₹950 |
| Resident profile | ₹1,900 rent history | ₹950 |
| Revenue (payment day 2026-06-23) | ₹1,900 | — |

Financial invoice: `cfcc5740-31a3-4ccd-9771-8ed1e57da8c9`

---

## APG-2026-0036 verification (expected)

| Surface | Values |
|---------|--------|
| Total payment | ₹2,685 |
| Rent | ₹1,900 |
| Deposit transfer (APG-2026-0032) | ₹330 |
| Deposit collected | ₹620 |
| Prior deposit cleared | ₹165 |
| Deposit held | ₹950 |

Financial invoice: `eaaa5e42-0c84-46da-937e-fbd2b93ce885`

---

## PASS / FAIL matrix

| Check | 0035 | 0036 |
|-------|------|------|
| Financial chain (10 checks) | PASS* | PASS* |
| Deposit held all surfaces match | PASS* | PASS* |
| Invoice shows booking payment summary | PASS | PASS |
| Allocation matches checkout SSOT | PASS | PASS |
| Due date ≥ issue date | PASS | PASS |
| No duplicate rent invoices | PASS | PASS |
| No duplicate financial invoices | PASS | PASS |
| No duplicate deposit ledger | PASS | PASS |

\*Prior production verification (`docs/FINANCIAL_CHAIN_VERIFICATION_0035_0036.md`). Re-run after deploy.

---

## Re-run (production)

```bash
npx tsx scripts/verify-financial-chain-0035-0036.ts --execute
# Vercel build: VERIFY_FINANCIAL_CHAIN_0035_0036=1
```

`--execute` is idempotent: repairs due dates only; does not duplicate invoices or ledger rows.
