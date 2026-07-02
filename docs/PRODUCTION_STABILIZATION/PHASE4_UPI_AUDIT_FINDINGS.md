# Phase 4 — Payment / UPI Safety Audit — Findings

**Status:** Code audit complete; per-PG DB inventory pending  
**Date:** 2026-07-02

---

## 1. Architecture

| Payment source | UPI resolver | Mechanism |
|----------------|--------------|-----------|
| Resident rent | `getRentDepositBookingCategory(pgId)` | UPI QR + proof upload |
| Resident electricity / PS4 | `getElectricityDailyCategory(pgId)` | UPI QR + proof upload |
| Payment links | `getPgQrForPurpose` (fuzzy name match) | `/pay/[linkId]` |
| Booking checkout | `resolveBookingCheckoutQr` | UPI / Razorpay by env |
| Express booking | `expressCollection` (admin offline) | No resident QR |
| Extensions | QR page | Proof upload |

**Code fallbacks** (`src/lib/payments/defaultQr.ts`):

| Purpose | Default UPI |
|---------|-------------|
| Rent / deposit / booking | `shiba.motlani@oksbi` |
| Electricity / daily / PS4 | `9049163636@pthdfc` |

**Razorpay:** `PAYMENT_PROVIDER=razorpay` required in production — booking webhooks only; resident bills are UPI-first by design.

---

## 2. Risks identified (code)

| Risk | Severity | Detail |
|------|----------|--------|
| Dual UPI resolvers | **High** | Exact `pgPaymentDefaults` vs fuzzy `getPgQrForPurpose` may pick different categories for payment links |
| `ensureDefaultPaymentCategoriesForPg` | **High** | Called on pay-page load — may reset PG UPI/QR to hardcoded defaults |
| Payment link capability URLs | **Medium** | `/pay/[linkId]` — possession grants access without login |
| Multiple proof APIs | **Medium** | 6+ upload endpoints — consistency risk |
| Admin payments settings | **Low** | `/admin/settings/payments` is stub |
| Legacy `PgPaymentModal` | **Low** | Parallel public PG payment path |

---

## 3. Audit checklist (production)

### Per PG

- [ ] `pg_payment_categories` — rent + electricity UPI IDs match intended merchant accounts
- [ ] QR image URLs valid and match UPI ID
- [ ] Pay-rent page VPA === DB category === QR decode
- [ ] Pay-electricity page VPA === electricity category
- [ ] Payment link UPI === pay-rent page for same invoice
- [ ] Booking checkout QR branch (rent vs electricity addon)

### Global

- [ ] `PAYMENT_PROVIDER=razorpay` + `RAZORPAY_*` set on Vercel
- [ ] Static assets: `/payments/upi-rent-deposit.png`, `/payments/upi-electricity-daily.png`
- [ ] No legacy QR paths in `financial_invoices` / active `payment_links`
- [ ] Webhook handles all purpose tags

**Run when DB available:**

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/production-stabilization-audit.ts --write-docs
```

---

## 4. Files involved

| Area | Path |
|------|------|
| Defaults | `src/lib/payments/defaultQr.ts` |
| PG categories | `src/services/pgPaymentDefaults.ts`, `src/db/schema/pgPaymentCategories.ts` |
| Fuzzy resolver | `src/services/actionItems.ts` (`getPgQrForPurpose`) |
| Payment links | `src/services/paymentLinks.ts`, `app/(customer)/pay/[linkId]/page.tsx` |
| Pay pages | `app/(customer)/account/resident/pay-rent/`, `pay-electricity/` |
| Admin config | `PgCollectionsPanel.tsx`, `app/api/pg/[id]/payment-categories/route.ts` |
| Razorpay | `app/api/webhooks/razorpay/route.ts`, `src/lib/env.ts` |

---

## 5. Recommended implementation order

1. Read-only UPI inventory (all PGs) — **P0**
2. Single SSOT resolver for purpose → category — **P1**
3. Make `ensureDefaultPaymentCategories` non-destructive — **P1**
4. Admin payments settings surface real config — **P2**
5. Deprecate `PgPaymentModal` if redundant — **P3**

---

## 6. Effort

| Workstream | Days |
|------------|------|
| Full audit report | 3–4 |
| Resolver consolidation | 3–5 |
| **Total** | **~2 weeks** |

---

## 7. Testing strategy

- Unit tests for resolver per PG/purpose
- Manual ₹1 test payment + QR VPA decode per path
- Staging webhook replay

---

## 8. Rollback

- UPI config changes: backup `pg_payment_categories` before bulk update
- Payment links immutable until regenerated

---

## Sign-off

| Check | Status |
|-------|--------|
| Code risk register | Done |
| Per-PG live verification | **Pending DB** |
