# Vacating

> Domain hub — move-out notice, approval, checkout-month rent, and handoff to refund settlement.

Cross-links: [[START_HERE]] · [[features#Vacating pipeline]] · [[WORKFLOWS#Vacating]]

---

## Purpose

Manage the **move-out lifecycle**: resident files notice → admin approves → stay shortened (optional) → checkout settlement created → resident submits meter/UPI after vacate date → admin pays refund. Includes 14-day notice policy and **Notice settlement** — unused prepaid rent days after vacate (billing-cycle paid-until) satisfy notice shortfall before deposit deduction.

**SSOT:** `vacating.ts`, `vacatingCheckoutBilling.ts`, `moveOutPipeline.ts`, `depositRefundEligibility.ts`, `vacatingJourney.ts`

---

## Related features

- [[Vacating]] pipeline UI — `/admin/vacating`
- Resident request vacate — `/account/resident/request-vacating/[bookingId]`
- [[Checkout Settlements]] — refund after approval
- [[Operations]] move-out queue
- Resident timeline (meter/refund locked until vacate date)
- Rich approve dialog + pipeline table (urgency, deposits, timestamps)

See [[features#Vacating pipeline]] · [[features#Request vacate]] · [[features#Deposit refund request]]

---

## Related workflows

| Phase | Flow |
|-------|------|
| Resident submit | Notice date → penalty snapshot → `syncVacatingCheckoutRentBilling` |
| Admin approve | Approve at `/admin/vacating` or [[Operations]] → create settlement |
| Post vacate date | Resident meter + UPI → [[WORKFLOWS#Refund Processing]] |
| Cancel/reject | `restoreRentBillingAfterVacatingCancel` |

Full diagram: [[WORKFLOWS#Vacating]]

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/vacating` | **Canonical** move-out pipeline |
| `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]` | Refund (post-approve) |
| `/admin/operations` | Move-out queue entries |
| `/account/resident/request-vacating/[bookingId]` | Resident notice — date defaults to today or booking checkout |
| `/account/profile?section=resident&tab=vacating` | Resident vacating tab |

**Date entry UX (2026-06-22):** Resident and admin vacating forms pre-fill the date picker from `expected_checkout_date` when set (otherwise today + notice period for residents, notice-compliant default for admin). Invalid dates never crash preview UI — `tryDiffDays()` returns safe fallbacks.

**Past-due move-outs (2026-06-22):** When vacate date passes, the bed **does not** auto-release for new bookings until checkout settlement completes ([[DECISIONS#Checkout settlements as refund SSOT]]). UI switches to “Move-out overdue” / “checkout pending”; daily cron (`processVacatingPastDueDaily`) upserts high-priority `vacating_alert` action items with settlement deep links.

**Fixed-stay auto-expiry (2026-06-23):** Short stays (`fixed_stay`, `daily`, `weekly`) auto-complete at **11:00 AM IST** on `expected_checkout_date` via daily automation cron (06:00 UTC ≈ 11:30 IST; manual `/api/cron/expire-fixed-stays` for backfill). Bed is released immediately; checkout settlement opens in `awaiting_resident_details` for deposit refund. System vacating row + `fixed_stay_checkout_due` action item created. See `fixedStayAutoExpiry.ts`.

**Deposit refund unlock (2026-06-23):** Unified unlock via `depositRefundUnlock.ts` — fixed stays unlock after 11 AM checkout; monthly stays after approved vacate date. Resident requests tab shows prominent “Request deposit refund” when unlocked.

See [[ROUTES#Operations & Vacating]] · [[ROUTES#Where to act]]

---

## Related database entities

| Table | Role |
|-------|------|
| `vacating_requests` | Notice, status, penalty snapshot |
| `checkout_settlements` | Refund workflow (1:1 with approved vacate) |
| `bed_reservations` | Shortened on approve (future move-outs) |
| `rent_invoices` | Pro-rated checkout month; future cancelled |
| `electricity_invoices` | Final bill at settlement |
| `deposit_ledger` | Deductions and refund entries |
| `bookings` | `expected_checkout_date`, status → completed |

See [[DATABASE#Move-out — Vacating]]

---

## Related decisions

- [[DECISIONS#Vacating: 14-day notice + pro-rata missing-days deduction]]
- [[DECISIONS#Vacating checkout rent sync]]
- [[DECISIONS#Split vacate request from deposit refund]]
- [[DECISIONS#Checkout settlements as refund SSOT]]
- [[DECISIONS#Operations as action hub]]
- [[DECISIONS#Client Date serialization]] — pipeline UI fix
- [[DECISIONS#Half-open stay ranges]] — pro-ration `activeEnd`

---

## Related hubs

[[Checkout Settlements]] · [[Deposits]] · [[Billing]] · [[Residents]] · [[Operations]] · [[Beds]]

See also [[BUGS#VAC-CRASH-01]] · [[BUGS#VAC-CRASH-02]] · [[BUGS#VAC-DATE-01]] · [[BUGS#VAC-RENT-01]] (resolved)
