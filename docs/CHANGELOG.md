# Changelog

> Append-only task history for the second brain. Never overwrite entries.  
> Cross-links: [[CURRENT_STATE]] · [[BUGS]] · [[DECISIONS]] · [[HANDOVER]]

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

## Related

[[CURRENT_STATE]] · [[BUGS]] · [[DECISIONS]] · [[AI_CONTEXT]]

<!-- DOC_SYNC_PENDING_START -->
### Pending pre-commit sync · 2026-06-22 00:25:15 UTC

**Areas touched:** [[ROUTES]], [[Auth]], [[Billing]]

**Docs flagged for review:**
- `ARCHITECTURE.md` — review for accuracy
- `CHANGELOG.md` — review for accuracy
- `PROJECT/features.md` — review for accuracy
- `ROUTES.md` — review for accuracy
- `SYSTEM/CURRENT_STATE.md` — review for accuracy
- `SYSTEM/WORKFLOWS.md` — review for accuracy

**Staged code files (6):**
- `app/(admin)/admin/invoices/actions.ts`
- `app/(customer)/account/resident/invoices/[invoiceId]/page.tsx`
- `app/(customer)/resident/invoices/[ref]/page.tsx`
- `middleware.ts`
- `src/lib/billing/resolveFinancialInvoiceRef.ts`
- `src/lib/billing/sendInvoiceOnWhatsApp.ts`

**Changed:**
- _(auto)_ Pre-commit doc sync — expand FEATURES/WORKFLOWS/DATABASE sections if behavior changed

**Fixed:**
- _(none — fill in if this commit fixes a bug)_

**Added:**
- _(none — fill in if this commit adds a feature)_

**Removed:**
- _(none)_
<!-- DOC_SYNC_PENDING_END -->
