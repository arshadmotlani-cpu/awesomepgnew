# Resident Portal V2 — PO Decision Defaults (2026-07-02)

Implementation defaults where product owner clarification was pending:

| # | Question | Decision |
|---|----------|----------|
| 1 | Awesome PG policies copy | Use bullets: 14-day move-out notice, deposit refunded after checkout inspection, transparent electricity billing. Link to `/about`. |
| 2 | Dhruv B1 case | Bind booking review to `quoteBookingPrice()` line items; audit script separate. |
| 3 | Room shift scope | Same PG only; minimum same-day; admin approval required. |
| 4 | Billing cycle display | Move-in anniversary day through month-end (existing `billingDayFromMoveIn`). |
| 5 | Maintenance/Complaint/Support | WhatsApp handoff with in-app confirmation receipt. |
| 6 | Pay All | Batch pay for rent + electricity UPI flows only; disable when deposit or pending approval mixed. |
| 7 | PS4 | Show in Profile overview only when active membership exists. |
| 8 | KYC | Remain at `?section=identity`; link from Profile edit section. |
| 9 | Pre-resident | Keep `SimpleAccountHub` for non-confirmed; confirmed use V2 hub. |
| 10 | Referral code | Permanent: first 8 chars of customer UUID (uppercase). |
| 11 | Referral withdrawal | Same UPI flow as deposit refund after vacate. |
| 12 | Shift fee ₹100 | GST inclusive; non-refundable once shift executed. |
| 13 | Notifications | Removed from UI; email-only. |
| 14 | Application bookings | Keep `/account/bookings` separate. |
