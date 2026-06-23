# H10 Regression Audit Report

**Audited commit:** `2363695` (H10 Resident consistency pass)  
**Verified on:** current `main` (build passes; no import errors from H10 deletions)  
**Method:** Static route/navigation/import audit — no code changes, no browser session testing  
**Date:** 13 June 2026

---

## Executive summary

H10 did **not** introduce broken imports, redirect loops, or references to deleted components. Production build succeeds. All primary resident routes exist and resolve.

Findings are mostly **navigation gaps** (some pre-existing, some introduced by consolidating UI) and **intentional removals** documented in `docs/h10-resident-consistency.md`. No routes are dead; a few surfaces are harder to reach than before or only reachable via direct URL / external link.

| Category | Count |
|----------|-------|
| WORKING | 12 areas (core paths intact) |
| MISSING NAVIGATION | 5 items |
| REMOVED INTENTIONALLY | 20+ components + duplicate payments tables |
| BROKEN | 0 (build/import/route existence) |

---

## Audit checklist (global)

| Check | Result |
|-------|--------|
| Routes still exist | ✓ All audited `app/(customer)/…` routes present |
| Navigation paths exist | ✓ See per-area notes; 5 gaps below |
| Removed H10 components still referenced | ✓ **None** — grep across repo returns 0 matches |
| Redirect loops | ✓ **None found** (see Redirect analysis) |
| Reachable from UI nav (confirmed resident) | ✓ Hub tabs + sub-routes; gaps noted for settings, receipts, shared invoices |

### Redirect analysis

| Path | Behavior | Loop? |
|------|----------|-------|
| `/account/resident` | → `/account/profile?section=resident&tab=home` | No |
| `/account/wallet` | → `?section=resident&tab=wallet` | No |
| `/account/payments` | → `?section=resident&tab=payments` | No |
| `/account/profile` (confirmed resident) | → `?section=resident&tab=home` | No |
| `/account/profile?section=profile&settings=1` | Renders `SimpleAccountHub` (settings) | No |
| `/profile` | → `/account/profile` | No |
| `/account/kyc` | → `/account/profile?section=identity` | No |
| `/account/resident/invoices/[id]` | → `/resident/invoices/[id]` | No (single hop) |
| `/account/resident/pay-ps4/[id]?action=renew` | → same path without query | No |

**Non-resident edge case (not a loop):** Logged-in users **without** a confirmed booking who open `/account/resident` or alias redirects land on `?section=resident&tab=home` but `profile/page.tsx` does **not** render the hub (requires `hasConfirmedBooking`). They see `SimpleAccountHub` instead while the URL still says `section=resident`.

---

## 1. Booking flow

### Routes

| Route | Exists | Component |
|-------|--------|-----------|
| `/booking/new` | ✓ | `BookingFunnelShell`, `BookingCartForm`, inline auth |
| `/booking/[bookingCode]` | ✓ | Application dashboard / booking detail |
| `/booking/[bookingCode]/pay` | ✓ | `BookingCheckoutExperience` |
| `/booking/[bookingCode]/payment-success` | ✓ | Post-payment confirmation |
| `/booking/[bookingCode]/extend` | ✓ | Redirects with `extend_removed=1` (legacy) |
| `/booking/[bookingCode]/extend/[extensionId]/pay` | ✓ | Extension pay |

### Navigation paths

- **Browse** → PG/bed → `/booking/new` → pay → payment-success → `/booking/[code]`
- **Site header → Bookings** → `/account/bookings` → row → `/booking/[code]`
- **Booking dashboard** → Pay now / identity / Open resident home (`ApplicationBookingPrimaryActions`)

### Status: **WORKING**

H10 did not modify booking funnel (explicitly out of scope). Booking pages import H10-adjacent components (`ApplicationBookingPrimaryActions`, `AwaitingBookingApprovalPanel`) — all present.

---

## 2. Application dashboard

### Routes

| Route | Exists | Notes |
|-------|--------|-------|
| `/account/bookings` | ✓ | `ApplicationBookingsList`, status tracker |
| `/booking/[bookingCode]` | ✓ | Per-booking application dashboard |

### Navigation paths

- Site header **Bookings**
- Booking primary actions → **All bookings**
- Confirmed residents: **Open resident home →** (`residentTabHref('home')`)

### Status: **WORKING**

---

## 3. Resident Home

### Route / entry

| Entry | Resolves to |
|-------|-------------|
| Site header **My stay** | `/account/resident` → `?section=resident&tab=home` |
| Hub tab **Home** | Same |
| Legacy `?tab=stay` | Mapped to `home` in `profile/page.tsx` |

### Component

`ResidentHomePanel` inside `ResidentHubShell` via `ResidentAreaSection`.

### Navigation paths

- Desktop: 9 pill tabs (`RESIDENT_DESKTOP_NAV`)
- Mobile: bottom nav **Home** + secondary strip for other tabs
- Home CTAs via `deriveResidentHomePrimaryAction` (pay, KYC, requests, vacating)

### Status: **WORKING** (confirmed residents)

**MISSING NAVIGATION (pre-residents):** **My stay** header link is shown to all logged-in users, but non-confirmed users do not get the hub UI (see Redirect analysis).

---

## 4. Wallet

### Route

| Route | Tab |
|-------|-----|
| `/account/wallet` (alias) | `?section=resident&tab=wallet` |
| Hub **Wallet** tab | Same |

### Component

`ResidentWalletView` — balance, ledger sections, primary pay CTA, **Payment history →** link.

### Sub-route

| Route | Exists | Back link |
|-------|--------|-----------|
| `/account/resident/history/[bookingId]` | ✓ | ← Back to wallet |

### Status: **WORKING**

---

## 5. Payments

### Route

| Route | Tab |
|-------|-----|
| `/account/payments` (alias) | `?section=resident&tab=payments` |
| Hub **Payments** tab (desktop + mobile bottom nav) | Same |

### Component

`ResidentPaymentsHub` — pay-first card, due bills, paid history, links to pay sub-routes.

### Sub-routes

| Route | Exists | Back link |
|-------|--------|-----------|
| `/account/resident/pay-rent/[invoiceId]` | ✓ | ← Back to payments |
| `/account/resident/pay-electricity/[invoiceId]` | ✓ | ← Back to payments |

### Status: **WORKING**

Pay links are wired from `homeUpcoming` / `paymentBillRows` (same data path as before, minus duplicate tables).

---

## 6. Requests

### Route

`?section=resident&tab=requests`

### Component

`RequestsHome` — list, detail, make flow (`RequestsMakeFlow`, category query params).

### Navigation paths

- Mobile bottom nav **Requests**
- Desktop pill **Requests**
- Home → active requests strip → requests tab
- Deep link: `?tab=requests&make=1&category=…`

### Status: **WORKING**

---

## 7. Vacating

### Route

`?section=resident&tab=vacating`

### Sub-route

| Route | Exists |
|-------|--------|
| `/account/resident/request-vacating/[bookingId]` | ✓ |

### Navigation paths

- Desktop pill **Vacating**
- Mobile **secondary strip → Vacating**
- `VacatingHome` → **Start / continue move-out**
- Booking page → `BookingRequestVacateSection`

### Status: **WORKING**

---

## 8. Notifications

### Route

`?section=resident&tab=notifications`

### Component

`NotificationCenterPanel`

### Navigation paths

- Desktop pill **Notifications**
- Mobile secondary strip **Notifications**
- Not in bottom nav (by H10 design — secondary strip)

### Status: **WORKING**

---

## 9. Referrals

### Route

`?section=resident&tab=referrals`

### Component

`ReferralsPanel` (in-tab; no separate page)

### Navigation paths

- Desktop pill **Referrals**
- Mobile secondary strip **Referrals**

### Status: **WORKING**

---

## 10. Concierge

### Route

`?section=resident&tab=concierge`

### Component

`ResidentConciergeChat` (requires `conciergeContext` from primary booking)

### Navigation paths

- Desktop pill **Concierge**
- Mobile bottom nav **Concierge**

### Status: **WORKING**

**Note:** If no primary booking / context, tab renders empty content inside shell (nav still works). Edge case for data, not H10 routing.

---

## 11. Shared invoices

### Routes

| Route | Exists | Behavior |
|-------|--------|----------|
| `/resident/invoices/[ref]` | ✓ | Canonical share URL — `ResidentInvoiceDetailView` |
| `/account/resident/invoices/[invoiceId]` | ✓ | Alias → permanent share path |

### Navigation paths

| Path | Reachable from hub? |
|------|---------------------|
| WhatsApp / email deep link | ✓ External |
| `/account/profile?section=profile&settings=1` → **Invoices** tab (`SimpleAccountHub`) | ✓ Settings only |
| Resident hub Payments / Wallet | ✗ No invoice detail links in hub components |

### Status: **WORKING** (routes + auth + redirect chain)

### MISSING NAVIGATION

Confirmed residents on the **unified hub** have no in-app link to open shared invoice documents (`detailHref` is populated in `residentAccountContext` but not used in hub UI). Access relies on shared links or account settings (`?settings=1`).

---

## 12. Payment receipts

### Route

| Route | Exists |
|-------|--------|
| `/account/payments/[paymentId]/receipt` | ✓ |

### Navigation paths

| Path | Works? |
|------|--------|
| Post-Razorpay verify redirect (`paymentVerification.ts`) | ✓ |
| Hub Payments paid history | ✗ Rows are not linked to receipt |
| Wallet / history ledger | ✗ No receipt href (pay-review hrefs only) |
| Receipt page footer | ✓ View booking, All my bookings |

### Status: **WORKING** (route + post-payment redirect)

### MISSING NAVIGATION

No in-hub UI link from paid history or wallet ledger to `/account/payments/[id]/receipt`. Residents can only reach receipts via payment-completion redirect or direct URL. **Not introduced by H10** (no receipt links in removed tables either).

---

## Removed components — reference check

H10 deleted these; **zero imports remain** in the codebase:

| Removed | Was |
|---------|-----|
| `AccountSectionNav` | Legacy nav |
| `ConciergePanel` | Replaced by `ResidentConciergeChat` in tab |
| `RequestsCenter` | Replaced by `RequestsHome` |
| `ProfileModule`, `BillingOverviewModule`, `ResidentToolsModule`, `InvoiceListModule`, `ResidencyJourneyModule`, `DepositRefundModule` | v2 dead modules |
| `AccountModuleNav`, `AccountHeaderBar` | v2 chrome |
| `ResidentWalletPanel` | Replaced by `ResidentWalletView` |
| `ResidentHomeSummary`, `ResidentHomePrimaryActions` | Merged into `ResidentHomePanel` |
| `ResidentPaymentsNextBill` | Merged into `ResidentPaymentsHub` |
| `ResidentFinancialSummaryPanel` | Data now in home/wallet panels |
| `DepositWalletSection` | Wallet tab |
| `ResidentRequestForms` | `RequestsHome` flows |
| `VacatingJourneyTimeline` | `VacatingHome` |
| `ResidentUnlockCelebration` | Unused |

### REMOVED INTENTIONALLY (live UI)

- **Duplicate full rent/electricity invoice tables** under Payments tab in `ResidentAreaSection` (~250 lines). Replaced by single `ResidentPaymentsHub` surface. Pay → links for **unpaid** bills preserved via hub; granular per-invoice **table browse** removed.

---

## MISSING NAVIGATION (summary)

| # | Issue | Severity | H10-related? |
|---|-------|----------|----------------|
| 1 | **Account settings** on mobile: `ResidentPageHeader` (Bookings / Settings) is `hidden md:block` — no hub link to `?section=profile&settings=1` on small screens | Medium | Yes (H10 layout) |
| 2 | **My stay** header for non-confirmed users → URL says resident section but shows `SimpleAccountHub` | Low | Yes (redirect rules) |
| 3 | **Shared invoices** — no hub link to `/resident/invoices/[ref]` | Medium | Partial (hub consolidation; settings path still works) |
| 4 | **Payment receipts** — no hub link to receipt page | Low | No (pre-existing) |
| 5 | **Invoices tab** (`SimpleAccountHub`) only on settings URL, not in unified hub | Low | By design |

---

## WORKING (summary)

All twelve audited areas have **valid routes**, **working redirect aliases**, and **tab/sub-route navigation** for confirmed monthly residents:

1. Booking flow (H9 funnel untouched)
2. Application dashboard (`/account/bookings`, `/booking/[code]`)
3. Resident Home (`tab=home`, My stay entry)
4. Wallet (+ history sub-page)
5. Payments (+ pay-rent / pay-electricity)
6. Requests (+ make/detail query flows)
7. Vacating (+ request-vacating form)
8. Notifications
9. Referrals
10. Concierge
11. Shared invoices (route + middleware auth; external/settings access)
12. Payment receipts (route + payment-verify redirect)

---

## BROKEN

**None identified** in static audit:

- `npm run build` passes on current `main`
- No dangling imports to deleted H10 files
- No redirect loops in account/resident alias chain
- SSOT navigation metadata in `src/lib/residentNavigation.ts` matches `ResidentHubShell` and `accountNavigation.ts`

---

## Recommended follow-ups (audit only — not implemented)

1. Add mobile **Settings** entry in hub (footer or secondary strip) pointing to `residentAccountSettingsHref()`.
2. Gate **My stay** header link on `hasConfirmedBooking`, or show applicant-appropriate dashboard.
3. Surface **invoice detail** links in Payments or Wallet paid history (`detailHref` already computed in `residentAccountContext`).
4. Link paid history rows to **`/account/payments/[id]/receipt`** where `paymentId` is available.

---

## Files reviewed (key)

- `app/(customer)/account/profile/page.tsx` — routing / redirects
- `app/(customer)/account/resident/page.tsx` — alias redirect
- `src/components/customer/account/ResidentAreaSection.tsx` — tab panels
- `src/components/customer/account/ResidentHubShell.tsx` — nav SSOT wiring
- `src/lib/residentNavigation.ts`, `src/lib/accountNavigation.ts`
- `src/components/customer/SiteHeader.tsx`
- H10 commit diff `2363695` for intentional removals
