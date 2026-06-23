# Bugs & Known Limitations

> Open issues, resolved history, workarounds. Update when fixing or discovering bugs.  
> Cross-links: [[CURRENT_STATE]] · [[CHANGELOG]] · [[DECISIONS]]

---

## Open bugs

### VAC-B5-01 — Room 203 B5 vacating invisible / admin vacating crash

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | Harish (203 B5): vacating + checkout visible in ops, `/admin/vacating` crashes, refund badge but empty legacy refund list |
| **Root cause** | (1) `listAdminVacatingRequests` INNER JOIN on `primary` bed_reservation dropped rows after bed release; (2) `getDepositSummaryForBooking` threw on corrupt ledger and crashed page load; (3) refund counter from checkout settlements + action_items but list only queried `resident_requests`; stale `refund_request_submitted` badges |
| **Fix** | LEFT JOIN LATERAL bed location in vacating list; deposit summary returns null on error; RefundRequestsOpsPanel shows checkout settlements; resolve stale refund action items when checkout settlement active; `scripts/investigate-bed-203-b5.ts` + `repair-bed-203-b5-lifecycle.ts` |

---

| ID | Severity | Summary | Workaround |
|----|----------|---------|------------|
| OPS-UX-01 | Medium | Duplicate vacating/deposit/refund actions across profile, bed map, overview | Use [[Operations]] + `/admin/vacating` + checkout settlements only ([[DECISIONS#Operations as action hub]]) |
| OPS-UX-02 | Low | Legacy routes (`/admin/requests`, `/admin/collections`) still linked in old bookmarks | Use canonical routes in [[ROUTES]] |
| RES-LIST-01 | Low | `listResidentsForAdmin` LIMIT 200 may omit older vacated residents in ops timeline | Open resident profile directly by ID |
| VAC-SAME-01 | Low | Same-day vacating approve shortens `[start,today)` excluding today — completion must not shorten before move-out day | See `vacatingCheckout.test.ts`; use complete flow same day |
| FIN-AUDIT-01 | Low | Historical invoices may have `amountPaise` ≠ line sum or unreconciled payments | Run `npx tsx scripts/audit-financials.ts` then `repair-financials.ts --dry-run` |

---

### CHK-ZERO-01 — Zero-refund checkout stuck on “Waiting on resident” / UPI

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Harish 203 B5: deposit ₹1,500 fully consumed by notice ₹595 + electricity ₹905 (refund ₹0), but checkout still `awaiting_resident_details`, deposit shows held, UPI requested |
| **Root cause** | Checkout workflow always required UPI + resident submit even when `finalRefundPaise <= 0`; deductions only written to `deposit_ledger` at admin approve; status never auto-completed for zero balance |
| **Fix** | Skip payout validation when refund ≤ 0; admin **Complete checkout** from `awaiting_resident_details` when electricity settled; approve writes deductions + marks `completed` directly; `scripts/audit-harish-checkout.ts` |

---


| | |
|---|---|
| **Severity** | High |
| **Symptom** | Sidebar items (Operations, KYC, PGs, Checkout Settlements, Residents, etc.) often ignored first click; navigation felt delayed |
| **Root cause** | `AdminLiveRefreshProvider` called `router.refresh()` every 30s, re-executing the dynamic admin layout (`requireAdminSession` + badge load) and racing client `Link` navigations |
| **Fix** | Removed periodic `router.refresh()` (badge poll remains client-side); `AdminNavLink` with prefetch + optimistic active state; nav timing logs warn when click→route or click→visible exceeds 200ms; sidebar `z-20` stacking |

---

### UPLOAD-CAP-01 — Mobile upload shows camera only (no gallery / screenshots)

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | On Android/iPhone, photo upload flows showed only **Camera** — no Photo Gallery, Photos Library, Screenshots, or Files |
| **Root cause** | `capture="environment"` on `<input type="file">` in checkout and deposit-refund flows; 12+ pages each had their own file input with no shared enforcement; KYC was fixed separately so regressions reappeared on other pages after deploys |
| **Fix** | `ImageFileInput` + `fileInputPolicy.ts` (never sets `capture`); migrated KYC, checkout proof, UPI proof, deposit meter, admin QR/meter/gallery uploads; `scripts/lint-image-uploads.ts` + `tests/unit/fileInputPolicy.test.ts` scan `app/` + `src/` on every `npm test` |

---

## Resolved bugs

### BOOK-OUTST-01 — Prior stay outstanding not included in new booking payment

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Resident with deposit balance due on a prior booking could start a new stay but checkout total ignored the outstanding amount |
| **Root cause** | Checkout totals only summed new-booking rent + deposit; no query of `getBookingFinancialSummary` / deposit due on prior bookings |
| **Fix** | `getCustomerPriorOutstandingForCheckout()` snapshotted on booking create; included in `totalToCollectToday`; prior deposit slice allocated via append-only `recordDepositCollected` on payment |

---

### BOOK-HYBRID-01 — Hybrid fixed-stay rent breakdown hidden in booking UI

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | 10-day stay showed ₹1,900 rent only (weekly) without the extra 3 daily days |
| **Root cause** | Client preview used `previewLowestFixedStayRent()` (subtotal only); UI never rendered `computeLowestFixedStayRent` line items |
| **Fix** | `previewFixedStayQuote()` + `BookingPriceBreakdown` with week/day lines; `rentLineItems` snapshotted on booking |

---

### BOOK-TOTAL-01 — Deposit excluded from “Total to pay today”

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Rent ₹1,900 + deposit ₹950 displayed, but total showed ₹1,900 |
| **Root cause** | `breakdownBookingPayment()` computed `rentDue = totalPaise − depositCashDue` so when `booking.totalPaise` omitted deposit (or deposit credit zeroed cash due), UI showed full deposit line but total matched rent only; checkout components also trusted inconsistent props |
| **Fix** | `computeNewBookingCheckoutTotals()` / `breakdownBookingCheckoutPayment()` — total = rent + deposit due now + prior outstanding; all booking flow screens use shared breakdown |

---

### FIXED-STAY-EXPIRE-01 — Fixed-stay bookings never auto-completed at checkout

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Daily/weekly/fixed_stay bookings stayed `confirmed` indefinitely after checkout date; beds remained occupied; deposit refund never unlocked |
| **Root cause** | No cron/job for fixed-stay auto-completion at 11 AM IST — only `vacatingPastDue`, `release-holds`, etc. |
| **Fix** | `fixedStayAutoExpiry.ts` + daily automation cron (06:00 UTC) + manual `/api/cron/expire-fixed-stays`; completes booking, releases bed, creates checkout settlement + `fixed_stay_checkout_due` action item |

---

### BOOK-DATE-01 — Mobile Edit on stay date picker does nothing

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Tapping **Edit** on the stay date field inside `BedBookingPanel` (bottom sheet) appeared to do nothing on mobile |
| **Root cause** | `StayDateRangePicker` calendar portal used default/low z-index while `MobileBottomSheet` panel sits at `99999`, so the modal opened behind the sheet |
| **Fix** | Shared `src/lib/ui/layerZIndex.ts` (`LAYER_Z.nestedOverlay` / `nestedDialog` > `bottomSheetPanel`); separate 44×44px Edit button |

---

### BROWSE-OVERLAP-01 — PG listing cards overlap on `/pgs` browse (mobile)

| | |
|---|---|
| **Severity** | High |
| **Symptom** | PG cards visually stacked on top of each other with large gaps — especially on mobile |
| **Root cause** | `SpatialPgGrid` wrapped each card in `WorldLayer` with scroll parallax + infinite float `translateY` transforms and staggered `rotateX`. CSS transforms do not affect layout box size, so cards overlapped while the grid reserved too little vertical space |
| **Fix** | Replaced spatial/parallax grid with a normal CSS grid (`grid-cols-1 gap-6`); optional opacity-only entrance animation. Hero images already use `aspect-[16/9]` |

---

### VAC-PASTDUE-01 — Bed status stale after vacate date passes

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Approved vacating with vacate date 18 Jun still shows “notice period” on 22 Jun; no admin signal |
| **Root cause** | By design beds stay occupied until checkout settlement completes ([[DECISIONS#Checkout settlements as refund SSOT]]), but UI labels never switched to “overdue” and `syncVacatingAlerts` used the same title/priority for past-due rows. Daily cron (`/api/cron/automation`) already runs `syncActionItemsForCron` but did not distinguish overdue move-outs |
| **Fix** | `bedAvailabilityState.ts` past-due copy; `syncVacatingAlerts` high-priority overdue titles + settlement link; `processVacatingPastDueDaily()` in daily cron; `resolveStaleVacatingActionItems()` when request completes |

---

### VAC-B5-01 — Room 203 B5 move-out crash + refund badge mismatch

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | Shanti Nagar 203-B5: vacating + checkout pending in UI; `/admin/vacating` crashes; refund sidebar badge > 0 but `/admin/requests` empty |
| **Root cause** | (1) Client `MoveOutPipelineQueue` used raw `diffDays` on ISO timestamp dates from Postgres; bigint paise could cross RSC boundary. (2) `listAdminVacatingRequests` lateral bed pick did not prefer today's active primary reservation. (3) `/admin/requests` listed legacy `resident_requests` only while badges counted checkout-settlement `refund_pending` / `refund_request_submitted` action items. |
| **Fix** | `normalizeIsoDateOnly` + `tryDiffDays` in pipeline/approval paths; coerce paise in `toMoveOutAdvancedToolsRow`; prefer active primary bed in vacating query; unified refund queue on `/admin/requests`; `scripts/investigate-bed-203-b5.ts` + `scripts/repair-bed-203-b5.ts` |

---

### VAC-CRASH-02 — `/admin/vacating` Map + Date props to client actions

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | Move-outs page / advanced tools crash — non-serializable `Map` props and `AdminVacatingRow` `Date` fields crossing client boundary via `VacatingRowActions` |
| **Root cause** | `MoveOutAdvancedTools` passed `Map` props; `VacatingRowActions` (client) received rows with `Date` instances |
| **Fix** | Serialize rows via `toMoveOutAdvancedToolsRow()`; use `Record<string, …>` for settlement/deposit maps; precompute `approvalPreview` on server |

---

### VAC-DATE-01 — Vacating checkout date picker client crash

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Black screen when selecting vacating/checkout date with invalid or empty input |
| **Root cause** | `diffDays` / `moveOutDaysRemaining` threw on invalid dates; deposit preview had no guard |
| **Fix** | `tryDiffDays()` helper; safe guards in `approvalPreview`, `depositRefundEligibility`; controlled date defaults in vacating forms |

---

### EXP-INV-01 — Express walk-in “Review & create invoice” missing unified invoice

| | |
|---|---|
| **Severity** | High |
| **Symptom** | Click fails or invoice missing from `/admin/invoices` and resident profile after express walk-in |
| **Root cause** | Rent unified sync used ambiguous `limit(1)` lookup; deposit-only sales never mirrored to `financial_invoices` |
| **Fix** | `finalizeExpressWalkInFinancialInvoice()` passes `rentInvoiceId`; deposit-only creates combined financial invoice |

---

### SEARCH-01 — Admin resident search too strict for partial match

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | Substring name/phone search blocked until 3 characters |
| **Root cause** | Express walk-in and phone SQL gate used 3-char minimum |
| **Fix** | Central search + express walk-in + residents table filter use 2-char / 2-digit minimum with `ILIKE %pattern%` |

---

### VAC-CRASH-01 — `/admin/vacating` page crash

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | "Overview could not load" / digest error when opening `/admin/vacating`, Operations "Continue move-out", or after deposit cancel revalidation |
| **Root cause** | `MoveOutPipelineQueue` (client) received `MoveOutPipelineItem` with `Date` objects and `stageTimestamps` — not JSON-serializable |
| **Fix** | `d4c01c6` — `toClientMoveOutPipelineItem()` serializes dates to ISO strings |
| **See** | [[DECISIONS#Client Date serialization]] |

---

### BED-SSOT-01 — Bed map vs residents list mismatch

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | Bed map shows resident assigned; residents list / profile still shows "Assign bed" |
| **Root cause** | `occupancySsot.ts` filtered `duration_mode` differently than bed map lateral; missing `revalidateOccupancyViews()` after mutations |
| **Fix** | `88a16e8` — aligned SQL + revalidation on assign/move |
| **See** | [[DECISIONS#Bed assignment SSOT alignment]] |

---

### OPS-TIMELINE-01 — Lifecycle timeline not showing on Operations

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | "View lifecycle timeline" appeared to do nothing |
| **Root cause** | (1) Relative URL `?resident=` without path (2) vacating rows had empty `customerId` (3) no scroll to `#timeline` |
| **Fix** | `d4c01c6` — absolute URLs, `customerId` from vacating query, `ScrollToHash` |
| **See** | [[Operations]] |

---

### VAC-RENT-01 — No checkout-month rent on vacating notice

| | |
|---|---|
| **Severity** | High (business) |
| **Symptom** | Resident vacating 5 July — no pro-rated 1–5 July rent invoice before refund |
| **Root cause** | Vacating submit/approve did not sync checkout-month billing |
| **Fix** | `369bddb` — `vacatingCheckoutBilling.ts` |
| **See** | [[DECISIONS#Vacating checkout rent sync]] |

---

### REV-CRASH-01 — Revenue page SQL alias error

| | |
|---|---|
| **Severity** | High |
| **Fix** | `a9ae005` |
| **Symptom** | Revenue page crash from invalid occupancy SQL alias in deposit query |

---

### DEP-LINK-01 — Deposit payment links forbidden for admins

| | |
|---|---|
| **Severity** | Medium |
| **Fix** | `783d25e` |

---

### DEP-DUP-01 — Duplicate deposit ledger display

| | |
|---|---|
| **Severity** | Medium |
| **Fix** | `49cf712` — ledger reconcile tool |

---

## Operational scenarios (not code bugs)

### Mohd Aatif — pending approval

| | |
|---|---|
| **Status** | Expected — not a bug |
| **Situation** | Move-out notice filed; Operations shows "Approve move-out notice" |
| **Cause** | Admin clicked Continue before `d4c01c6` fix — vacating page crashed, approval never completed |
| **Action** | After deploy: `/admin/vacating` → Continue → confirm approve |

---

### Harish — checkout in progress

| | |
|---|---|
| **Status** | Workflow in progress |
| **Situation** | Vacating approved; checkout settlement open; refund may be marked paid elsewhere |
| **Action** | `/admin/checkout-settlements/[id]` — verify status `refund_paid` / `completed`; align deposit ledger |

---

## Known limitations

| Area | Limitation |
|------|------------|
| **Half-open ranges** | Vacating date stored as inclusive move-out day but `stay_range` upper bound is exclusive — document carefully when debugging days |
| **Single active vacating request** | Partial unique on `booking_id` for `pending`/`approved` only — rejected/completed history does not block a new notice |
| **Resident list cap** | 200 residents in admin list query |
| **Manual UPI** | Proof approval required — no auto-reconciliation with bank statements |
| **Electricity at checkout** | Final bill amount unknown until meter reading or average — placeholder shown before generation ([[WORKFLOWS#Billing]]) |
| **Legacy `/admin/requests`** | Deprecated — do not build new features there |

---

## Reporting new bugs

1. Add row to **Open bugs** above
2. Append fix to **Resolved** when shipped
3. Update [[CHANGELOG]] and [[CURRENT_STATE]]
4. Add ADR in [[DECISIONS]] if architectural

---

## Related

[[CURRENT_STATE]] · [[CHANGELOG]] · [[DECISIONS]] · [[WORKFLOWS]]
