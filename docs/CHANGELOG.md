# Changelog

> Append-only task history for the second brain. Never overwrite entries.  
> Cross-links: [[CURRENT_STATE]] · [[BUGS]] · [[DECISIONS]] · [[HANDOVER]]

---

## 2026-06-24 (URL consistency SSOT)

### Added
- `src/lib/url.ts` — `getAppUrl()`, `appAbsoluteUrl()`, `clientAppBaseUrl()` (production → `https://www.awesomepg.in`, preview → Vercel URL, dev → localhost)

### Fixed
- Invoice share, payment link, WhatsApp, KYC, referral, and password-reset links no longer fall back to `localhost:3000` or unset `NEXT_PUBLIC_APP_URL` on Vercel production

---

## 2026-06-24 (invoice + booking financial consistency)

### Added
- **Booking payment summary on rent invoices** — full checkout allocation (rent, deposit transfer, deposit collected, prior balance) + current deposit held from SSOT
- `bookingPaymentFinancialProjection.ts` — shared financial story for invoice, verification, and surfaces
- `invoiceFinancialSurfaceVerification.ts` — multi-surface deposit/allocation consistency checks for APG-0035/0036
- Invoice detail cross-links: booking, resident, deposit, payment
- `invoiceDueDate.ts` + `repairRentInvoiceDueDatesBeforeIssue()` — due date never before issue date

### Fixed
- Fixed-stay rent invoices created with `dueDate < issuedAt` when payment landed after check-in

---

## 2026-06-24 (bulk PG pricing management)

### Added
- **PG Pricing tab** — `/admin/pgs/[pgId]/pricing` bulk rent/deposit % updates with preview + `UPDATE` confirmation
- `bulkPgPricing.ts` — preview/apply, `pg_price_revisions` audit history, financial fingerprint safety check
- `pgInventoryPricing.writeBedPriceVersion()` — time-versioned `bed_prices` writes without touching bookings
- `pgPricingSafetyAudit.ts` — SHA256 fingerprints for bookings, invoices, deposit ledger, checkout settlements
- Migration `0069_pg_price_revisions.sql`
- Unit tests `bulkPgPricing.test.ts`; script `verify-pg-pricing-safety.ts`

### Fixed
- **Pricing propagation** — `updateRoomBedPricing` no longer retroactively mutates active tenant bookings/invoices by default (`propagatePricingChangeForBeds` opt-in only via `affectExistingTenants: true`)
- **Pricing Center** — copy updated: future bookings only; removed resident deposit auto-notify on room rate change

---

## 2026-06-23 (fixed-stay expiry + refund unlock)

### Fixed
- **FIXED-STAY-EXPIRE-01** — Confirmed fixed-stay/daily/weekly bookings stayed `confirmed` past checkout; no cron completed them at 11 AM IST [[BUGS#FIXED-STAY-EXPIRE-01]]

### Added
- `fixedStayAutoExpiry.ts` — IST checkout boundary, batch expiry, checkout settlement + bed release
- Hourly cron `/api/cron/expire-fixed-stays` + `scripts/expire-fixed-stays-now.ts`
- `depositRefundUnlock.ts` — unified locked/unlocked/submitted/approved/paid/rejected states
- Action item types `fixed_stay_checkout_due`, `refund_request_submitted`; overview top-5 oldest pending
- `pgs.average_electricity_bill_paise` for checkout average fallback
- Unit tests: `fixedStayAutoExpiry`, `depositRefundUnlock`, `actionItemPersistence`

---

## 2026-06-23 (financial audit)

### Added
- **Financial audit engine** — 8-check customer scan (`financialIntegrityAudit.ts`), CLI scripts `audit-financials.ts` / `repair-financials.ts`
- **Daily reconciliation cron** — `/api/cron/financial-reconciliation` at 06:30 UTC; `audit_log` + action items for manual review
- **Admin health** — smoke check for last reconciliation run + issue counts
- **Resident outstanding** — "All paid up" when zero; live query via `getLiveOutstandingBalance()`
- `AUDIT_REPORT.md`, unit tests for audit/repair/reconciliation

---

## 2026-06-23 (continued)

### Fixed
- **BOOK-TOTAL-01** — Booking checkout showed rent as “Total to pay today” without deposit: `breakdownBookingPayment` derived rent from `totalPaise − deposit` instead of `subtotalPaise`; UI now uses `computeNewBookingCheckoutTotals` SSOT [[BUGS#BOOK-TOTAL-01]]
- **BOOK-HYBRID-01** — Fixed-stay hybrid pricing (week + remainder days) hidden in booking UI; rent line items now shown on plan/dates/review and pay screens [[BUGS#BOOK-HYBRID-01]]
- **BOOK-OUTST-01** — Prior stay outstanding balance (deposit due, unpaid invoices) now included in new booking checkout total and collected on payment [[BUGS#BOOK-OUTST-01]]

### Added
- `src/lib/billing/bookingCheckoutTotals.ts` — rent + deposit − credit + prior outstanding SSOT
- `src/services/bookingPriorOutstanding.ts`, `BookingPriceBreakdown` component
- `tests/unit/bookingCheckoutTotals.test.ts` (3/7/10/14-day pricing + outstanding cases)

---

## 2026-06-23

### Fixed
- **BOOK-DATE-01** — Mobile bed booking: Edit on `StayDateRangePicker` appeared dead because calendar portal rendered behind `MobileBottomSheet` (z-index 99999). Shared `LAYER_Z` constants nest picker at 100000+ [[BUGS#BOOK-DATE-01]]

### Changed
- `BedBookingPanel` — 3-step wizard (plan → dates → review); `CustomerBedDetailSheet` green “Available now” + single **Reserve this bed** CTA
- `StayDateRangePicker` — separate 44×44px Edit touch target; nested modal uses `LAYER_Z`

### Added
- `tests/unit/layerZIndex.test.ts`, `tests/integration/criticalJourneys.test.ts`, Playwright smoke (`npm run test:e2e`)
- Admin health page `/admin/health` + `GET /api/admin/smoke-checks`
- CI workflow `.github/workflows/ci.yml`, root `DEPLOYMENT_CHECKLIST.md`

---

## 2026-06-22 (continued)

### Added
- Professional Tax Invoice redesign: `InvoiceDocument`, `invoiceDocumentModel`, resident `/account/resident/invoices/[id]`
- Invoice numbering `INV-{YEAR}-{PG}-{SEQ}` via `invoiceNumbering.ts` for new financial inserts
- WhatsApp send abstraction `sendInvoiceOnWhatsApp.ts` with resident invoice page link
- Unit tests: `invoiceNumbering`, `invoiceDocumentModel`, `invoiceRoutes`; extended `invoiceVoid.test.ts`

### Changed
- Admin invoice detail: Cancel + WhatsApp only; express void moved to Advanced collapsible
- Admin invoice list: entire row clickable
- Invoice links in ResidentEntityPanel, ResidentFinancialSummaryCard, InvoiceListModule

---

## 2026-06-22

### Fixed
- **BROWSE-OVERLAP-01** — Browse PG cards stacked/overlapped on mobile: removed parallax/float transforms from listing grid [[BUGS#BROWSE-OVERLAP-01]]
- **VAC-PASTDUE-01** — Past-due vacating notices now show overdue bed labels + daily admin action items via cron [[BUGS#VAC-PASTDUE-01]]
- **VAC-CRASH-02** — Move-outs advanced tools: serialize `Map`/`Date` props before client boundary [[BUGS#VAC-CRASH-02]]
- **VAC-DATE-01** — Vacating date pickers: `tryDiffDays` guards + default to today / `expected_checkout_date` [[BUGS#VAC-DATE-01]]
- **EXP-INV-01** — Express walk-in invoice mirror for rent + deposit-only sales via `finalizeExpressWalkInFinancialInvoice` [[BUGS#EXP-INV-01]]
- **SEARCH-01** — Admin resident substring search (2-char / 2-digit phone) [[BUGS#SEARCH-01]]

### Changed
- Vacating forms default checkout/vacate date to today or booking `expected_checkout_date` when set
- Express walk-in check-in defaults to today; fixed-stay checkout auto-fills +30 nights

### Added
- Unit tests: `moveOutPipeline.test.ts`, `adminResidentSearch.test.ts`, `expressWalkInInvoice.test.ts`, `pgBrowseLayout.test.ts`, `vacatingPastDue.test.ts`

---

## 2026-06-21

### Added
- Autonomous second brain documentation system in `/docs` ([[README]], [[START_HERE]], [[AI_CONTEXT]], [[HANDOVER]], etc.)
- Obsidian domain hub pages: [[Residents]], [[Billing]], [[Vacating]], [[Deposits]], [[KYC]], [[Rooms]], [[Beds]], [[Notifications]], [[Operations]], and linked hubs
- Pre-commit doc sync (`.githooks/pre-commit`, `scripts/sync-docs-pre-commit.ts`) + `npm run docs:links` link verifier
- `vacatingCheckoutBilling.ts` — auto pro-rate checkout-month rent on vacating submit/approve ([[DECISIONS#Vacating checkout rent sync]])
- Electricity checkout placeholder in `residentFinancialEngine` for open vacating requests
- `ScrollToHash` component for Operations lifecycle timeline
- Vacating-specific error boundary (`app/(admin)/admin/vacating/error.tsx`)
- Move-out pipeline: full date formatting, approval preview dialog, urgency colors, stage timestamps
- Deposit revenue + PG collection breakdown on Revenue page

### Changed
- [[Operations]] move-out queue: `customerId` from vacating records; primary href → checkout settlement when approved
- [[Vacating]] resident timeline: cap stage before vacate date (meter/refund locked)
- Bed assignment SSOT aligned between map and admin UI (`occupancySsot.ts`)
- Admin error boundary message: generic "This page could not load"
- Split vacate request from deposit refund flow (resident gating)

### Fixed
- **`d4c01c6`** — `/admin/vacating` crash (Date serialization to client components) [[BUGS#VAC-CRASH-01]]
- **`d4c01c6`** — Operations lifecycle timeline links + resident map
- **`369bddb`** — Checkout-month rent not generated on vacating notice [[BUGS#VAC-RENT-01]]
- **`88a16e8`** — Bed map vs "Assign bed" state mismatch [[BUGS#BED-SSOT-01]]
- **`fbad857`** — Vacating pipeline UX (dates, preview, sorting)
- **`90928ea`** — Deposit collection sorting + rent billing visibility
- **`783d25e`** — Deposit payment links forbidden for admins
- **`49cf712`** — Duplicate deposit ledger + reconcile tool
- **`e4a7c67`** — Deposit collection status audit
- **`a9ae005`** — Revenue page SQL crash
- **`14a94bd`** — Express walk-in partial success
- **`200824e`** — Admin finance reliability

### Removed
- (none this date)

---

## 2026-06-20

### Added
- Express Sale structured admin booking console
- Date-locked deposit refund eligibility (`depositRefundEligibility.ts`)
- Ledger-driven financials restoration

### Changed
- Resident cancel booking → Request Vacate flow
- Admin panel sync for vacate/refund lifecycle

### Fixed
- Express Booking search + fixed-stay rent calculation
- Deposit visibility / heuristic deduction display
- Bed-centric PG booking modal focus

---

## 2026-06-17 and earlier

See [[AWESOME_PG_MASTER_DOCUMENTATION_V2#Appendix A — Post-v1 commit changelog]] for Action Center, payment links, express collection, fixed-stay picker, security hardening (commits through `b8a1fe2`).

See [[AWESOME_PG_MASTER_DOCUMENTATION]] for Phase 1–5.5 baseline (schema, billing engine, vacating workflow introduction).

---

## Commit index (recent)

| Commit | Summary |
|--------|---------|
| `d4c01c6` | Vacating page crash + ops links |
| `369bddb` | Checkout-month rent on vacating |
| `88a16e8` | Bed assignment SSOT |
| `fbad857` | Vacating pipeline UX |
| `90928ea` | Deposit collection + rent visibility |
| `783d25e` | Deposit payment link admin access |
| `49cf712` | Deposit ledger reconcile |
| `5ef3bc2` | Split vacate vs deposit refund |
| `f69e672` | Request Vacate flow |

---

## 2026-06-23 (post-deploy ops)

### Added
- `scripts/post-deploy-ops.ts` — trigger expire-fixed-stays + financial-reconciliation crons; optional `--with-db`
- `DEPLOYMENT_CHECKLIST.md` — production DB ops (Neon env pull caveat, backfill expire, audit/repair)

---

## 2026-06-23 (Vercel deploy fix)

### Fixed
- **DEPLOY-BLOCK-01** — Production deploys failed silently after `d0a0e13`: hourly cron `0 * * * *` is not allowed on Vercel Hobby (daily only). Removed from `vercel.json`; fixed-stay expiry now runs inside daily `/api/cron/automation` (06:00 UTC). Manual `/api/cron/expire-fixed-stays` retained for backfill.

---

## Related

[[CURRENT_STATE]] · [[BUGS]] · [[DECISIONS]] · [[AI_CONTEXT]]

<!-- DOC_SYNC_PENDING_START -->
### Pending pre-commit sync · 2026-06-24 19:43:36 UTC

**Areas touched:** [[ROUTES]], [[DATABASE]]

**Docs flagged for review:**
- `CHANGELOG.md` — review for accuracy
- `DATABASE.md` — review for accuracy
- `ROUTES.md` — review for accuracy
- `SYSTEM/CURRENT_STATE.md` — review for accuracy

**Staged code files (9):**
- `app/(admin)/admin/settings/page.tsx`
- `app/(admin)/admin/settings/sidebar-layout/actions.ts`
- `app/(admin)/admin/settings/sidebar-layout/page.tsx`
- `app/(admin)/layout.tsx`
- `src/db/migrations/0072_sidebar_layouts.sql`
- `src/db/migrations/meta/_journal.json`
- `src/db/schema/enums.ts`
- `src/db/schema/index.ts`
- `src/db/schema/sidebarLayouts.ts`

**Changed:**
- _(auto)_ Pre-commit doc sync — expand FEATURES/WORKFLOWS/DATABASE sections if behavior changed

**Fixed:**
- _(none — fill in if this commit fixes a bug)_

**Added:**
- _(none — fill in if this commit adds a feature)_

**Removed:**
- _(none)_
<!-- DOC_SYNC_PENDING_END -->
