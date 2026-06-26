# Resident Journey Verification Checklist

**Phase 5** — End-to-end lifecycle verification on production/staging.

## Journey map

| Step | Screen(s) | Notification | Invoice / ledger | Verify |
|------|-----------|--------------|------------------|--------|
| 1. Booking | `/booking/new`, `/booking/[code]/pay` | — | `bookings`, `bed_reservations` hold | Booking code created |
| 2. Payment | Pay page, Razorpay/QR | Email receipt | `payments`, `deposit_ledger` collected | `recordPaymentSuccess` → confirmed |
| 3. Confirmation | `/booking/[code]/payment-success` | Booking email | Deposit ledger row | Status `confirmed`, reservation `active` |
| 4. Check-in | Admin booking detail | — | — | Move-in date matches |
| 5. KYC | `/account/profile`, `/admin/residents/kyc` | `kyc_pending` action | — | Approve → badge clears |
| 6. Living | Resident hub home | — | RFE account | Hub total = admin profile |
| 7. Monthly rent | Cron + `/admin/billing` | `rent_due` | `rent_invoices` → `financial_invoices` | Invoice generated on anniversary |
| 8. Electricity | `/admin/electricity` wizard | `electricity_due` | `electricity_invoices` | Per-resident share correct |
| 9. Extension | `/booking/[code]/extend` | — | `stay_extensions`, reservation append | Checkout date rolls |
| 10. Room/bed transfer | `/admin/beds`, resident profile | — | New booking or reassignment | Single active bed |
| 11. Checkout notice | Resident vacating tab, `/admin/vacating` | `vacating_alert` | `vacating_requests` | One active per booking |
| 12. Settlement | `/admin/checkout-settlements` | checkout notification | `checkout_settlements` | Electricity + deposit math |
| 13. Refund | Settlement approve | — | `deposit_ledger` refunded | **Only** checkout path (not `/admin/requests`) |
| 14. Completed | Resident vacated, bed released | — | RFE zero outstanding | `residency_status` vacated |

## Regression anchors

- **Continuous residency:** Sequential bookings within 1 day → no false checkout settlement on prior booking.
- **X-01:** `getResidentFinancialAccount` = admin resident profile = customer hub dues.
- **INV-04:** Resident can reach invoice detail from payments hub.

## Sign-off

- [ ] Happy path completed on staging
- [ ] Named production cases verified (ops audit residents)
- [ ] No fake buttons on resident hub or admin profile
- [ ] Each step has one admin discover path (see operations-consolidation-audit.md)
