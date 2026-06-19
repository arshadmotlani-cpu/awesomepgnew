# Awesome PG — Customer-Facing Feature Inventory (Phase 0)

**Generated:** 2026-06-19  
**Scope:** Public website + customer/resident dashboard only. Admin panel excluded.  
**Purpose:** Mandatory audit before UX redesign. Reference for every page implementation in Phase 2.  
**Companion docs:** `awesome-pg-ux-redesign-spec.md`, `awesome-pg-cursor-implementation-prompt.md`

---

## 0. How to read this document

| Column / label | Meaning |
|----------------|---------|
| **Route** | Next.js App Router path |
| **Data source** | Service, query, or API — resolve to real file at implementation time |
| **Writes** | Server action or API that mutates data |
| **Tables** | PostgreSQL tables read/written (via Drizzle schema) |
| **DO NOT MODIFY** | Business logic / calculations — presentation layer only |
| **Gap vs spec** | Feature in UX spec but missing, partial, or different in codebase |

**Redesign rule:** Wrap existing data-fetching and mutations in new UI. Do not duplicate or re-implement business logic.

---

## 1. Architecture snapshot (current state)

### 1.1 Route groups

| Group | Path prefix | Layout | Auth |
|-------|-------------|--------|------|
| Marketing home | `/` | Own shell (`LandingPage`) | Public |
| Customer site | `app/(customer)/` | `SiteHeader`, `SiteFooter`, analytics | Mixed |
| Login | `/login` | Own shell | Public |
| Admin | `app/(admin)/` | **Out of scope** | Admin |

### 1.2 Account model (important for redesign)

There is **no separate `/resident` app** or `/dashboard` route. Customer account is unified:

| Concept in UX spec | Actual route / pattern |
|--------------------|-------------------------|
| Application Dashboard | `/account/profile` + `?section=identity` (KYC) + booking detail |
| Resident Hub | `/account/profile?section=resident` |
| Resident Home | `ResidentAreaSection` component (same URL) |
| Wallet / Payments | Embedded in `ResidentAreaSection` + dedicated pay sub-routes |
| KYC | `/account/profile?section=identity` (legacy `/account/kyc` redirects) |

**Navigation helper:** `src/lib/accountNavigation.ts` — `accountProfileHref('profile' | 'identity' | 'resident')`

### 1.3 Properties (PGs)

Properties are rows in `pgs` table (slug-based URLs). Spec names map to DB records:

| Spec name | Typical slug (from tests/scripts) | Notes |
|-----------|-------------------------------------|-------|
| Shantinagar PG | `shantinagar-awesome-pg` | Verify slug in prod DB |
| Central PG | `central-awesome-pg` | |
| Central PG Female | Clone / separate `pgs` row | `scripts/clone-pg.ts` |
| Trimurti Nagar PG | Name contains "Trimurti" | Verify slug in prod DB |

**Public PG data:** `listPublicPgs()`, `getPgBySlug()`, `listRoomsForPg()`, `getRoomDetail()` — `src/db/queries/customer.ts`

### 1.4 Live availability / occupancy (customer display)

| Display | Authoritative source | File |
|---------|---------------------|------|
| PG browse availability counts | Customer queries on beds + reservations | `src/db/queries/customer.ts` |
| Bed map states | `CustomerBedMap`, `getPgBedMap` patterns (admin SSOT: `occupancySsot.ts`) | `src/components/customer/CustomerBedMap.tsx` |
| Bed availability for dates | `GET /api/beds/[bedId]/availability` | `src/services/availability.ts` |

**DO NOT MODIFY:** Occupancy SSOT predicates in `src/lib/occupancySsot.ts`, reservation blocking in `src/lib/reservationBlocking.ts`.

---

## 2. Complete route inventory (27 customer page routes)

### 2.1 Public — marketing & browse

| Route | File | Purpose | Data sources | User actions | Key components |
|-------|------|---------|--------------|--------------|----------------|
| `/` | `app/page.tsx` | Marketing landing | Static | Navigate | `LandingPage`, `SiteHeader`, `SiteFooter` |
| `/pgs` | `app/(customer)/pgs/page.tsx` | PG list + search | `listPublicPgs()` | Browse, optional payment modal | `PgBrowseList`, `PgCard` |
| `/pgs/[pgSlug]` | `app/(customer)/pgs/[pgSlug]/page.tsx` | PG detail + bed map | `getPgBySlug`, `listRoomsForPg` | Select bed → room flow | `CustomerBedMap`, `PgImageGallery`, `AmenityList` |
| `/pgs/[pgSlug]/rooms/[roomId]` | `app/(customer)/pgs/.../rooms/[roomId]/page.tsx` | Room + bed picker | `getRoomDetail`, `getRoomActivityStats` | Date/bed select | `BedSelector`, `RoomDetailInsights` |
| `/guide` | `app/(customer)/guide/page.tsx` | How-to guides | Static guides lib | Tab switch | `CustomerGuideTabs` |

**Gap vs spec:** No `/compare`, `/about`, `/enquiry`, dedicated Reviews/Nearby/Floor Explorer routes. Floor/room/bed exploration is partial via PG detail + room detail + bed map.

### 2.2 Authentication

| Route | File | Purpose | API endpoints |
|-------|------|---------|---------------|
| `/login` | `app/login/page.tsx` | Sign in / OTP signup | `POST /api/auth/customer/login`, `/email/send`, `/email/verify`, `/forgot-password` |
| `/account/set-password` | `app/(customer)/account/set-password/page.tsx` | First-time password | `POST /api/auth/customer/set-password` |
| `/account/change-password` | `app/(customer)/account/change-password/page.tsx` | Change password | `POST /api/auth/customer/change-password` |

**Guards:** `requireCustomerSession()` — `src/lib/auth/guards.ts`  
**Tables:** `customers`, `auth_sessions`

### 2.3 Booking & reserve flow

| Route | File | Purpose | Data / services | Server actions |
|-------|------|---------|-----------------|----------------|
| `/booking/new` | `app/(customer)/booking/new/page.tsx` | Cart + create booking | `getBedsForCart`, `quoteBookingPrice`, `getCustomerDepositCredit` | `createBookingAction`, `previewDateCouponAction` |
| `/reserve/new` | `app/(customer)/reserve/new/page.tsx` | 50% bed reserve | `quoteBedReserve`, `getBedsForCart` | `createBedReserveAction` |
| `/booking/[bookingCode]` | `app/(customer)/booking/[bookingCode]/page.tsx` | Booking status | `getBookingByCode`, KYC, briefing | `cancelBookingAction` |
| `/booking/[bookingCode]/pay` | `.../pay/page.tsx` | Checkout payment | Booking + payment categories + QR | Client → `/api/payment-record/booking` |
| `/booking/[bookingCode]/payment-success` | `.../payment-success/page.tsx` | Post-payment poll | `getPaymentForCustomer` | Poll `/api/payments/razorpay/status` |
| `/booking/.../extend` | `.../extend/page.tsx` | **Redirect only** | — | Redirect to booking detail |
| `/booking/.../extend/[id]/pay` | `.../extend/[id]/pay/page.tsx` | Extension payment | `getExtensionDetail` | `cancelPendingExtensionAction` |

**Query params (multi-step flow, not separate routes):**

- `/booking/new?bed=&start=&end=&mode=` — bed selection carried via URL
- `/reserve/new?bed=&start=&checkIn=`

**Gap vs spec:** Spec describes 5 named steps (Choose PG → Room → Bed → Preview → Confirm). Current flow is **query-param driven** across PG detail → room → `/booking/new`, not a dedicated stepper route tree.

**DO NOT MODIFY:** `src/services/booking.ts`, `src/services/pricing.ts`, `src/services/bookingLifecycle.ts`, `src/lib/billing/partialDepositCheckout.ts`

### 2.4 Payment links

| Route | File | Purpose | Actions |
|-------|------|---------|---------|
| `/pay/[linkId]` | `app/(customer)/pay/[linkId]/page.tsx` | Admin-issued pay link | `submitPaymentLinkProofAction` |

**Tables:** `payment_links`, `pgs`, `bookings`  
**Services:** `src/services/paymentLinks.ts`, `src/services/residentCharges.ts`

### 2.5 Account hub

| Route | File | Purpose | Notes |
|-------|------|---------|-------|
| `/account/profile` | `app/(customer)/account/profile/page.tsx` | **Main hub** | `?section=profile\|identity\|resident` |
| `/account/bookings` | `app/(customer)/account/bookings/page.tsx` | All bookings list | `listBookingsForCustomer` |
| `/account/kyc` | `.../kyc/page.tsx` | Redirect | → `?section=identity` |
| `/account/resident` | `.../resident/page.tsx` | Redirect | → `?section=resident` |
| `/account/payments/[id]/receipt` | `.../receipt/page.tsx` | Payment receipt | Read-only |

**Missing route:** `/account` index (some redirects target `/account?error=...` with no page).

---

## 3. Resident sub-routes (auth required)

| Route | File | Purpose | Proof API |
|-------|------|---------|-----------|
| `/account/resident/pay-rent/[invoiceId]` | `pay-rent/[invoiceId]/page.tsx` | Pay rent | `POST /api/rent-invoice/[id]/payment-proof` |
| `/account/resident/pay-electricity/[invoiceId]` | `pay-electricity/[invoiceId]/page.tsx` | Pay electricity | `POST /api/electricity-invoice/[id]/payment-proof` |
| `/account/resident/pay-ps4/[membershipId]` | `pay-ps4/[membershipId]/page.tsx` | PS4 membership | `POST /api/playstation/membership/[id]/payment-proof` |
| `/account/resident/ps4/new` | `ps4/new/page.tsx` | Subscribe PS4 | `subscribePs4Action` |
| `/account/resident/history/[bookingId]` | `history/[bookingId]/page.tsx` | Payment history | Read-only |
| `/account/resident/request-vacating/[bookingId]` | `request-vacating/[bookingId]/page.tsx` | Vacating notice | `submitVacatingAction` |

**Gap vs spec:** PS4 add-on exists but is not in UX spec. Spec "Payments → Invoices view/download" is partial (receipt page exists; no unified invoice PDF hub).

---

## 4. Customer API routes (by domain)

### 4.1 Auth

| Method | Path | Role |
|--------|------|------|
| POST | `/api/auth/customer/login` | Email/password login |
| POST | `/api/auth/customer/set-password` | First password |
| POST | `/api/auth/customer/change-password` | Change password |
| POST | `/api/auth/customer/email/send` | OTP send |
| POST | `/api/auth/customer/email/verify` | OTP verify |
| POST | `/api/auth/customer/forgot-password` | Reset password |
| POST | `/api/auth/logout` | Sign out |

### 4.2 Beds & booking

| Method | Path | Role |
|--------|------|------|
| GET | `/api/beds/[bedId]/availability` | Date availability |
| POST | `/api/beds/[bedId]/interest` | Express interest |
| GET | `/api/beds/[bedId]/reserve-quote` | Reserve fee quote |
| POST | `/api/payment-record/booking` | Booking checkout record |
| GET | `/api/payments/razorpay/status` | Payment poll |

### 4.3 Resident billing proofs

| Method | Path | Service |
|--------|------|---------|
| POST | `/api/rent-invoice/[id]/payment-proof` | `submitRentPaymentProof` |
| POST | `/api/electricity-invoice/[id]/payment-proof` | `submitElectricityPaymentProof` |
| POST | `/api/stay-extension/[id]/payment-proof` | Extension proof |
| POST | `/api/playstation/membership/[id]/payment-proof` | PS4 proof |

### 4.4 KYC & misc

| Method | Path | Role |
|--------|------|------|
| GET | `/api/kyc/documents/[submissionId]/[kind]` | View KYC doc (owner/admin) |
| GET | `/api/pg/[id]/payment-categories` | PG UPI QR categories |
| GET/POST | `/api/analytics/*` | Visitor analytics |

---

## 5. Server actions (customer-facing)

| File | Actions | Guard |
|------|---------|-------|
| `app/(customer)/booking/new/actions.ts` | `createBookingAction` | Session + bed/cart validation |
| `app/(customer)/booking/new/couponActions.ts` | `previewDateCouponAction` | Session |
| `app/(customer)/booking/[bookingCode]/actions.ts` | `cancelBookingAction` | `requireCustomerOwnsBookingCode` |
| `app/(customer)/reserve/new/actions.ts` | `createBedReserveAction` | Session |
| `app/(customer)/account/profile/actions.ts` | `updateProfileAction` | Session |
| `app/(customer)/account/kyc/actions.ts` | `submitKycAction` | Session + profile complete |
| `app/(customer)/account/resident/actions.ts` | `submitVacatingAction`, `cancelVacatingAction` | Owns booking |
| `app/(customer)/account/resident/request-actions.ts` | Deposit refund, meter/QR upload, stay extension | Session |
| `app/(customer)/account/resident/deposit-actions.ts` | `submitDepositDueExtensionRequestAction` | Session |
| `app/(customer)/account/resident/ps4/new/actions.ts` | `subscribePs4Action` | Active tenant |
| `app/(customer)/pay/actions.ts` | Payment link proof | Link ownership |

**Gap vs spec:** `submitStayExtensionRequestAction` exists but **has no UI wired**.

---

## 6. Permission & session model (customer)

| Check | File | Behavior |
|-------|------|----------|
| Session required | `requireCustomerSession(next?, opts?)` | Redirect `/login` or `/account/set-password` |
| Owns booking | `requireCustomerOwnsBooking(session, bookingId)` | Throws if mismatch |
| Owns booking code | `requireCustomerOwnsBookingCode(session, code)` | Throws if mismatch |
| Resident section gate | `customerHasConfirmedBooking()` | Hides resident area if no confirmed booking |
| Active tenant (PS4) | `isActiveTenant()` | PS4 subscribe guard |
| Profile complete | `isProfileComplete()`, `canCheckIn()` | KYC/booking gates |

**DO NOT MODIFY:** `src/lib/auth/guards.ts`, `src/lib/auth/session.ts`, role logic.

---

## 7. Database tables — customer-facing flows

### 7.1 Core inventory & booking

| Table | Schema file | Customer use |
|-------|-------------|--------------|
| `pgs`, `floors`, `rooms`, `beds`, `bed_prices` | `pgs.ts`, `beds.ts`, etc. | Browse, pricing, bed map |
| `bookings` | `bookings.ts` | Booking detail, deposit fields, pricing snapshot |
| `bed_reservations` | `bedReservations.ts` | Occupancy / stay range |
| `bed_reserve_holds` | `bedReserveHolds.ts` | Reserve-with-payment flow |
| `stay_extensions` | `stayExtensions.ts` | Extension pay (legacy path) |
| `customers` | `customers.ts` | Profile, KYC status, residency |

### 7.2 KYC

| Table | Customer use |
|-------|--------------|
| `kyc_submissions` | Upload + status |
| `customers.kyc_status` | Profile-level status |

### 7.3 Deposits & wallet

| Table | Customer use |
|-------|--------------|
| `deposit_ledger` | Wallet balance SSOT |
| `deposit_settlements` | Refund settlement records |
| `bookings.deposit_*` | Required/due/status caches |
| `payment_links` | Deposit due payment links |
| `financial_invoices` | Unified invoice mirror |

### 7.4 Rent & electricity

| Table | Customer use |
|-------|--------------|
| `rent_invoices` | Monthly rent |
| `electricity_invoices`, `electricity_bills` | Room electricity share |
| `resident_billing_profiles` | Billing metadata |
| `meter_logs` | Check-in meter guidance |
| `payments` | All payment records |

### 7.5 Vacating & checkout

| Table | Customer use |
|-------|--------------|
| `vacating_requests` | Notice submission |
| `checkout_settlements` | Unified checkout (admin-driven; customer submits refund details) |
| `resident_requests` | Deposit refund / extension requests |

### 7.6 Other

| Table | Customer use |
|-------|--------------|
| `playstation_memberships` | PS4 add-on |
| `email_delivery_log` | Email notifications (backend) |
| `auth_sessions` | Sessions |

**Admin-only (customer reads indirect):** `admin_notifications`, `action_items` — not customer UI.

---

## 8. State machines (DO NOT MODIFY transitions)

### 8.1 KYC

```
submitKyc → kyc_submissions.status = pending, customers.kyc_status = pending
Admin review → approved | rejected (updates customers.kyc_status)
Re-submit allowed after rejected
```

**Enums:** `kyc_status`, `kyc_submission_status` — `pending | approved | rejected`  
**Services:** `src/services/kyc.ts`, `src/services/kycEligibility.ts`

### 8.2 Booking

**Enum:** `booking_status` — includes `pending_payment`, `confirmed`, `completed`, `cancelled`, etc.  
**Service:** `src/services/bookingLifecycle.ts` (payment success, cancel, holds)

### 8.3 Deposit wallet lifecycle

```
collected (+) → held in ledger
deducted (-)  → checkout/vacating/admin deductions
refunded (-)  → settlement payout
refundable    = sum(deposit_ledger.amount_paise)
```

**Enums:** `deposit_entry_kind`: `collected | deducted | refunded`  
**Enums:** `deposit_collection_status`: `pending | full | partial | overdue | waived`  
**Services:** `deposits.ts`, `depositSettlement.ts`, `depositCollection.ts`, `depositCredit.ts`

### 8.4 Vacating & checkout

**Vacating:** `pending → approved → completed` (also `rejected`; customer can cancel pending)  
**Checkout settlement:** `awaiting_resident_details → awaiting_admin_review → refund_pending → refund_paid → completed` (+ `archived`)  
**Resident requests:** `submitted → under_review → approved | rejected → completed`

**Customer paths:**

1. `submitVacatingRequest` → `vacating_requests`
2. `submitDepositRefundRequestAction` → `resident_requests` + optionally `checkout_settlements`
3. Admin completes → ledger + invoice cancellation (customer sees status in UI)

**DO NOT MODIFY:** `src/services/vacating.ts`, `src/services/checkoutSettlement.ts`, `src/services/billing.ts` (notice/penalty)

### 8.5 Rent / electricity invoices

**Rent:** `rent_invoice_status` — `pending | payment_in_progress | paid | overdue | expired | cancelled`  
**Electricity:** `electricity_invoice_status` — `pending | paid | cancelled` (overdue computed in projection)

---

## 9. Financial calculations (DO NOT MODIFY)

| Domain | Files |
|--------|-------|
| Pricing / deposit at quote | `src/services/pricing.ts` |
| Booking payment split | `src/services/depositCollection.ts` — `breakdownBookingPayment`, `splitBookingPayment` |
| Partial deposit checkout | `src/lib/billing/partialDepositCheckout.ts` |
| Rent late fees / proration | `src/services/billing.ts` |
| Rent invoice projection | `src/services/rentInvoices.ts` — `projectInvoice()` |
| Electricity split / late fee | `src/services/billing.ts`, `electricityBilling.ts` |
| Deposit credit at rebooking | `src/services/depositCredit.ts` |
| Refund deductions | `src/lib/refundDeductions.ts` |
| Checkout electricity | `src/lib/checkout/electricitySettlementCalc.ts` |
| Resident financial SSOT (display) | `src/services/residentFinancialEngine.ts` |
| Money display | `src/lib/format.ts` — `paiseToInr`, `asPlainNumber` |
| Invoice state machine | `src/lib/billing/invoiceStateMachine.ts` |

---

## 10. Integrations (customer-touching)

| Integration | Customer touchpoint | Files |
|-------------|---------------------|-------|
| **Razorpay** | Booking pay + poll | `src/services/payments.ts`, `/api/webhooks/razorpay`, `/api/payments/razorpay/*` |
| **UPI QR + screenshot proof** | Rent, electricity, booking, payment links | `*PaymentProofForm.tsx`, proof API routes |
| **Email (Resend/SMTP)** | Booking confirm, payment receipt, rent/electricity reminders, vacating updates | `src/lib/email/notifications.ts` |
| **WhatsApp** | Admin-shared payment link URLs (not push inbox) | `src/lib/billing/adminWhatsApp.ts`, `invoiceWhatsApp.ts` |
| **Blob/KYC storage** | KYC uploads, payment screenshots | `src/lib/kyc/storage.ts`, blob upload helpers |
| **Visitor analytics** | Page views, events | `src/services/visitorAnalytics.ts`, `/api/analytics/*` |
| **CockroachAI / Roachie** | Guided tour, resident briefing (proto concierge) | `src/components/cockroach/*`, `RoachieResidentBriefing` |

**Gap vs spec:** No dedicated AI Concierge chat product. Roachie/CockroachAI is partial (tours + briefings, not full Q&A wallet/rent bot).

---

## 11. Component map (existing → spec mapping)

| UX spec component | Existing component(s) | Route |
|-------------------|----------------------|-------|
| Hero / Home | `LandingPage` | `/` |
| PGCard / PG showcase | `PgCard`, `PgBrowseList` | `/pgs` |
| BedMapGrid | `CustomerBedMap` | PG detail |
| BedPicker | `BedSelector`, `BedBookingPanel` | Room detail |
| BookingStepper | `CheckoutProgressStepper`, `BookingCartForm` | `/booking/new`, pay |
| StatusTrackerVertical | **Partial** — KYC pills, booking status, no unified tracker | profile / booking |
| WalletBalanceHero | `DepositWalletSection`, `ResidentFinancialSummaryPanel` | `?section=resident` |
| PayRentCTA | Links in `ResidentAreaSection` | → pay-rent |
| PayElectricityCTA | Links in `ResidentAreaSection` | → pay-electricity |
| VacatingJourneyTimeline | **Partial** — `VacatingRequestForm`, `DepositRefundNotice` | request-vacating + resident |
| RequestTypeTile (×10) | **Only 3 DB types** — refund, due extension, stay extension (1 unwired) | `ResidentRequestForms` |
| Referrals | **Not implemented** | — |
| NotificationCenter | **Not implemented** (email only) | — |
| AI Concierge | **Partial** — `CockroachAI`, `RoachieResidentBriefing` | layout + resident |

Full component directory: `src/components/customer/` (65 files), `src/components/customer/account/`, `src/components/customer/checkout/`, `src/components/customer/marketing/`

---

## 12. Interlinking graph (must preserve)

```
Public browse
  /pgs → /pgs/[slug] → /pgs/[slug]/rooms/[id] → /booking/new → /booking/[code]/pay
                                                      ↓
Account /profile?section=identity (KYC)
                                                      ↓
/booking/[code] (confirmed) → /account/profile?section=resident
                                                      ↓
        ┌─────────────────────────────────────────────┼──────────────────────────┐
        ↓                     ↓                       ↓                          ↓
 pay-rent/[id]      pay-electricity/[id]    request-vacating/[id]        /pay/[linkId]
        ↓                     ↓                       ↓                          ↓
   rent_invoices      electricity_invoices    vacating_requests          payment_links
        └─────────────────────┴───────────────────────┴──────────────────────────┘
                                      ↓
                            deposit_ledger (wallet SSOT)
                                      ↓
                         checkout_settlements / deposit_settlements
                                      ↓
                              resident_requests (refund)
```

**Rules for redesign:**

- Same numbers everywhere (wallet, invoices, deposit due) — single fetch per page, pass props down.
- Do not introduce a second wallet calculation in client components.
- Pay sub-routes must continue to accept same invoice/membership IDs.
- Vacating + refund forms must still call same server actions.

---

## 13. Gap analysis — UX spec vs codebase

| Spec feature | Status | Notes |
|--------------|--------|-------|
| 5-step booking routes | **Partial** | Same flow via PG → room → `/booking/new` + pay; add stepper UI only |
| Compare PGs | **Missing** | Build new presentation; data from `listPublicPgs()` |
| Favorites | **Missing** | Would need new backend — **flag before building** |
| Enquiry / Schedule visit | **Missing** | Would need new backend — **flag** |
| Reviews / Nearby | **Missing** | No tables found — **flag** |
| Floor Explorer (dedicated) | **Partial** | Room list on PG page |
| Application Dashboard (dedicated) | **Partial** | Profile + KYC + booking pages |
| Resident Hub (separate app) | **Partial** | Single URL `?section=resident`; redesign can add `/resident/*` aliases as redirects |
| Wallet (dedicated route) | **Partial** | Section in profile; can add `/account/wallet` → redirect |
| Requests Center (10 types) | **Missing / partial** | Only 3 `resident_request_type` values; maintenance/complaint/etc. not in schema |
| Referrals | **Missing** | No code |
| Notification Center (in-app) | **Missing** | Email only |
| AI Concierge (full chat) | **Partial** | Roachie/CockroachAI |
| Mobile bottom nav | **Missing** | Desktop header nav today |
| Move-in unlock moment | **Missing** | Design-only; trigger when `customerHasConfirmedBooking` + deposit paid |

---

## 14. Page-by-page pre-implementation checklist (template)

For each page in Phase 2, complete before coding:

- [ ] Route confirmed in Section 2
- [ ] Data sources listed in Sections 4–7
- [ ] Server actions / APIs unchanged
- [ ] Tables documented
- [ ] DO NOT MODIFY calc files identified
- [ ] Dependent pages / links listed
- [ ] Gap vs spec noted (build UI-only vs flag backend need)
- [ ] Mobile layout + reduced-motion plan
- [ ] Analytics hooks preserved (`trackAnalyticsEvent`, visitor tracker)

---

## 15. Phase 0 sign-off

| Item | Status |
|------|--------|
| All customer routes enumerated | ✅ 27 page routes + API routes |
| Tables touched by customer flows | ✅ Section 7 |
| Server actions / APIs mapped | ✅ Sections 4–5 |
| Permission checks documented | ✅ Section 6 |
| Financial calculations listed (no modify) | ✅ Section 9 |
| KYC state machine | ✅ Section 8.1 |
| Wallet / deposit lifecycle | ✅ Section 8.3 |
| Vacating / checkout flow | ✅ Section 8.4 |
| Integrations | ✅ Section 10 |
| Spec gaps documented | ✅ Section 13 |
| Interlinking preserved | ✅ Section 12 |

**Next step (Phase 1):** Design tokens + shared primitives per `awesome-pg-ux-redesign-spec.md` Sections 3–6. **Do not start page rebuilds until Phase 1 primitives exist.**

---

## Appendix A — Key file index

| Area | Path |
|------|------|
| Customer queries | `src/db/queries/customer.ts` |
| Account navigation | `src/lib/accountNavigation.ts` |
| Auth guards | `src/lib/auth/guards.ts` |
| Resident hub UI | `src/components/customer/account/ResidentAreaSection.tsx` |
| Deposit wallet UI | `src/components/customer/account/DepositWalletSection.tsx` |
| Financial summary UI | `src/components/customer/account/ResidentFinancialSummaryPanel.tsx` |
| Enum registry | `src/db/schema/enums.ts` |
| Schema index | `src/db/schema/index.ts` |
| Customer layout | `app/(customer)/layout.tsx` |
