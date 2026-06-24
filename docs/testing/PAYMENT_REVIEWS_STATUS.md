# Payment Reviews — Status

## PAYMENT REVIEWS

**STATUS: READY FOR MANUAL TESTING**

Last updated: 2026-06-13

### Scope

Operations → Payment Reviews (`/admin/operations/payment-reviews`)

### UI deliverables

1. **Booking context** — booking type, pricing rule, stay dates, rent calculation narrative, deposit policy, required deposit
2. **Payment explanation** — deposit calculation (required → credit → due now), net deposit position, line-by-line total (rent + deposit due now + prior outstanding), customer paid, result, after approval
3. **Financial trace** — collapsed admin-only per prior booking (refundable, outstanding, transfer, impact, reason)

### Manual test checklist

- [ ] New booking checkout (fixed stay) — booking context + money story visible without scrolling on desktop
- [ ] New booking with prior outstanding — prior balance line appears in both sections
- [ ] New booking with prior refundable deposit — informational row + financial trace
- [ ] Partial deposit approve — after-approval shows remaining deposit liability
- [ ] Rent / electricity / extension / deposit-link proofs — context shows correct payment type
- [ ] Approve and reject actions unchanged

### Notes

Presentation-only changes. No calculation, ledger, revenue, invoice, approval, deposit, or booking logic changes.
