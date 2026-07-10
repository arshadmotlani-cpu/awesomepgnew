# Decisions (ADR Log)

> Architecture & business decisions — **never delete** historical entries.  
> New decisions append at bottom with date.

Cross-links: [[ARCHITECTURE]] · [[WORKFLOWS]] · [[AI_CONTEXT]] · [[BUGS]]

---

## Half-open stay ranges

| | |
|---|---|
| **Date** | 2024 (Phase 1) — reaffirmed 2026-06-21 |
| **Decision** | Store occupancy as PostgreSQL `daterange '[check_in, check_out)'` — **exclusive end** |
| **Reason** | Enables GiST EXCLUDE overlap prevention; standard interval math |
| **Impact** | Last occupied day = `upper(stay_range) - 1 day`. Pro-ration uses `activeEnd = day after move-out`. Same-day checkout requires special handling — do not shorten stay before completion ([[Vacating]] tests) |
| **See** | `bedReservations.ts`, `billing.prorateForMonth()`, [[DATABASE#bed_reservations]] |

---

## residentFinancialEngine as money SSOT

| | |
|---|---|
| **Date** | Phase 5.5 |
| **Decision** | All resident outstanding/required/paid figures flow through `residentFinancialEngine.ts` |
| **Reason** | Eliminated inconsistent totals across profile, revenue, operations, WhatsApp |
| **Impact** | UI must call `getResidentFinancialSummary()` / `getBookingFinancialSummary()` — no inline SUM queries |
| **See** | [[ARCHITECTURE#Financial core]], [[features#Residents]] |

---

## Unified financial_invoices registry

| | |
|---|---|
| **Date** | 2025 |
| **Decision** | Mirror rent, electricity, deposit, custom charges into `financial_invoices` for single `/admin/invoices` view |
| **Reason** | Operators needed one cancel/refund/print surface |
| **Impact** | `unifiedInvoices.ts` syncs on every source mutation; cancel goes through unified layer |
| **See** | [[ROUTES#/admin/invoices]] |

---

## Vacating: 14-day notice + fixed 5-day penalty

| | |
|---|---|
| **Date** | Phase 5.5 |
| **Decision** | ≥14 days notice → no deposit deduction. &lt;14 days → deduct exactly **5 days rent** (monthly/30 × 5), not proportional shortfall |
| **Reason** | Business policy — predictable, fair, auditable |
| **Impact** | Snapshotted on `vacating_requests` at submit; never recalculate from live rates |
| **See** | [[WORKFLOWS#Vacating]], `billing.vacatingPenalty()` |

---

## Vacating checkout rent sync

| | |
|---|---|
| **Date** | 2026-06-21 (`369bddb`) |
| **Decision** | On vacating **submit** and **approve**, run `syncVacatingCheckoutRentBilling()` — pro-rate move-out month, cancel future rent invoices |
| **Reason** | Residents filing notice for e.g. 5 July still owed 1–5 July rent; must appear before deposit refund |
| **Impact** | `vacatingCheckoutBilling.ts`; restore on cancel via `restoreRentBillingAfterVacatingCancel()` |
| **See** | [[WORKFLOWS#Vacating]], [[CHANGELOG#2026-06-21]] |

---

## Split vacate request from deposit refund

| | |
|---|---|
| **Date** | 2026-06-20 (`5ef3bc2`) |
| **Decision** | Resident files **vacate notice** first; **deposit refund** (meter + UPI) is separate step gated by approval + vacate date |
| **Reason** | Prevent premature meter upload and refund before admin confirms move-out |
| **Impact** | `depositRefundEligibility.ts`, [[Vacating]] UI, [[Operations]] queue |
| **See** | [[WORKFLOWS#Refund Processing]] |

---

## Checkout settlements as refund SSOT

| | |
|---|---|
| **Date** | Migration `0058_checkout_settlements` |
| **Decision** | All move-out refunds flow through `checkout_settlements` linked to `vacating_requests` |
| **Reason** | Single admin surface for electricity + notice deduction + deposit payout |
| **Impact** | Deprecated `/admin/requests` for new work; use `/admin/checkout-settlements/[id]` |
| **See** | [[features#Checkout Settlements]] |

---

## Operations as action hub

| | |
|---|---|
| **Date** | Phase 2 redesign (2026) |
| **Decision** | Primary operator actions live in **`/admin/operations`** queue — rent overdue, KYC, beds, move-outs, refunds |
| **Reason** | Too many duplicate CTAs across profile, bed map, overview confused staff |
| **Impact** | Move-out pending → `/admin/vacating`; approved → `/admin/checkout-settlements/[id]`. Profile remains read/drill-down |
| **See** | [[ROUTES#Where to act]], [[CURRENT_STATE#Upcoming work]] |

---

## Bed assignment SSOT alignment

| | |
|---|---|
| **Date** | 2026-06-21 (`88a16e8`) |
| **Decision** | Align `occupancySsot.ts` SQL with bed map — today occupancy includes all duration modes; future assignment filter unchanged |
| **Reason** | Bed map showed "assigned" while residents list showed "Assign bed" |
| **Impact** | `revalidateOccupancyViews()` after all assign/move mutations |
| **See** | [[Bed Assignment]], [[BUGS#Resolved]] |

---

## Client Date serialization

| | |
|---|---|
| **Date** | 2026-06-21 (`d4c01c6`) |
| **Decision** | Serialize `Date` → ISO string before passing pipeline items to `'use client'` components |
| **Reason** | `/admin/vacating` crashed — RSC cannot JSON-serialize Date to client |
| **Impact** | `toClientMoveOutPipelineItem()` in `moveOutPipeline.ts`; rule added to [[AI_CONTEXT]] |
| **See** | [[ARCHITECTURE#Client / server boundary]], [[BUGS#Resolved]] |

---

## Pricing snapshot immutability

| | |
|---|---|
| **Date** | Phase 1 |
| **Decision** | Freeze `bookings.pricing_snapshot` JSONB at checkout |
| **Reason** | Rate changes must not rewrite historical invoices/refunds |
| **Impact** | Rent recalculation reads snapshot, not live `bed_prices` |
| **See** | [[DATABASE#bookings]] |

---

## Payment proof vs Razorpay

| | |
|---|---|
| **Date** | Phase 5.5 |
| **Decision** | Support UPI manual proof upload + admin approval alongside Razorpay auto-capture |
| **Reason** | Indian PG market predominantly UPI QR |
| **Impact** | `/admin/revenue/billing?tab=approvals`, proof API routes |
| **See** | [[Billing]] |

---

## Action Center idempotent sync

| | |
|---|---|
| **Date** | Migration `0038_action_center` |
| **Decision** | `action_items.source_key` UNIQUE — sync upserts, never duplicates |
| **Reason** | Safe to run cron + manual sync repeatedly |
| **Impact** | `actionItems.syncActionItems()` |
| **See** | [[features#Action Center]] |

---

## Documentation second brain

| | |
|---|---|
| **Date** | 2026-06-21 |
| **Decision** | Maintain `/docs` Obsidian-compatible knowledge base as SSOT for AI sessions; update on every code change |
| **Reason** | Prevent context loss across AI tools and sessions |
| **Impact** | This folder; [[AI_CONTEXT]], [[CHANGELOG]], [[HANDOVER]] |
| **See** | [[README]] |

---

## Financial invoice numbering scheme

| | |
|---|---|
| **Date** | 2026-06-22 |
| **Decision** | New `financial_invoices` inserts use `INV-{YEAR}-{PROPERTY_CODE}-{SEQUENCE}` (per PG, per calendar year). Rent-synced unified rows keep source `RNT-*` numbers. |
| **Reason** | Professional tax invoices need stable, human-readable IDs scoped by property and year |
| **Impact** | `invoiceNumbering.ts`; express walk-in, custom charges, invoice generation, express collection |
| **See** | [[Invoices#Invoice numbering (2026-06-22)]], `src/lib/billing/invoiceNumbering.ts` |

---

## Related

[[ARCHITECTURE]] · [[WORKFLOWS]] · [[CHANGELOG]] · [[CURRENT_STATE]]

<!-- DOC_SYNC_TOUCH_2026-06-21 -->
> **2026-06-21 18:33:10 UTC** — Code changed in: Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-23 -->
> **2026-06-23 12:41:05 UTC** — Code changed in: Routes, Database, Billing, Residents, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-24 -->
> **2026-06-24 09:00:17 UTC** — Code changed in: Routes, Bed Assignment, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-26 -->
> **2026-06-26 07:02:31 UTC** — Code changed in: Routes, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-27 -->
> **2026-06-27 08:37:59 UTC** — Code changed in: Vacating, Action Center, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-29 -->
> **2026-06-29 08:55:28 UTC** — Code changed in: Routes, Billing, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-30 -->
> **2026-06-30 10:04:16 UTC** — Code changed in: Routes, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-01 -->
> **2026-07-01 09:00:24 UTC** — Code changed in: Database, Billing, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-02 -->
> **2026-07-02 10:51:15 UTC** — Code changed in: Routes, Bed Assignment. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-03 -->
> **2026-07-03 09:56:20 UTC** — Code changed in: Vacating, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-04 -->
> **2026-07-04 10:39:29 UTC** — Code changed in: Database, Billing, Bed Assignment, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-05 -->
> **2026-07-05 10:29:21 UTC** — Code changed in: Routes, Database, Billing, Bookings, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-06 -->
> **2026-07-06 16:23:12 UTC** — Code changed in: Routes, Database, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-07 -->
> **2026-07-07 10:28:44 UTC** — Code changed in: Bookings, Bed Assignment. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-10 -->
> **2026-07-10 09:24:52 UTC** — Code changed in: Bed Assignment, Bookings. Manual review recommended.
