# Handover — Paste into any AI

> **Copy everything below the line** into ChatGPT, Claude, Gemini, Cursor, or a new session.  
> For deeper detail, open the linked docs in `/docs`.

---

## Awesome PG — 60-second brief

**What:** Production SaaS for Indian PG (paying guest) operators — multi-property bed inventory, monthly billing, KYC, vacating, deposit refunds.

**Stack:** Next.js 16 App Router, React 19, TypeScript, PostgreSQL, Drizzle ORM, Razorpay + UPI proofs, Vercel.

**URL:** `awesomepg.in`

---

## Read first (in order)

1. [[START_HERE]] — project summary + agent instructions
2. [[AI_CONTEXT]] — rules + SSOT services
3. [[CURRENT_STATE]] — what's broken / in progress today
4. [[WORKFLOWS]] — business flows
5. [[ROUTES]] — where to click in admin

Full vault index: [[README]]

---

## Non-negotiable rules

1. **Money SSOT:** `src/services/residentFinancialEngine.ts` — never duplicate outstanding math in UI.
2. **Occupancy SSOT:** `src/lib/occupancySsot.ts` + `bed_reservations.stay_range` half-open `[start, end)`.
3. **Vacating:** 14-day notice; &lt;14 days = 5-day rent penalty snapshotted at submit.
4. **Checkout rent:** On vacating submit/approve → `vacatingCheckoutBilling.ts` pro-rates move-out month.
5. **Deposit refund:** Locked until vacating **approved** AND **vacate date reached** (`depositRefundEligibility.ts`).
6. **RSC → client:** Never pass `Date` or `Map` to `'use client'` components — serialize first.
7. **Docs:** Update [[CHANGELOG]] + relevant brain doc when code changes.

---

## Where admins act

| Task | Route |
|------|-------|
| Daily queue | `/admin/operations` |
| Approve move-out | `/admin/vacating` |
| Process refund | `/admin/checkout-settlements/[id]` |
| Assign bed | `/admin/pgs/[pgId]/map` |
| Rent / UPI proofs | `/admin/revenue/billing` |
| Resident money | `/admin/residents/[customerId]` |
| KYC | `/admin/residents/kyc` |

---

## Key services

| Domain | File |
|--------|------|
| All resident money | `residentFinancialEngine.ts` |
| Rent | `rentInvoices.ts`, `billing.ts` |
| Electricity | `electricityBilling.ts`, `meterElectricity.ts` |
| Deposits | `deposits.ts`, `depositOperations.ts` |
| Vacating | `vacating.ts`, `vacatingCheckoutBilling.ts` |
| Refund checkout | `checkoutSettlement.ts` |
| Bed occupancy | `occupancySsot.ts` |
| Ops queue | `residentOperationsDashboard.ts`, `actionItems.ts` |
| Unified invoices | `unifiedInvoices.ts` |

---

## Current state (2026-06-21)

**Just fixed:** `/admin/vacating` page crash (`d4c01c6`), checkout-month rent on notice (`369bddb`), bed assignment SSOT (`88a16e8`).

**Ops note:** Residents with pending move-out (e.g. Mohd Aatif) need approval at `/admin/vacating` after deploy. Approved residents (e.g. Harish) → checkout settlements for refund.

**In progress:** Consolidate duplicate admin actions into [[Operations]] + module hubs only.

**Open UX debt:** Legacy routes, 200-resident list cap — see [[BUGS]].

---

## Vacating flow (short)

1. Resident submits notice → rent pro-rated for move-out month
2. Admin approves → checkout settlement created
3. On vacate date → resident uploads meter + UPI
4. Admin reviews settlement → marks refund paid → complete vacating

---

## Database highlights

- `bookings` + `bed_reservations` (half-open ranges, GiST EXCLUDE)
- `rent_invoices`, `electricity_invoices`, `deposit_ledger`
- `vacating_requests` → `checkout_settlements`
- `financial_invoices`, `action_items`, `payment_links`

Full schema: [[DATABASE]]

---

## Tests

```bash
npm test          # unit + integration
npm run build     # typecheck + build
npm run db:migrate
```

Billing math tests: `tests/unit/billing.test.ts`

---

## Legacy docs (still valid, deeper detail)

- `docs/AWESOME_PG_MASTER_DOCUMENTATION_V2.md` — post-v1 features (Action Center, express collection, security)
- `docs/feature-inventory.md` — full route audit
- `docs/risk-report.md` — financial risk areas

---

## Second brain files

| File | Purpose |
|------|---------|
| [[AI_CONTEXT]] | AI onboarding |
| [[CURRENT_STATE]] | Priorities + debt |
| [[features]] | Feature inventory |
| [[WORKFLOWS]] | Step-by-step flows |
| [[DATABASE]] | Tables + relations |
| [[ROUTES]] | All routes |
| [[ARCHITECTURE]] | System design |
| [[DECISIONS]] | ADR log |
| [[BUGS]] | Issues |
| [[CHANGELOG]] | History |

---

*End of handover block — paste above into new AI session.*
