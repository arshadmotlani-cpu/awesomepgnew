# Features

> Complete feature inventory. Status as of **2026-06-21**.  
> Cross-ref: [[ROUTES]] · [[WORKFLOWS]] · [[DATABASE]] · [[ARCHITECTURE]] · [[DECISIONS]] · [[AI_CONTEXT]]

---

## Feature index

[[Residents]] · [[KYC]] · [[Bed Assignment]] · [[Billing]] · [[Deposits]] · [[Vacating]] · [[Checkout Settlements]] · [[Operations]] · [[Action Center]] · [[Payment Links]] · [[Bookings]] · [[Electricity]] · [[Invoices]] · [[Analytics]] · [[PS4 Membership]]

---

## Public & booking

### PG discovery & booking

| Field | Value |
|-------|-------|
| **Purpose** | Browse PGs, select bed, pay deposit + first rent |
| **User** | Prospective resident |
| **Entry** | `/pgs`, `/pgs/[pgSlug]` |
| **Routes** | `/booking/new`, `/booking/[bookingCode]/pay` |
| **Rules** | Pricing snapshotted on booking; half-open stay ranges |
| **Dependencies** | `bookings`, `bed_reservations`, Razorpay |
| **Status** | ✅ Production |

### Payment links (public)

| Field | Value |
|-------|-------|
| **Purpose** | Pay rent/deposit/electricity via shared UPI link |
| **User** | Resident |
| **Entry** | `/pay/[linkId]` |
| **Services** | `paymentLinks.ts` |
| **Status** | ✅ Production |

---

## Resident account

### Resident hub

| Field | Value |
|-------|-------|
| **Purpose** | Home, wallet, payments, requests, room, vacating |
| **User** | Confirmed monthly/open-ended resident |
| **Entry** | `/account/profile?section=resident` |
| **Tabs** | `home`, `wallet`, `payments`, `requests`, `room`, `vacating`, `notifications`, `concierge` |
| **SSOT** | `ResidentAreaSection.tsx`, `residentFinancialEngine.ts` |
| **Status** | ✅ Production |

### Request vacate

| Field | Value |
|-------|-------|
| **Purpose** | File move-out notice with date |
| **User** | Resident |
| **Entry** | `/account/resident/request-vacating/[bookingId]` |
| **Services** | `vacating.ts` → `submitVacatingRequest` |
| **Rules** | 14-day notice policy; triggers checkout-month rent sync |
| **Status** | ✅ Production |

### Deposit refund request

| Field | Value |
|-------|-------|
| **Purpose** | Upload meter photo + UPI for refund |
| **User** | Resident |
| **Entry** | Resident hub → Requests / Vacating tab |
| **Rules** | Locked until [[Vacating]] approved + vacate date reached |
| **Services** | `depositRefundEligibility.ts`, `residentRequests.ts` |
| **Status** | ✅ Production |

### Pay rent / electricity (UPI proof)

| Field | Value |
|-------|-------|
| **Purpose** | Submit UPI screenshot for admin approval |
| **Routes** | `/account/resident/pay-rent/[id]`, `pay-electricity/[id]` |
| **Status** | ✅ Production |

---

## Admin — people

### [[Residents]] directory

| Field | Value |
|-------|-------|
| **Purpose** | Verified tenants, financial command center per resident |
| **User** | Admin |
| **Entry** | `/admin/residents`, `/admin/residents/[customerId]` |
| **Features** | Express collection, invoice history, assign bed link, vacating status |
| **SSOT** | `residentAdmin.ts`, `residentFinancialEngine.ts` |
| **Status** | ✅ Production |

### [[KYC]] review

| Field | Value |
|-------|-------|
| **Purpose** | Approve/reject Aadhaar + selfie |
| **Entry** | `/admin/residents/kyc`, `/admin/residents/kyc/[submissionId]` |
| **Rules** | Required before bed assignment for website signups |
| **Status** | ✅ Production |

### Assign tenant / booking

| Field | Value |
|-------|-------|
| **Purpose** | Admin-created booking + bed assignment |
| **Entry** | `/admin/bookings/new`, `/admin/bookings/[bookingId]` |
| **Status** | ✅ Production |

---

## Admin — inventory

### [[Bed Assignment]] / bed map

| Field | Value |
|-------|-------|
| **Purpose** | Visual occupancy, assign/move/remove tenant |
| **Entry** | `/admin/pgs/[pgId]/map` |
| **SSOT** | `occupancySsot.ts`, `pgBedMap.ts` |
| **Rules** | GiST EXCLUDE prevents overlapping active reservations |
| **Status** | ✅ Production (SSOT aligned `88a16e8`) |

### PG / room / bed CRUD

| Field | Value |
|-------|-------|
| **Entry** | `/admin/pgs`, `/admin/pgs/[pgId]/rooms`, `/admin/pricing` |
| **Status** | ✅ Production |

---

## Admin — money

### [[Billing]] hub

| Field | Value |
|-------|-------|
| **Purpose** | Rent + electricity + payment proof approvals |
| **Entry** | `/admin/revenue/billing` (canonical) |
| **Tabs** | rent, electricity, approvals, etc. |
| **SSOT** | `rentInvoices.ts`, `electricityBilling.ts` |
| **Status** | ✅ Production |

### [[Invoices]] (unified)

| Field | Value |
|-------|-------|
| **Purpose** | All invoice types in one registry |
| **Entry** | `/admin/invoices`, `/admin/invoices/[invoiceId]` |
| **Services** | `unifiedInvoices.ts` |
| **Status** | ✅ Production |

### [[Deposits]]

| Field | Value |
|-------|-------|
| **Purpose** | Wallet, ledger, offline collection, refund |
| **Entry** | `/admin/deposits`, `/admin/deposits/[bookingId]` |
| **SSOT** | `deposits.ts`, `depositOperations.ts` |
| **Status** | ✅ Production |

### [[Electricity]]

| Field | Value |
|-------|-------|
| **Purpose** | Room meter bills, split among occupants |
| **Entry** | `/admin/electricity`, `/admin/electricity/new` |
| **Services** | `meterElectricity.ts`, `electricityBilling.ts` |
| **Status** | ✅ Production |

### Revenue dashboard

| Field | Value |
|-------|-------|
| **Entry** | `/admin/revenue` |
| **Status** | ✅ Production |

---

## Admin — move-out

### [[Vacating]] pipeline

| Field | Value |
|-------|-------|
| **Purpose** | Move-out notice → approve → checkout |
| **Entry** | `/admin/vacating` |
| **Services** | `vacating.ts`, `moveOutPipeline.ts`, `vacatingCheckoutBilling.ts` |
| **Rules** | Checkout-month rent pro-rated on submit/approve |
| **Status** | ✅ Production |

### [[Checkout Settlements]]

| Field | Value |
|-------|-------|
| **Purpose** | Electricity + deductions + deposit refund payout |
| **Entry** | `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]` |
| **Services** | `checkoutSettlement.ts` |
| **Status machine** | `awaiting_resident_details` → … → `refund_paid` / `completed` |
| **Status** | ✅ Production |

---

## Admin — operations

### [[Operations]] center

| Field | Value |
|-------|-------|
| **Purpose** | Single priority queue: rent overdue, KYC, beds, move-outs, refunds |
| **Entry** | `/admin/operations` |
| **Services** | `residentOperationsDashboard.ts` |
| **Status** | ✅ Production |

### [[Action Center]]

| Field | Value |
|-------|-------|
| **Purpose** | Synced task items + WhatsApp/email/payment link execution |
| **Entry** | Overview sync, `/admin/operations`, Action Drawer |
| **Services** | `actionItems.ts`, `actionExecution.ts` |
| **Status** | ✅ Production |

### [[Payment Links]] (admin)

| Field | Value |
|-------|-------|
| **Entry** | `/admin/panel?tab=links` |
| **Status** | ✅ Production |

---

## Add-ons & system

### PS4 membership

| Field | Value |
|-------|-------|
| **Entry** | `/admin/playstation`, resident `/account/resident/ps4/new` |
| **Status** | ✅ Production |

### Analytics

| Field | Value |
|-------|-------|
| **Entry** | `/admin/analytics` |
| **Status** | ✅ Production |

### System health / admin panel

| Field | Value |
|-------|-------|
| **Entry** | `/admin/system`, `/admin/panel` |
| **Status** | ✅ Production |

### Automation cron

| Field | Value |
|-------|-------|
| **Entry** | `app/api/cron/automation/route.ts` |
| **Services** | `automationEngine.ts` |
| **Status** | ✅ Production |

---

## Related

[[WORKFLOWS]] · [[ROUTES]] · [[CURRENT_STATE]] · [[AI_CONTEXT]]

<!-- DOC_SYNC_TOUCH_2026-06-21 -->
> **2026-06-21 18:33:10 UTC** — Code changed in: Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-22 -->
> **2026-06-22 00:25:15 UTC** — Code changed in: Routes, Auth, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-23 -->
> **2026-06-23 07:25:58 UTC** — Code changed in: Routes, Auth, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-24 -->
> **2026-06-24 07:11:28 UTC** — Code changed in: Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-25 -->
> **2026-06-25 13:43:37 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-26 -->
> **2026-06-26 07:02:31 UTC** — Code changed in: Routes, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-27 -->
> **2026-06-27 08:37:59 UTC** — Code changed in: Vacating, Action Center, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-29 -->
> **2026-06-29 08:55:28 UTC** — Code changed in: Routes, Billing, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-30 -->
> **2026-06-30 06:36:43 UTC** — Code changed in: Routes, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-01 -->
> **2026-07-01 06:24:39 UTC** — Code changed in: Routes, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-02 -->
> **2026-07-02 08:18:26 UTC** — Code changed in: Routes, Billing, Electricity. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-03 -->
> **2026-07-03 08:28:00 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-04 -->
> **2026-07-04 07:48:05 UTC** — Code changed in: Database, Electricity, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-05 -->
> **2026-07-05 10:29:21 UTC** — Code changed in: Routes, Database, Billing, Bookings, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-06 -->
> **2026-07-06 16:23:12 UTC** — Code changed in: Routes, Database, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-07 -->
> **2026-07-07 06:19:57 UTC** — Code changed in: Database, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-08 -->
> **2026-07-08 08:33:09 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-09 -->
> **2026-07-09 08:00:44 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.
