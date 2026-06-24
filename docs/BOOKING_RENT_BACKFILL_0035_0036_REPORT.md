# Booking Rent Invoice Backfill — APG-2026-0035 / APG-2026-0036

**Verified:** 2026-06-24 (production Vercel build)  
**Commits:** `1125e4c` (repair service + env fix), deploy with `BACKFILL_BOOKING_RENT_INVOICES=1` + `REPAIR_BOOKING_RENT_0035_0036=1`

---

## Root cause

Both bookings were **confirmed**, **payment succeeded**, and **deposit held ₹950** — but `recordPaymentSuccess()` historically did not create `rent_invoices` / `financial_invoices` for fixed-date checkout payments. Revenue dashboard (`incomeRentPaise`) reads only paid `rent_invoices`, so booking-origin rent was invisible.

---

## Production repair (idempotent)

Vercel build log:

```
Estimated revenue to close: ₹3,800
✓ … APG-2026-0036 → rent invoice c52e51ed-8de7-4150-8f25-896e54185a74
✓ … APG-2026-0035 → rent invoice 5226fab0-4424-4e73-854e-e4175dc0d577
Done. ok=2 failed=0
```

No duplicate invoices created on re-run (repair skipped — already linked).

---

## APG-2026-0035 (Bed B2)

| Check | Result |
|-------|--------|
| Rent invoice exists | **PASS** — `5226fab0-4424-4e73-854e-e4175dc0d577` |
| Financial invoice exists | **PASS** (synced via `syncRentInvoiceToUnified`) |
| Revenue entry (`incomeRentPaise`) | **PASS** — ₹1,900 in billing month |
| Resident rent history | **PASS** |
| Admin invoice center | **PASS** |
| Deposit held | **₹950** (unchanged) |

**Revenue impact:** +₹1,900 rent (190,000 paise)

---

## APG-2026-0036 (Bed B3)

| Check | Result |
|-------|--------|
| Rent invoice exists | **PASS** — `c52e51ed-8de7-4150-8f25-896e54185a74` |
| Financial invoice exists | **PASS** |
| Revenue entry (`incomeRentPaise`) | **PASS** — ₹1,900 in billing month |
| Resident rent history | **PASS** |
| Admin invoice center | **PASS** |
| Deposit held | **₹950** (unchanged) |

**Revenue impact:** +₹1,900 rent (190,000 paise)

---

## Revenue dashboard reconciliation

| Metric | Before repair | After repair |
|--------|---------------|--------------|
| Booking rent invoices (0035 + 0036) | **0** | **2** paid |
| Rent recognized from these bookings | **₹0** | **₹3,800** |
| MTD `incomeRentPaise` (all PGs) | ₹1,320 (est. — MTD ₹5,120 minus ₹3,800 added) | **₹5,120** |

*MTD total from production audit after backfill: `incomeRentPaise: 512000` paise.*

---

## PASS / FAIL matrix (production)

| Booking | Q1 Rent | Q2 Financial | Q3 Revenue | Q4 Resident | Q5 Command Center | Q6 incomeRentPaise | Overall |
|---------|---------|--------------|------------|-------------|-------------------|-------------------|---------|
| APG-2026-0035 | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| APG-2026-0036 | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |

---

## Ops commands

```bash
# Idempotent backfill (all booking payment gaps)
BACKFILL_BOOKING_RENT_INVOICES=1

# Targeted audit + repair (0035/0036)
REPAIR_BOOKING_RENT_0035_0036=1

# Runtime cron (requires CRON_SECRET on server)
POST /api/cron/repair-booking-rent-invoices?execute=1
```
