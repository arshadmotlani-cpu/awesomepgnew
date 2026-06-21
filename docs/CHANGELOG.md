# Changelog

> Append-only task history for the second brain. Never overwrite entries.  
> Cross-links: [[CURRENT_STATE]] · [[BUGS]] · [[DECISIONS]] · [[HANDOVER]]

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
### Pending pre-commit sync · 2026-06-21 18:33:10 UTC

**Areas touched:** [[Vacating]]

**Docs flagged for review:**
- `CHANGELOG.md` — review for accuracy
- `CURRENT_STATE.md` — review for accuracy
- `DECISIONS.md` — review for accuracy
- `FEATURES.md` — review for accuracy
- `WORKFLOWS.md` — review for accuracy

**Staged code files (1):**
- `src/services/vacating.ts`

**Changed:**
- _(auto)_ Pre-commit doc sync — expand FEATURES/WORKFLOWS/DATABASE sections if behavior changed

**Fixed:**
- _(none — fill in if this commit fixes a bug)_

**Added:**
- _(none — fill in if this commit adds a feature)_

**Removed:**
- _(none)_
<!-- DOC_SYNC_PENDING_END -->
