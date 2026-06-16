# Awesome PG — Master Product & Technical Documentation

**Version:** 1.0 (Phase 3.3 baseline)  
**Last updated:** 2026-06-16  
**Repository:** `awesomepg` (Gumoreh PG management platform)  
**Maintainers:** Update this document whenever routes, services, schema, or workflows change.

---

## How to use this document

This is the **single source of truth** for product and engineering questions without reading source code. Every section lists **routes**, **services** (`src/services/`), **schema** (`src/db/schema/`), and **workflows**.

**Quick lookup:**

| Question | Go to |
|----------|-------|
| Where is deposit refund approval? | [§3.11 Deposit refund](#311-deposit-refund) · `/admin/requests` · `residentRequestActions.ts` |
| How does waitlist / bed interest work? | [§2.3 Browse PG](#23-browse-pg--bed-selection) · `bedNoticeInterest.ts` (not a full waitlist queue) |
| How are notifications generated? | [§6 Notification System](#part-6--notification-system) |
| Where is occupancy calculated? | [§3.18 Occupancy](#318-occupancy-management) · `pgBedMap.ts` · `availability.ts` |
| Reservation expiry? | [§7.2 Hold expiry](#72-reservation--hold-expiry) · `bookingLifecycle.releaseExpiredHolds()` |
| PS4 membership storage? | [§5.8 PlayStation](#playstation_memberships) · `playstationMembership.ts` |
| Visitor analytics? | [§5.10 Analytics tables](#10-analytics--interest) · `visitorAnalytics.ts` |

---

## Table of contents

1. [Full page inventory](#part-1--full-page-inventory)
2. [Customer journey map](#part-2--customer-journey-map)
3. [Admin journey map](#part-3--admin-journey-map)
4. [Financial architecture](#part-4--financial-architecture)
5. [Database entity map](#part-5--database-entity-map)
6. [Notification system](#part-6--notification-system)
7. [Automations](#part-7--automations)
8. [System health](#part-8--system-health)
9. [Known limitations](#part-9--known-limitations)
10. [Future roadmap](#part-10--future-roadmap)

---

# PART 1 — FULL PAGE INVENTORY

**Totals:** ~100 pages · 55+ API routes · 4 layouts

**Auth middleware** (`middleware.ts`):
- Customer cookie required: `/booking/*`, `/account/*`
- Admin cookie required: `/admin/*` except login/forgot/reset password
- Public: `/`, `/login`, `/pgs/*`, `/guide`, `/pay/[linkId]`

**Layouts:**
| Scope | File | Shell |
|-------|------|-------|
| Root | `app/layout.tsx` | Fonts, PostHog, Analytics |
| Admin | `app/(admin)/layout.tsx` | Sidebar, TopNav, ActionDrawer |
| Customer | `app/(customer)/layout.tsx` | SiteHeader, Footer, CockroachAI, visitor tracking |
| PG sub-nav | `app/(admin)/admin/pgs/[pgId]/layout.tsx` | PG setup tabs (map, listing, rooms, collections) |

---

## Public pages

| Route | File | Purpose | Access | Key services |
|-------|------|---------|--------|--------------|
| `/` | `app/page.tsx` | Marketing landing | Public | `LandingPage` |
| `/login` | `app/login/page.tsx` | Customer sign-in | Public | `CustomerLoginForm` |
| `/admin/login` | `app/admin/login/page.tsx` | Admin sign-in | Public | `AdminLoginForm` |
| `/admin/forgot-password` | `app/admin/forgot-password/page.tsx` | Admin recovery | Public | `adminPasswordReset` |
| `/admin/reset-password` | `app/admin/reset-password/page.tsx` | Admin reset token | Public | `adminPasswordReset` |
| `/admin/change-password` | `app/admin/change-password/page.tsx` | Admin password change | Admin | `requireAdminSession` |

---

## Customer pages (`app/(customer)/`)

| Route | Purpose | Access | Components | Data / services |
|-------|---------|--------|------------|-----------------|
| `/pgs` | Browse all PGs with availability | Public | `PgBrowseList` | `listPublicPgs`, `db/queries/customer.ts` |
| `/pgs/[pgSlug]` | PG detail, bed map, gallery | Public | `CustomerBedMap`, amenities | `getPgBySlug`, `pgBedMap` (customer view) |
| `/pgs/[pgSlug]/rooms/[roomId]` | Room + bed selector | Public | `BedSelector`, `BedBookingPanel` | `getRoomDetail`, `availability` API |
| `/guide` | Customer how-to guides | Public | `CustomerGuideTabs` | Static content |
| `/pay/[linkId]` | Payment link landing (UPI) | Public | Payment link UI | `paymentLinks.ts`, `getPaymentLinkById` |
| `/reserve/new` | Confirm bed reserve hold | Customer | `ReserveConfirmForm` | `bedReserve.ts`, `quoteBedReserve` |
| `/booking/new` | Checkout cart | Customer | `BookingCartForm`, `PricingBreakdown` | `quoteBookingPrice`, `createBooking` |
| `/booking/[bookingCode]` | Booking status, cancel | Customer | `CancelBookingForm` | `getBookingByCode`, `bookingLifecycle` |
| `/booking/[bookingCode]/pay` | Pay booking (UPI/Razorpay) | Customer | Checkout experience | `recordPaymentSuccess`, Razorpay |
| `/booking/[bookingCode]/payment-success` | Post-payment polling | Customer | `PaymentSuccessPoller` | Payment status API |
| `/booking/[bookingCode]/extend` | **Deprecated** redirect | Customer | Redirect | Extension removed message |
| `/booking/[bookingCode]/extend/[extensionId]/pay` | Pay stay extension | Customer | Extension pay UI | `extension.ts` |
| `/account/profile` | Profile, KYC, resident hub | Customer | `ProfileForm`, `ResidentAreaSection` | `profile.ts`, `residentFinancialEngine` |
| `/account/bookings` | Booking history | Customer | Bookings list | `listBookingsForCustomer` |
| `/account/change-password` | Change password | Customer | `CustomerChangePasswordForm` | Auth API |
| `/account/set-password` | First-time password | Customer | `CustomerSetPasswordForm` | Auth API |
| `/account/kyc` | Redirect → profile KYC | Customer | Redirect | — |
| `/account/resident` | Redirect → profile resident tab | Customer | Redirect | — |
| `/account/resident/history/[bookingId]` | Payment history | Customer | History list | `listPaymentsForBooking` |
| `/account/resident/request-vacating/[bookingId]` | Submit vacating notice | Customer | `VacatingRequestForm` | `vacating.ts` |
| `/account/resident/pay-rent/[invoiceId]` | Pay rent + upload proof | Customer | `RentPaymentProofForm` | `rentInvoices.ts`, `projectInvoice` |
| `/account/resident/pay-electricity/[invoiceId]` | Pay electricity + proof | Customer | Elec proof form | `electricityBilling.ts` |
| `/account/resident/pay-ps4/[membershipId]` | Pay PS4 membership | Customer | `Ps4PaymentProofForm` | `playstationMembership.ts` |
| `/account/resident/ps4/new` | Subscribe PS4 plan | Customer | PS4 subscribe form | `playstationMembership.ts` |
| `/account/payments/[paymentId]/receipt` | Payment receipt | Customer | Receipt view | `getPaymentForCustomer` |

### Example deep-dive: `/admin/residents/[customerId]`

**Purpose:** Single-resident command center — bed, rent, deposit, KYC, custom charges, combined invoices, tenancy edits.

**Access:** Admin with PG scope (`requireAdminSession`, `adminCanAccessPg`)

**Components:**
- `FinancialCommandCenter.tsx` — selective combined invoice generation
- `CreateCustomChargeForm.tsx`
- Tenancy / bed reassignment forms
- KYC status panel
- `ResidentFinancialSummaryPanel.tsx`

**Actions:**
- Reassign bed (`updateTenantTenancy` → `residentAdmin.ts`)
- Generate combined invoice (`invoiceActions.ts` → `invoiceGeneration.ts`)
- Create custom charge (`customChargeActions.ts` → `customCharges.ts`)
- Adjust deposit collected (`correctDepositCollected` → `deposits.ts`)

**Data sources:**
- `getResidentDetail()` — `residentAdmin.ts`
- `getResidentFinancialSummary()` — **`residentFinancialEngine.ts` (SSOT)**
- `bed_reservations`, `bookings`, `kyc_submissions`

**Related workflows:** [§3.6 Bed assignment](#36-bed-assignment--transfer) · [§3.12 Combined invoice](#312-combined-invoice) · [§4 Financial](#part-4--financial-architecture)

---

## Admin pages (`app/(admin)/admin/`)

### Core & overview

| Route | Purpose | Key services |
|-------|---------|--------------|
| `/admin` | Redirect → overview | — |
| `/admin/overview` | Operator control board, KPIs | `controlBoard.ts`, `overviewData.ts`, `loadOverviewContext` |
| `/admin/panel` | Super-admin: coupons, permissions, audit | `adminPanel.ts`, `DateCouponAdminPanel` |
| `/admin/notifications` | Notification inbox (New/Seen/Resolved) | `adminNotifications.ts`, `syncActionItems` |
| `/admin/requests` | Resident requests queue (deposit refund, extensions) | `residentRequests.ts`, `residentRequestActions.ts` |
| `/admin/guide` | In-app admin documentation search | `AdminGuideSearch` |
| `/admin/monitoring` | Error/log monitoring | `monitoring.ts` |
| `/admin/deployments` | Deploy watchdog | `deploy/persistence.ts` |
| `/admin/emails` | Email delivery log | `email/deliveryLog.ts` |
| `/admin/settings` | PG settings, test data cleanup | `listPgSettings`, `operatorTestDataCleanup` |

### Financial modules

| Route | Purpose | Key services |
|-------|---------|--------------|
| `/admin/revenue` | Revenue command center, charts | `revenueCommandCenter.ts`, `residentFinancialEngine` |
| `/admin/revenue/pg/[pgId]` | Per-PG revenue | Same, PG-scoped |
| `/admin/revenue/pg/[pgId]/resident/[residentId]` | Per-resident revenue | `ResidentEntityPanel` |
| `/admin/collections` | Billing queue, payment approvals | `listAdminRentInvoices`, `paymentProofQueue.ts` |
| `/admin/collections/pg/[pgId]` | PG-scoped collections | Same |
| `/admin/collections/pg/[pgId]/resident/[residentId]` | Resident collections drill-down | `ResidentEntityPanel` |
| `/admin/invoices` | Unified invoice list | `unifiedInvoices.ts` |
| `/admin/invoices/[invoiceId]` | Invoice detail + cancel/refund | `getUnifiedInvoiceDetail`, `cancelUnifiedInvoice` |
| `/admin/invoices/[invoiceId]/print` | Printable invoice | `getUnifiedInvoiceDetail` |
| `/admin/deposits` | Deposit summaries | `deposits.ts`, `depositCollection.ts` |
| `/admin/deposits/[bookingId]` | Deposit ledger + settlement | `DepositSettlementPanel`, `getDepositSummaryForBooking` |
| `/admin/deposits/add` | Record new deposit | `KycApprovedDepositSearch` |
| `/admin/deposits/collected` | Collected deposits by month | `listDepositCollectionsForBillingMonth` |
| `/admin/pricing` | **Pricing Center** — rate adjustments | `PricingCenter.tsx`, `pgInventory.ts`, `pricingPropagation.ts` |

### Operations & residents

| Route | Purpose | Key services |
|-------|---------|--------------|
| `/admin/operations` | Occupancy + operations center | `operationsCenter.ts`, `getOccupancyByPg` |
| `/admin/operations/pg/[pgId]` | Per-PG operations | Same |
| `/admin/operations/pg/[pgId]/resident/[residentId]` | Resident ops drill-down | `ResidentEntityPanel` |
| `/admin/bookings` | All bookings table | `listBookings` |
| `/admin/bookings/new` | Admin assign tenant to bed | `tenantAssignment.ts`, `AssignTenantForm` |
| `/admin/bookings/[bookingId]` | Booking detail, extensions, cancel | `bookingAdminOps.ts`, `getAdminBookingDetail` |
| `/admin/residents` | Resident list | `listResidentsForAdmin` |
| `/admin/residents/[customerId]` | Resident command center | See example above |
| `/admin/residents/kyc` | KYC queue | `kyc.ts`, `listPendingKycSubmissions` |
| `/admin/residents/kyc/[submissionId]` | KYC review | `KycReviewActions` |
| `/admin/vacating` | Vacating notice queue | `vacating.ts`, `listAdminVacatingRequests` |
| `/admin/analytics` | Visitor + booking funnel analytics | `visitorAnalytics.ts`, `BookingFunnelAnalyticsDashboard` |

### PG management

| Route | Purpose | Key services |
|-------|---------|--------------|
| `/admin/pgs` | PG list | `listPgs` |
| `/admin/pgs/new` | Create PG | `pgAdmin.ts` |
| `/admin/pgs/[pgId]/map` | Interactive bed map | `pgBedMap.ts`, `PgBedMapPanel` |
| `/admin/pgs/[pgId]/listing` | PG listing content (photos, copy) | `pgAdmin.ts` |
| `/admin/pgs/[pgId]/rooms` | Rooms, beds, meters, pricing editor | `pgInventory.ts`, `RoomPricingEditor` |
| `/admin/pgs/[pgId]/collections` | PG payment proof queue | `PgCollectionsPanel` |
| `/admin/electricity/new` | Create electricity bill | `electricityBilling.ts`, `meterElectricity.ts` |
| `/admin/playstation` | PS4 membership admin | `playstationMembership.ts` |

### System / audit tools

| Route | Purpose | Key services |
|-------|---------|--------------|
| `/admin/system` | System health hub | `healthEngine.ts`, `MonitoringDashboard` |
| `/admin/system/bed-audit` | Bed consistency audit + repair | `bedAudit.ts` |
| `/admin/system/financial-audit` | Financial SSOT vs surfaces | `financialAudit.ts` |
| `/admin/system/health-report` | Full PASS/FAIL health report | `systemHealthAudit.ts` |
| `/admin/system/pricing-health` | Pricing path audit | `pricingHealthAudit.ts` |
| `/admin/system/recalculate-financial` | Emergency financial recalc | `financialAudit.recalculateAllFinancialSummaries` |

### Legacy redirects (still routable)

`/admin/dashboard` → overview · `/admin/beds|floors|rooms` → pgs · `/admin/rent` → collections?tab=rent · `/admin/electricity` → collections?tab=electricity · `/admin/kyc` → residents/kyc · `/admin/health` → system · etc.

---

## API routes (`app/api/`)

### Auth (`/api/auth/*`)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/customer/login` | POST | Customer login |
| `/api/auth/customer/change-password` | POST | Change password |
| `/api/auth/customer/set-password` | POST | First-time password |
| `/api/auth/customer/forgot-password` | POST | Email OTP reset |
| `/api/auth/customer/email/send` | POST | Send OTP |
| `/api/auth/customer/email/verify` | POST | Verify OTP + create profile |
| `/api/auth/admin/login` | POST | Admin login |
| `/api/auth/admin/change-password` | POST | Admin change password |
| `/api/auth/admin/forgot-password` | GET/POST | Admin recovery |
| `/api/auth/admin/reset-password` | GET/POST | Admin reset token |
| `/api/auth/logout` | POST | Destroy session |

### Beds & availability
| Route | Purpose | Service |
|-------|---------|---------|
| `/api/availability` | PG-wide availability | `availability.ts` |
| `/api/beds/[bedId]/availability` | Bed timeline (365-day look-ahead) | `getBedAvailabilityTimeline` |
| `/api/beds/[bedId]/reserve-quote` | Bed reserve quote | `bedReserve.ts` |
| `/api/beds/[bedId]/interest` | Record bed interest (waitlist signal) | `bedNoticeInterest.ts` |

### Payments & proof
| Route | Purpose |
|-------|---------|
| `/api/payments/razorpay/status` | Poll Razorpay status |
| `/api/payments/razorpay/verify` | Verify checkout signature |
| `/api/payment-record` | QR payment records |
| `/api/rent-invoice/[id]/payment-proof` | Upload rent proof |
| `/api/electricity-invoice/[id]/payment-proof` | Upload electricity proof |
| `/api/stay-extension/[id]/payment-proof` | Upload extension proof |
| `/api/playstation/membership/[id]/payment-proof` | Upload PS4 proof |
| `/api/payment-proof/booking/[id]` | Serve booking proof image |
| `/api/admin/payment-proof/[kind]/[id]` | Admin view proof |

### Cron (`/api/cron/*`) — Bearer `CRON_SECRET`
| Route | Schedule (UTC) | Purpose |
|-------|----------------|---------|
| `/api/cron/generate-monthly-rent` | `0 2 * * *` | Rent invoice generation |
| `/api/cron/release-holds` | `0 4 * * *` | Expire booking holds |
| `/api/cron/expire-bed-reserves` | `30 4 * * *` | Expire bed reserve holds |
| `/api/cron/automation` | `0 6 * * *` | Automation detect + send + notification sync |
| `/api/cron/bootstrap-admin` | Manual | Seed admin user |
| `/api/cron/deploy-watchdog` | Manual/webhook | Deploy health |
| `/api/cron/mark-pg-occupancy` | Manual | Mark PGs fully occupied |
| `/api/cron/clear-pg-occupancy` | Manual | Clear occupancy placeholders |

### Webhooks
| Route | Source | Purpose |
|-------|--------|---------|
| `/api/webhooks/razorpay` | Razorpay | Payment success/refund |
| `/api/webhooks/mock` | Dev | Mock payments |
| `/api/webhooks/vercel` | Vercel | Deploy events |

### Analytics
| Route | Purpose | Service |
|-------|---------|---------|
| `/api/analytics/event` | Named events | `visitorAnalytics.ts` |
| `/api/analytics/track` | Page views | `visitorAnalytics.ts` |
| `/api/analytics/heartbeat` | Session heartbeat | `visitorAnalytics.ts` |

---

# PART 2 — CUSTOMER JOURNEY MAP

## 2.1 Account creation

1. Customer visits `/login` or starts booking (redirected to login with `?next=`).
2. **Email OTP path:** `/api/auth/customer/email/send` → `/api/auth/customer/email/verify` creates `customers` row.
3. Profile fields: name, phone, gender collected at `/account/profile` or during checkout (`BookingCartForm`).
4. `customers.must_set_password` may force `/account/set-password`.
5. **KYC** optional until check-in policy requires it (`kyc_submissions`).

**Files:** `src/lib/auth/otp.ts`, `src/services/profile.ts`, `app/(customer)/account/profile/page.tsx`

## 2.2 Login

1. POST `/api/auth/customer/login` with email + password.
2. `createCustomerSession()` → `auth_sessions` row + cookie.
3. Middleware allows `/booking/*` and `/account/*`.
4. Redirect to `?next=` URL if present.

## 2.3 Browse PG & bed selection

1. `/pgs` — list properties with "from ₹X" pricing (`db/queries/customer.ts`).
2. `/pgs/[pgSlug]` — bed map shows availability per bed (`CustomerBedMap`, `pgBedMap` customer projection).
3. `/pgs/[pgSlug]/rooms/[roomId]` — `BedSelector` opens `BedBookingPanel`.
4. **Date selection:** `StayDateRangePicker` — check-in/check-out or open-ended move-in.
5. **Availability:** `GET /api/beds/[bedId]/availability` returns free windows, future reservations.
6. **Bed interest (not full waitlist):** If bed in vacating notice period, visitor can register interest via `POST /api/beds/[bedId]/interest` → `bed_notice_interest` table. Cleared when bed is booked (`clearBedInterest`).
7. Navigate to `/booking/new?start=&end=&mode=&bed[]=`.

**Occupancy SSOT:** `bed_reservations` with `status IN ('hold','active')` and `stay_range` half-open `[start,end)`. `manualOccupied` is legacy admin mark only (emergency repair via bed audit).

## 2.4 Bed booking (checkout)

1. `/booking/new` — `quoteBookingPrice()` from `pricing.ts` (live quote, no cache).
2. **Fixed stay:** lowest-price optimizer (`fixedStayOptimizer.ts`) picks min of daily / weekly-ceil / week+day combos.
3. **Open-ended:** 1 month rent upfront + 2× monthly deposit.
4. `BookingCartForm` shows `PricingBreakdown` (rent lines, deposit, PS4, coupon, grand total).
5. Optional: date coupon (DDMMYY, 10% off rent), PS4 add-on, partial deposit checkbox.
6. `createBookingAction` → `booking.ts` → `createBooking()`:
   - Inserts `bookings` + `bed_reservations` (hold with `hold_expires_at`)
   - Stores `pricing_snapshot` JSON
   - Creates `playstation_memberships` if PS4 selected
7. Redirect to `/booking/[code]/pay`.

## 2.5 Payment

1. `/booking/[bookingCode]/pay` — UPI QR or Razorpay checkout.
2. Customer pays → webhook `POST /api/webhooks/razorpay` OR manual QR proof upload.
3. `recordPaymentSuccess()` in `bookingLifecycle.ts`:
   - Validates amount via `depositCollection.validateBookingPayment()`
   - Writes `payments` row
   - `recordDepositCollected()` → `deposit_ledger`
   - Hold reservations → `active`
   - Booking → `confirmed`
4. `/booking/[code]/payment-success` polls until confirmed.

## 2.6 Reservation (inventory)

- **Hold:** `bed_reservations.status = 'hold'`, `hold_expires_at` set (default ~30 min).
- **Active:** After payment, `status = 'active'`, `stay_range` covers stay.
- **Expiry:** Cron `release-holds` calls `releaseExpiredHolds()` — cancels hold + booking if unpaid.
- **GiST EXCLUDE** on `bed_reservations` prevents overlapping holds/active on same bed.

## 2.7 Check-in

- **Customer path:** Move-in date arrives; reservation already `active` from payment.
- **Admin path:** `activateReservationNow()` in `residentAdmin.ts` for future-dated reservations.
- **KYC:** Admin approves at `/admin/residents/kyc/[id]` before or after move-in.
- **Meter:** Admin records check-in meter reading (`meterElectricity.ts`).

## 2.8 Vacating

1. Customer: `/account/resident/request-vacating/[bookingId]` → `submitVacatingRequest()`.
2. Requires 30+ days notice for compliant vacating (5-day rent penalty if short — `vacatingPenalty.ts`).
3. Admin reviews at `/admin/vacating` — approve or complete.
4. `completeVacatingRequest()` (`vacating.ts`):
   - Records deposit deduction/refund in `deposit_ledger`
   - Cancels future rent + electricity invoices
   - Booking → `completed`
   - Reservations → `completed`
   - `reconcileBookingOccupancy()`

## 2.9 Deposit refund

**Two paths:**

**A. Vacating completion (automatic):**
- `completeVacatingRequest()` computes refundable balance, writes `deposit_ledger` refund entry.

**B. Resident request (admin approval):**
1. Customer submits deposit refund request → `resident_requests` (`type = deposit_refund`).
2. Appears in `/admin/requests` and as `action_items` + notifications.
3. Admin approves/rejects via `residentRequestActions.ts`.
4. Refund processed through deposit ledger + optional payment record.

## 2.10 Electricity payment

1. Admin creates room bill → `electricity_invoices` per resident.
2. Customer sees outstanding in resident profile (`residentFinancialEngine`).
3. `/account/resident/pay-electricity/[invoiceId]` — upload UPI proof.
4. Admin approves in collections → `recordElectricityPaymentSuccess()`.

## 2.11 Requests

Types in `resident_requests`:
- `deposit_refund`
- `stay_extension`
- `deposit_due_extension`

Workflow: submit → `submitted` → admin `under_review` → `approved`/`rejected` → `completed`.

## 2.12 Notifications (customer)

Customers do **not** have an in-app notification center. They receive:
- WhatsApp/email via `automationEngine.ts` (rent due, check-in reminders, etc.)
- Resident profile shows outstanding invoices and deposit status.

---

# PART 3 — ADMIN JOURNEY MAP

## 3.1 New booking

**Route:** `/admin/bookings/new`  
**Service:** `tenantAssignment.ts` → `assignTenantToBed()`  
**Steps:**
1. Select PG, bed, customer (or create).
2. Quote via `quoteAdminTenantAssignment()` (can override rent/deposit).
3. Creates `bookings` + `bed_reservations` (active).
4. `reconcileBookingOccupancy()` clears stale manual marks.

## 3.2 Booking approval

Payment proof queue at `/admin/collections` (tab approvals).  
`reviewPaymentRecord()` or Razorpay webhook confirms booking payment.

## 3.3 Payment review

`paymentProofQueue.ts` lists pending QR proofs.  
Admin approves → triggers `recordRentPaymentSuccess` / booking payment handlers.

## 3.4 Check-in

- Activate future reservation: `activateReservationNow()` on resident profile.
- Record meter check-in reading on room page.

## 3.5 Bed assignment

See §3.1. Reassignment: `updateTenantTenancy()` in `residentAdmin.ts` — closes old reservation, opens new, `reconcileBookingOccupancy()`.

## 3.6 Bed assignment & transfer

**Resident profile** → change bed → `updateTenantTenancy()`:
1. Validates bed availability via `isBedAvailable()`.
2. Completes old `bed_reservations`, inserts new active range.
3. Updates `pricing_snapshot` if rent changes.
4. `recalculatePendingRentInvoicesForBooking()` if rent changed.

## 3.7 Vacating

`/admin/vacating` — approve pending notices, complete checkout.  
`completeVacatingRequest()` — financial + inventory cleanup.

## 3.8 Deposit collection

`/admin/deposits` — outstanding deposit list from engine.  
`ensureDepositDuePaymentLink()` creates UPI link.  
`applyPartialDepositOnConfirm()` / `applyFullDepositOnConfirm()` update `bookings.deposit_collection_status`.

## 3.9 Rent collection

Monthly cron generates `rent_invoices`.  
Collections page shows overdue/pending.  
WhatsApp reminders via automation engine.

## 3.10 Electricity billing

`/admin/electricity/new` → `createElectricityBill()`:
1. Meter readings → room total.
2. Split equally (or pro-rata by active days) across residents.
3. Creates `electricity_invoices` + syncs `financial_invoices`.

## 3.11 Deposit refund

`/admin/requests` — deposit refund requests.  
Vacating path auto-refunds on completion.  
Manual: admin adjusts via deposit ledger on `/admin/deposits/[bookingId]`.

## 3.12 Combined invoice

**Resident profile** → `FinancialCommandCenter.tsx`:
1. Select categories: Rent, Deposit, Electricity, Custom.
2. Presets or custom line selection.
3. `generateInvoiceFromSsot()` — reads `residentFinancialEngine`, never invents amounts.
4. Creates `financial_invoices` (`invoiceType: combined`) + `payment_links`.
5. Duplicate guard blocks overlapping active combined invoices.

## 3.13 Custom charge

`CreateCustomChargeForm` → `customCharges.ts` → inserts `financial_invoices` (`custom`/`penalty`/`damage`).

## 3.14 Notification management

`/admin/notifications` — tabs: New (unread), Seen (read), Resolved (archived).  
Click item → marks read via `/api/admin/notifications/read`.  
Visiting module pages bulk-marks seen (`markNotificationsSeenForPath`).

## 3.15 Analytics

`/admin/analytics` — visitor sessions, page views, booking funnel, device/geo breakdown.  
Data from `visitor_sessions`, `site_page_views`, `site_analytics_events`.

## 3.16 Occupancy management

`/admin/operations` — occupancy by PG.  
`/admin/pgs/[pgId]/map` — bed-level map with occupant, vacating, billing hints.  
`pgBedMap.ts` derives `isOccupiedToday` from active reservations covering today.

## 3.17 Pricing management

`/admin/pricing` — **Pricing Center**:
- PG + room selector, bed map with rates.
- Adjust daily/weekly/monthly by % or fixed amount.
- `propagatePricingChangeForBeds()` syncs deposits + pending rent invoices.
- Optional notify resident of deposit delta.

Also: `/admin/pgs/[pgId]/rooms` → `RoomPricingEditor` for absolute rate entry.

## 3.18 Room & PG management

- **PG:** `/admin/pgs/new`, listing editor, amenities.
- **Rooms/beds:** `/admin/pgs/[pgId]/rooms` — add beds, archive, set rates, manual occupied toggle (legacy emergency only).

## 3.19 Audit tools

| Tool | Route | Service |
|------|-------|---------|
| Bed audit | `/admin/system/bed-audit` | `bedAudit.ts` |
| Financial audit | `/admin/system/financial-audit` | `financialAudit.ts` |
| Health report | `/admin/system/health-report` | `systemHealthAudit.ts` |
| Pricing health | `/admin/system/pricing-health` | `pricingHealthAudit.ts` |
| Recalculate | `/admin/system/recalculate-financial` | `financialAudit.recalculateAllFinancialSummaries` |

## 3.20 System repair tools

`bedAudit.repairBedAuditIssue()` — clear ghost `manualOccupied`, reconcile double assignments.  
`vacatingAudit.repairVacatingAuditIssues()` — close stale reservations after completed vacating.  
`reconcileStaleFinancialInvoices()` — fix unified invoice drift.

---

# PART 4 — FINANCIAL ARCHITECTURE

## SSOT rule

**All money displayed to admin or customer must come from `residentFinancialEngine.ts`.**  
Surfaces: Overview, Revenue, Collections, Resident Profile, Financial Command Center, Deposits panel.

Supporting registry: `financial_invoices` (unified layer) synced from source tables via `unifiedInvoices.ts`.

---

## Rent

| Aspect | Detail |
|--------|--------|
| **Calculated** | Booking: `pricing.ts`. Monthly: `rentInvoices.generateRentInvoicesForMonth()` from `pricing_snapshot.perBed[].monthlyRatePaise`, pro-rated for partial months. |
| **Billed** | `rent_invoices` per `booking_id` + `billing_month`. Due date + 1%/day late fee after due (`billing.ts`). |
| **Paid** | Razorpay webhook, QR proof approval, `recordRentPaymentSuccess()`. |
| **Partially paid** | `paid_principal_paise` + `paid_late_fee_paise` < total → status `partial` (if supported) or `pending` with partial paid fields. |
| **Refunded** | Via vacating (cancel future invoices) or booking cancellation `computeRefund()` in `cancellationPolicy.ts`. |
| **Unified sync** | `syncRentInvoiceToUnified()` mirrors to `financial_invoices`. |

**Files:** `src/services/rentInvoices.ts`, `src/services/pricing.ts`, `src/lib/billing/billing.ts`

---

## Deposit

| Aspect | Detail |
|--------|--------|
| **Calculated** | Monthly/open-ended: **2× monthly rent**. Fixed stay: **50% of rent subtotal**. Daily/weekly: per-mode columns on `bed_prices`. |
| **Collected** | At booking checkout (`recordDepositCollected` → `deposit_ledger` +). Partial option: pay half now, rest via payment link. |
| **Tracked** | Append-only `deposit_ledger` (collected +, deducted −, refunded −). `bookings.deposit_collection_status`, `deposit_due_paise`. |
| **Refunded** | Vacating completion, resident request approval, manual admin adjustment. |
| **SSOT read** | `getDepositSummaryForBooking()` + engine deposit category. |

**Files:** `src/services/deposits.ts`, `src/services/depositCollection.ts`, `src/services/depositCredit.ts`

---

## Electricity

| Aspect | Detail |
|--------|--------|
| **Generated** | Admin creates `electricity_bills` from meter readings. |
| **Split** | Equal per resident OR pro-rata by active days in billing month. |
| **Billed** | `electricity_invoices` per booking. Late fees similar to rent. |
| **Paid** | Proof upload + admin approval → `recordElectricityPaymentSuccess()`. |
| **Prepaid credit** | `room_electricity_prepaid_ledger` can offset bill total. |

**Files:** `src/services/electricityBilling.ts`, `src/services/meterElectricity.ts`, `src/services/roomElectricityPrepaid.ts`

---

## Combined invoices

| Aspect | Detail |
|--------|--------|
| **Generated** | `invoiceGeneration.generateInvoiceFromSsot()` — picks outstanding lines from engine. |
| **Linked** | `breakdown.lines[]` with `sourceTable` + `sourceId` pointing to rent/elec/deposit/custom rows. |
| **Allocated** | `invoicePayment.allocateInvoicePayment()` — FIFO across lines (partially wired). |
| **Cancelled** | `cancelUnifiedInvoice()` — cancels combined row; for combined type, **re-syncs** source rent/elec (does not cancel underlying SSOT debt). Non-combined cancels sources. Auto `reconcileStaleFinancialInvoices()`. |
| **Refunded** | `refundUnifiedInvoice()` + `reverseInvoicePaymentAllocation()`. |

**Files:** `src/services/invoiceGeneration.ts`, `src/services/unifiedInvoices.ts`, `src/services/invoicePayment.ts`

---

## Custom charges

| Aspect | Detail |
|--------|--------|
| **Created** | Admin form → `customCharges.ts` → `financial_invoices` (`custom`/`penalty`/`damage`). |
| **Collected** | Payment link or manual allocation. |
| **SSOT** | Appears in engine **other** category; included in outstanding totals. |

---

## Pricing (booking-time)

**File:** `src/services/pricing.ts` + `src/lib/pricing/fixedStayOptimizer.ts`

| Mode | Rent formula | Deposit |
|------|--------------|---------|
| `daily` | nights × dailyRate | dailySecurityDeposit |
| `weekly` | ceil(nights/7) × weeklyRate | weeklySecurityDeposit |
| `monthly` | calendar months + pro-rata days | 2× monthly |
| `open_ended` | 1× monthly upfront | 2× monthly |
| `fixed_stay` | **lowest** of all valid combos | 50% of rent subtotal |

Promo: `dateCoupon.ts` — DDMMYY code, 10% off rent only at checkout.

PS4: Separate `playstation_memberships` — not in `bookings.total_paise`.

---

# PART 5 — DATABASE ENTITY MAP

**49 tables** in `src/db/schema/`. Migrations `0000`–`0050`.

## Core hierarchy

```
pgs → floors → rooms → beds → bed_prices
customers → bookings → bed_reservations
                      → payments
                      → rent_invoices
                      → electricity_invoices (via electricity_bills)
                      → deposit_ledger
                      → vacating_requests
                      → financial_invoices (unified)
                      → playstation_memberships
```

---

### `bookings`
- **Purpose:** Central booking record — pricing snapshot, totals, deposit collection state, admin ops flags.
- **Key columns:** `booking_code`, `customer_id`, `status`, `duration_mode`, `pricing_snapshot` (jsonb), `deposit_paise`, `deposit_collection_status`, `deposit_due_paise`, `blocks_room_availability`.
- **Created by:** `booking.ts` (customer), `tenantAssignment.ts` (admin), `bedReserve.ts`.
- **Updated by:** `bookingLifecycle.ts`, `vacating.ts`, `depositCollection.ts`, `bookingAdminOps.ts`.
- **Read by:** Virtually all billing and occupancy services.

### `beds`
- **Purpose:** Individual bed in a room.
- **Key columns:** `bed_code`, `status`, `manual_occupied`, `manual_reserved_*` (legacy admin marks).
- **Relationships:** `room_id` → `rooms`.
- **Note:** Operational occupancy = `bed_reservations`, not `manual_occupied`.

### `bed_reservations`
- **Purpose:** **SSOT for occupancy** — one row per bed per date range.
- **Key columns:** `stay_range` (daterange `[start,end)`), `status` (hold/active/cancelled/completed), `kind` (primary/extension), `hold_expires_at`.
- **Constraint:** GiST EXCLUDE prevents overlapping hold/active on same bed.
- **Created by:** `booking.ts`, `tenantAssignment.ts`, `extension.ts`.
- **Updated by:** `bookingLifecycle.ts`, `vacating.ts`, `occupancySync.ts`.

### `rent_invoices`
- **Purpose:** Monthly rent billing per booking.
- **Key columns:** `billing_month`, `rent_paise`, `paid_principal_paise`, `late_fee_locked_paise`, `status`, `due_date`.
- **Created by:** `rentInvoices.generateRentInvoicesForMonth()` (cron).
- **Updated by:** `recordRentPaymentSuccess()`, `vacating.ts` (cancel future).

### `electricity_invoices` / `electricity_bills`
- **Purpose:** Room-level bill header + per-resident invoice lines.
- **Created by:** `electricityBilling.createElectricityBill()`.

### `financial_invoices`
- **Purpose:** Unified invoice registry for admin UI, payment links, combined bills.
- **Key columns:** `invoice_type`, `source_table`, `source_id`, `breakdown` (jsonb with lines + paidPaise), `status`, `payment_link_id`.
- **Types:** `rent`, `electricity`, `deposit`, `combined`, `custom`, `penalty`, `damage`, `ps4`.

### `payment_links`
- **Purpose:** Generated UPI links for residents.
- **Key columns:** `resident_id`, `amount`, `purpose`, `upi_qr_url`, `invoice_id`, `status` (active/paid/expired).
- **Created by:** `paymentLinks.ts`, `unifiedInvoices.ts`, `depositCollection.ts`.

### `deposit_ledger`
- **Purpose:** Append-only signed deposit movements.
- **Entry kinds:** `collected` (+), `deducted` (−), `refunded` (−).
- **Created by:** `deposits.ts` (all deposit mutations).

### `vacating_requests`
- **Purpose:** Monthly resident vacating workflow.
- **Key columns:** `notice_given_date`, `vacating_date`, `notice_compliant`, `deduction_paise`, `deposit_refund_paise`, `status`.
- **One per booking** (unique `booking_id`).

### `admin_notifications` + `admin_notification_states`
- **Purpose:** Admin inbox + per-admin read/archive state.
- **Deduped by:** `source_key` (matches `action_items.source_key`).

### `action_items`
- **Purpose:** Operator to-do queue (rent due, KYC, vacating, payment reviews).
- **Statuses:** `open`, `resolved`.

### `resident_requests`
- **Purpose:** Customer-initiated deposit refund, extension, deposit-due extension.
- **Types:** `deposit_refund`, `stay_extension`, `deposit_due_extension`.

### `playstation_memberships`
- **Purpose:** PS4 gaming add-on subscriptions.
- **Key columns:** `plan` (weekly/biweekly/monthly), `status`, `amount_paise`, `starts_at`, `expires_at`.
- **Plans defined in:** `src/lib/playstation/plans.ts` (₹350/wk, ₹600/bi-wk, ₹800/mo).

### `bed_notice_interest`
- **Purpose:** Visitor interest registration when bed in notice period (lightweight waitlist signal, not automated assignment).
- **Unique:** `(bed_id, visitor_key)`.

### Analytics tables
- `visitor_sessions` — traffic source, UTM, device, geo, optional `customer_id`.
- `site_page_views` — page keys + duration.
- `site_analytics_events` — funnel events (`bed_selected`, etc.).
- `room_page_views` — per-room deduped views.

### Other major tables
| Table | Purpose |
|-------|---------|
| `customers` | Tenant identity, KYC status, auth |
| `admin_users` | Admin accounts, roles, PG scope |
| `auth_sessions` | Session tokens |
| `kyc_submissions` | Aadhaar + selfie documents |
| `bed_prices` | Time-versioned rates per bed |
| `payments` | Payment ledger (booking, refund, rent, etc.) |
| `stay_extensions` | Extension requests + quoted totals |
| `bed_reserve_holds` | Paid bed reserve workflow |
| `pg_payment_categories` / `pg_payment_records` | UPI QR categories + proof queue |
| `meter_logs` | Room electricity meter readings |
| `automation_events` / `automation_actions` | Scheduled WhatsApp/email queue |
| `coupon_redemptions` | Date coupon usage at checkout |
| `audit_log` | Generic entity audit trail |
| `invoice_audit_events` | Financial invoice change log |

---

# PART 6 — NOTIFICATION SYSTEM

## Architecture

Two parallel feeds synced from the same sources:

1. **`action_items`** — operator tasks (stay open until resolved).
2. **`admin_notifications`** — inbox UI with per-admin state.

**Sync pipeline:** `actionItems.syncActionItems()` → `syncAdminNotificationsFromActionItems()`.

## Notification types (`action_item_type` enum)

| Type | Label | Source | source_key pattern |
|------|-------|--------|-------------------|
| `rent_due` | Rent Due | Pending/overdue rent invoice | `rent:{invoiceId}` |
| `electricity_due` | Electricity Due | Pending elec invoice | `electricity:{invoiceId}` |
| `kyc_pending` | KYC Pending | Pending KYC submission | `kyc:{submissionId}` |
| `vacating_alert` | Vacating | Pending/approved vacating | `vacating:{requestId}` |
| `refund_pending` | Refund Pending | Completed booking, admin refund pending | `refund:{bookingId}` |
| `deposit_collection_due` | Deposit Due | Outstanding deposit | `deposit_due:{bookingId}` |
| `payment_received` | Payment Review | Pending QR proof | `payment_review:{key}` |
| `maintenance_issue` | Maintenance | Bed status maintenance | `maintenance:{bedId}` |
| `deposit_refund_request` | Deposit Refund Request | `resident_requests` | `resident_request:{id}` |
| `extension_request` | Extension Request | `resident_requests` | `resident_request:{id}` |

## State machine (per admin)

| State | UI tab | Meaning |
|-------|--------|---------|
| `unread` | **New** | Not yet seen by this admin |
| `read` | **Seen** | Clicked or page-visited |
| `archived` | **Resolved** | Underlying task closed or manually archived |

## Where generated

- **Page load:** `syncActionItems(session)` on overview, collections, deposits, vacating, KYC, operations, requests.
- **Cron:** `syncActionItemsForCron()` in `/api/cron/automation` (daily 06:00 UTC).
- **After billing events:** rent generation post-hook.

**File:** `src/services/actionItems.ts`, `src/services/adminNotifications.ts`

## Where cleared

- **Single read:** Click notification → `POST /api/admin/notifications/read`.
- **Bulk seen:** `markNotificationsSeenForPath(pathname)` when visiting module pages (`src/lib/admin/notificationRead.ts`).
- **Resolved:** When `action_items.status` → `resolved`, notification states → `archived`.
- **Stale cleanup:** `archiveNotificationsWithoutOpenTasks()`.

## Badge logic

`loadAdminNavBadges()` counts unread notifications by type → maps to sidebar modules (collections, deposits, kyc, operations, overview total).

**Files:** `src/services/adminNavBadges.ts`, `src/components/admin/Sidebar.tsx`

---

# PART 7 — AUTOMATIONS

## Vercel crons (`vercel.json`)

| Cron | UTC | Endpoint | Service function |
|------|-----|----------|------------------|
| Rent generation | 02:00 daily | `/api/cron/generate-monthly-rent` | `generateRentInvoicesForMonth()`, `markOverdueInvoices()` |
| Hold release | 04:00 daily | `/api/cron/release-holds` | `releaseExpiredHolds()` |
| Bed reserve expiry | 04:30 daily | `/api/cron/expire-bed-reserves` | `expireStaleBedReserves()` |
| Automation | 06:00 daily | `/api/cron/automation` | `detectAutomationEvents()`, `processQueuedAutomationActions()`, `syncActionItemsForCron()` |

All require `Authorization: Bearer $CRON_SECRET`.

## Hold expiry workflow

**Trigger:** Cron `release-holds`  
**Service:** `bookingLifecycle.releaseExpiredHolds()`

1. Find `bed_reservations` where `status='hold'` AND `hold_expires_at <= now`.
2. Set reservations → `cancelled`.
3. If booking has zero remaining hold/active reservations → booking → `cancelled` (reason: hold expired before payment).
4. Also runs `markExpiredExtensions()`.

## Reservation expiry (bed reserve)

**Trigger:** Cron `expire-bed-reserves`  
**Service:** `bedReserve.expireStaleBedReserves()` — expires unpaid bed reserve holds.

## Invoice generation

**Trigger:** Cron `generate-monthly-rent` (also manual via admin rent actions)

1. Find confirmed `monthly`/`open_ended` bookings with active reservation intersecting billing month.
2. Pro-rate rent from `pricing_snapshot`.
3. Insert `rent_invoices` (idempotent on `booking_id + billing_month`).
4. `syncRentInvoiceToUnified()` each new invoice.
5. `reconcileStaleFinancialInvoices()`.
6. `syncActionItemsForCron()` for notifications.
7. `markOverdueInvoices()` for past-due pending invoices.

## Automation engine (WhatsApp/email)

**File:** `src/services/automationEngine.ts`  
**Rules:** `src/lib/automation/rules.ts`  
**Templates:** `src/lib/automation/templates.ts`

**Detects (daily cron):** rent due (2 days), rent overdue, electricity due/overdue, vacating in 7 days, KYC pending, check-in in 3 days, deposit refund pending, deposit collection due (7d/1d), deposit overdue.

**Realtime:** `emitPaymentReceivedAutomation()` on payment success.

**Important:** Engine reads existing DB rows — does not compute billing amounts.

## Occupancy reconciliation

- **Per booking:** `occupancySync.reconcileBookingOccupancy()` — after cancel, vacating, reassignment.
- **Orphan cleanup:** `reconcileOrphanBedReservations()` — reservations whose parent booking is cancelled/completed.
- **Emergency:** `bedAudit.repairBedAuditIssue()`.

## Financial reconciliation

- **Automatic:** `reconcileStaleFinancialInvoices()` on overview load, rent gen, invoice cancel.
- **Manual:** `/admin/system/recalculate-financial`.
- **CLI:** `scripts/reconcile-financial-data.ts`, `scripts/run-production-health-audit.ts`.

---

# PART 8 — SYSTEM HEALTH

## Financial audit

**Route:** `/admin/system/financial-audit`  
**Service:** `financialAudit.runFinancialHealthAudit()`

**Checks:** Compares Overview/Revenue/Collections surface totals vs `getGlobalFinancialAggregates()` from resident financial engine. Reports Δ paise per check.

## Bed audit

**Route:** `/admin/system/bed-audit`  
**Service:** `bedAudit.runBedAudit()`

**Checks:**
- `ghost_occupied` — `manual_occupied=true` but no active confirmed reservation today.
- `double_assignment` — 2+ confirmed reservations overlap today on same bed.
- `missing_assignment` — confirmed booking should occupy today but no active reservation covering today (excludes future move-in reservations).

**Repair:** `repairBedAuditIssue()` — clear manual marks, reconcile reservations (emergency only).

## Vacating audit

**Service:** `vacatingAudit.runVacatingAudit()` (part of health report)

**Checks:**
- Completed vacating but booking not completed.
- Completed vacating but reservation still active.
- Approved vacating date passed but booking still confirmed.
- Pending vacating on completed booking.
- Ghost `manual_occupied` after vacating.

## Notification audit

**Service:** `systemHealthAudit.runNotificationIntegrityAudit()`

**Checks:** Unread list length matches count; no stale generic overview hrefs.

## Health report (full)

**Route:** `/admin/system/health-report`  
**Service:** `systemHealthAudit.runSystemHealthAudit()`

| Section | PASS criteria |
|---------|---------------|
| Financial Integrity | Overview/Revenue/Collections match engine |
| Invoice Integrity | No overpaid invoices, partial states consistent |
| Occupancy Integrity | Zero bed audit issues |
| Notification Integrity | State machine consistent |
| Vacating Integrity | Zero vacating audit issues |
| SSOT Integrity | Financial + invoice checks pass |

**CLI:** `npx tsx scripts/run-production-health-audit.ts`

## Pricing health

**Route:** `/admin/system/pricing-health`  
**Service:** `pricingHealthAudit.runPricingHealthAudit()`

**Checks:** All duration mode self-checks, 10-day lowest-price (₹2890), deposit rules, line-item sum integrity.

**CLI:** `npx tsx scripts/run-pricing-health-audit.ts`

---

# PART 9 — KNOWN LIMITATIONS

## Production blockers (resolved in Phase 3.2–3.3)

- ~~Bed cancel without occupancy reconcile~~ — fixed in `cancelBooking()`.
- ~~Combined invoice cancel without cascade~~ — fixed in `cancelUnifiedInvoice()`.
- ~~Fixed stay not using lowest price~~ — fixed in `fixedStayOptimizer.ts`.
- ~~Missing `partial` invoice enum in DB~~ — migration `0050`.

## High-risk issues

| Issue | Detail |
|-------|--------|
| `allocateInvoicePayment()` not fully wired | Combined/custom invoice payments via payment link may not allocate to source lines automatically. Rent/elec/deposit have dedicated handlers. |
| Two badge loaders | `adminNavBadges.ts` vs `loadUnreadNavBadges()` — slight logic divergence on residents count. |
| `manualOccupied` legacy column | Still on `beds` table for emergency repair display; must not be used as operational SSOT. |

## Medium-risk issues

| Issue | Detail |
|-------|--------|
| Daily/weekly/monthly customer UI | Engine supports modes; customer UI only exposes `fixed_stay` and `open_ended`. `DateRangeBar.tsx` is dead code. |
| Extension flow | Partially deprecated in customer UI; backend `stay_extensions` still active. |
| Dev assistant API routes | `app/api/admin/dev-assistant/*` may still exist but feature removed from product. |

## Technical debt

- `financial_invoices` mirrors `rent_invoices`/`electricity_invoices` — dual write sync required.
- Some admin pages still load data outside engine (being migrated).
- Heavy cron coupling — notification sync depends on daily automation cron if pages not visited.

## Partially implemented

| Feature | Status |
|---------|--------|
| Combined invoice payment allocation | Engine + UI done; webhook wiring partial |
| Bed interest / waitlist | Interest registration only — no auto-notify queue |
| Deposit refund via resident request | Workflow exists; payout integration manual |
| Editable invoice amounts | By design: use custom charges/adjustments instead |

## Not implemented

- Generic promo codes (only DDMMYY date coupons).
- Automated waitlist → booking assignment.
- Customer push notifications / in-app notification center.
- Multi-PG cart booking.
- Native mobile apps.

---

# PART 10 — FUTURE ROADMAP

## Complete & stable

- PG inventory (beds, rooms, pricing, bed map).
- Customer booking flow (fixed stay + open-ended) with lowest-price engine.
- Payment (Razorpay + UPI QR proof).
- Monthly rent invoicing (cron).
- Electricity billing (meter → split → invoices).
- Deposit ledger (append-only).
- Vacating workflow (notice, penalty, refund).
- KYC review.
- Admin notification center (New/Seen/Resolved).
- Resident financial SSOT engine.
- Combined invoice generation (selective categories).
- Custom charges.
- System health audits (financial, bed, vacating, pricing).
- Visitor analytics dashboard.
- PS4 membership add-on.
- Pricing Center (admin rate adjustments with propagation).

## Still needs work

- Wire `allocateInvoicePayment()` to payment link webhooks for combined invoices.
- Remove or repurpose dead `DateRangeBar` / extension customer UI.
- Consolidate notification badge loaders.
- Production deploy: ensure migration `0050` applied, cron secrets set.
- E2E test suite for booking → pay → invoice → vacating golden path.

## What should never be changed

- **`bed_reservations` as occupancy SSOT** — GiST EXCLUDE constraint is race-proof.
- **`deposit_ledger` append-only** — never delete or mutate historical entries.
- **`pricing_snapshot` on booking** — frozen at checkout; changes via explicit admin actions only.
- **`residentFinancialEngine` as money SSOT** — all surfaces must read from it.
- **Half-open date ranges `[start, end)`** — matches Postgres `daterange` convention throughout.

## What could be rebuilt (low priority)

- `financial_invoices` unified layer — could merge into engine-native invoice model long-term.
- `action_items` + `admin_notifications` dual feed — could be single table with state.
- Customer date browse modes (daily/weekly/monthly) — UI rewrite if product wants them back.

---

## Appendix A — Key service index

| Service file | Responsibility |
|--------------|----------------|
| `booking.ts` | Create booking, cart, coupon |
| `bookingLifecycle.ts` | Payment success, cancel, refund, hold expiry |
| `pricing.ts` | Quote engine, deposit rules |
| `availability.ts` | Bed availability queries |
| `rentInvoices.ts` | Monthly rent generation + payment |
| `electricityBilling.ts` | Room bills + resident invoices |
| `deposits.ts` | Deposit ledger mutations |
| `depositCollection.ts` | Partial deposit, payment links, overdue |
| `vacating.ts` | Vacating submit/approve/complete |
| `residentFinancialEngine.ts` | **Financial SSOT** |
| `unifiedInvoices.ts` | Unified invoice CRUD, cancel, sync |
| `invoiceGeneration.ts` | Combined invoice from SSOT lines |
| `invoicePayment.ts` | Payment allocation / reversal |
| `customCharges.ts` | Admin custom charges |
| `paymentLinks.ts` | UPI link generation |
| `tenantAssignment.ts` | Admin bed assignment |
| `residentAdmin.ts` | Tenancy edits, reassignment |
| `occupancySync.ts` | Reservation reconciliation |
| `pgBedMap.ts` | Admin bed map data |
| `pgInventory.ts` | Room/bed/pricing CRUD |
| `pricingPropagation.ts` | Rate change → deposit + rent sync |
| `actionItems.ts` | Operator task queue |
| `adminNotifications.ts` | Admin inbox |
| `automationEngine.ts` | WhatsApp/email automations |
| `visitorAnalytics.ts` | Site analytics |
| `bedNoticeInterest.ts` | Bed interest registration |
| `playstationMembership.ts` | PS4 subscriptions |
| `bedAudit.ts` | Bed consistency audit |
| `financialAudit.ts` | Financial health audit |
| `systemHealthAudit.ts` | Full health report |
| `pricingHealthAudit.ts` | Pricing validation |

## Appendix B — Environment & deployment

- **Build:** `npm run build` (runs `db:migrate` on Vercel via `vercel-build`).
- **Crons:** `vercel.json` — 4 scheduled jobs.
- **Secrets:** `CRON_SECRET`, Razorpay keys, `DATABASE_URL`, Blob storage for proofs/KYC.
- **Health probe:** `GET /api/health` (public).

---

*End of Awesome PG Master Documentation v1.0*
