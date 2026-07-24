# Billing Coverage Model (SSOT)

**Status:** Permanent architecture for move-out money surfaces.  
**Code:** [`src/lib/billing/billingCoverageModel.ts`](../src/lib/billing/billingCoverageModel.ts) · **Loader:** [`loadBillingCoverageModel`](../src/services/billingCoverage.ts) · **Presentation bundle:** [`loadVacatingBillingPresentation`](../src/lib/vacating/loadVacatingBillingPresentation.ts)

Do **not** add parallel billing calculators for vacating, notice, tail rent, or settlement display. Extend this model and its loader only.

---

## Inputs

| Input | Source |
|-------|--------|
| `bookingId` | Booking row |
| Paid rent invoice periods | `rent_invoices` (paid principal) → raw anniversary windows |
| `moveInDate` | Primary bed reservation lower bound |
| `billingDay` | Resident billing profile or derived from move-in |
| `vacatingDate` / `noticeGivenDate` | Vacating request |
| `monthlyRentPaise` | Vacating snapshot or booking |
| `treatAsApprovedForTail` | `true` for settlement previews; `false` for live invoice suppression until approved |
| Stay policy | `stayType` / `durationMode` → notice applies |

Raw invoice periods are **clamped** to `moveInDate` before any display or notice math (`clampPaidPeriodToMoveIn`).

---

## Outputs (separate concepts)

| Field | Meaning |
|-------|---------|
| `paidInvoiceCoverage` | Which rent invoices are paid — **display/clamp only**, never starts before check-in |
| `currentBillingPeriod` | Anniversary period containing vacating (or as-of date) |
| `paidUntilDate` | Latest paid-through date extending **strictly past** vacating (notice prepaid) |
| `prepaidAfterVacatingDays` / `Paise` | Unused prepaid after vacate date |
| `daysPaidForSettlement` | Calendar days of paid coverage ∩ `[moveIn, vacating]` |
| `tailRent` / `tailRentPaise` | Final-period suppression + tail days through vacate ([`vacatingFinalPeriodRent`](../src/lib/billing/vacatingFinalPeriodRent.ts)) |
| `finalInvoiceSuppression` | Whether anniversary invoice for vacating month is suppressed |
| `noticeBreakdown` | Notice deduction engine output from **clamped** paid periods |

---

## Displayed “days” (admin/resident copy)

| UI label | Source | Notes |
|----------|--------|--------|
| **Days stayed** | V2 `waterfall.stay.stayDays` | Check-in through vacating (inclusive) |
| **Days paid** | `daysPaidForSettlement` | Invoice coverage in stay — can differ from days stayed |
| **Rent consumed** | V2 `rentBucket.consumedPaise` | Money, not day count |
| **Billing cycle / Paid until** | `currentBillingPeriod` / `paidUntilDate` | Different business meanings |
| **Unused prepaid rent (days)** | Notice display | Prepaid **after vacate** applied to notice |

---

## Consumers (must use loader / presentation bundle)

- Notice deduction — `computeNoticeDeductionForBooking`
- Settlement preview — `loadVacatingBillingPresentation` → `estimatedSettlement`
- Approval dialog — `buildVacatingApprovalPreviewAsync`
- Financial workspace / resident portal — same preview + statement model
- Checkout detail — `loadVacatingBillingPresentation` + locked waterfall
- Monthly billing snapshot — optional `coverageModel` passthrough
- Tail rent in checkout V2 — `checkoutTailRentPaise` from coverage
- Audit breakdown — `settlementNoticeDisplay` + `billingCoverageDaysPaid` on detail
- Settlement PDF — `EstimatedSettlementPreview` sections only

`notice_breakdown_json` on vacating/checkout rows is an **audit snapshot at write time** — not used for UI display after this migration.

---

## Flow

```mermaid
flowchart LR
  DB[(Invoices + stay)]
  LBCM[loadBillingCoverageModel]
  BCM[buildBillingCoverageModel]
  LVP[loadVacatingBillingPresentation]
  V2[computeCheckoutSettlementV2]
  DB --> LBCM --> BCM
  BCM --> LVP
  BCM --> V2
  LVP --> Surfaces[Approval / WS / Resident / Checkout / Audit / PDF]
  V2 --> Surfaces
```

---

## Tail rent rule (Case B)

When vacating is exactly **one calendar day** after the first unpaid day following paid-through, tail charges **one day** (vacating date). Longer spans use inclusive tail window from first unpaid day through vacate. See `vacatingFinalPeriodRent.test.ts` and `billingCoverageRegression.test.ts`.

---

## Related docs

- [BILLING_ENGINE.md](./BILLING_ENGINE.md) — platform billing scheduler and products
- [MEMORY/decisions.md](./MEMORY/decisions.md) — decision log
