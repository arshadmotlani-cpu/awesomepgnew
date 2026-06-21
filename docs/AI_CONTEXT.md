# AI Context — Awesome PG

> **Purpose:** Instant onboarding for any AI session. Read [[START_HERE]] first, then this file, then [[CURRENT_STATE]] and domain hubs as needed.
>
> **Obsidian:** Link related notes with `[[Note Name]]`. See [[HANDOVER]] for a paste-ready summary.

---

## Project overview

**Awesome PG** is a production SaaS for managing paying-guest (PG) accommodations in India. It covers public booking, resident billing (rent + electricity + deposit), KYC, bed inventory, vacating/checkout, and admin operations across multiple properties.

**Business purpose:** Replace spreadsheets and WhatsApp chaos with one system where inventory, money, and move-out/refund workflows stay consistent.

**Production:** Deployed on Vercel (`awesomepg.in`). PostgreSQL via `DATABASE_URL`. Payments via Razorpay + manual UPI proof flows.

---

## Technology stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Session cookies (`auth_sessions`), admin roles + PG scope |
| Payments | Razorpay webhooks, UPI manual proof, payment links |
| Storage | Vercel Blob (KYC, meter photos, QR codes) |
| Observability | Sentry, app logs, system health |
| Tests | Node test runner (`tests/unit`, `tests/integration`) |

---

## Architecture (summary)

See [[ARCHITECTURE]] for detail.

```
Customer/Admin UI (Next.js RSC + client islands)
        ↓
Server Actions / API routes
        ↓
Services (business logic SSOT)
        ↓
Drizzle → PostgreSQL
```

**Non-negotiable SSOT services:**

| Domain | Service |
|--------|---------|
| All resident money figures | `residentFinancialEngine.ts` |
| Rent invoices | `rentInvoices.ts` + `billing.ts` |
| Electricity | `electricityBilling.ts`, `meterElectricity.ts` |
| Deposits | `deposits.ts`, `depositOperations.ts` |
| Vacating | `vacating.ts` |
| Checkout refund | `checkoutSettlement.ts` |
| Bed occupancy truth | `occupancySsot.ts`, `bed_reservations` |
| Unified invoices | `unifiedInvoices.ts` |

**Never duplicate financial math in UI components.**

---

## Core entities

| Entity | Table | Role |
|--------|-------|------|
| PG | `pgs` | Property |
| Room / Bed | `rooms`, `beds` | Inventory unit |
| Customer | `customers` | Resident identity |
| Booking | `bookings` | Commercial stay contract |
| Bed reservation | `bed_reservations` | Half-open `stay_range` occupancy |
| Rent invoice | `rent_invoices` | Monthly rent billing |
| Electricity bill/invoice | `electricity_bills`, `electricity_invoices` | Room meter → split |
| Deposit ledger | `deposit_ledger` | Held / deducted / refunded |
| Vacating request | `vacating_requests` | Move-out notice |
| Checkout settlement | `checkout_settlements` | Refund workflow |
| Financial invoice | `financial_invoices` | Unified billing registry |
| Action item | `action_items` | Operator task queue |

Full schema: [[DATABASE]].

---

## Core workflows

| Workflow | Doc |
|----------|-----|
| Resident onboarding | [[WORKFLOWS#Resident Onboarding]] |
| [[KYC]] approval | [[WORKFLOWS#KYC Approval]] |
| [[Bed Assignment]] | [[WORKFLOWS#Bed Assignment]] |
| [[Billing]] (rent + electricity) | [[WORKFLOWS#Billing]] |
| Deposit collection | [[WORKFLOWS#Deposit Collection]] |
| [[Vacating]] + checkout | [[WORKFLOWS#Vacating]] |
| Refund processing | [[WORKFLOWS#Refund Processing]] |
| Notifications / Action Center | [[WORKFLOWS#Notifications]] |

---

## Non-negotiable system rules

1. **Half-open stay ranges:** PostgreSQL `daterange` uses `[start, end)` — last occupied day is `end - 1 day`. See [[DECISIONS#Half-open stay ranges]].
2. **14-day vacating notice:** ≥14 days = no penalty; &lt;14 days = fixed 5-day rent deduction (not full shortfall).
3. **Rent due date:** 5th of billing month (grace through 5th; late fee from 6th).
4. **Pro-ration:** `monthly / daysInMonth`, floored to paise — used for partial months and vacating checkout.
5. **Vacating checkout rent:** On submit/approve, `vacatingCheckoutBilling.ts` pro-rates move-out month and cancels future rent invoices.
6. **Deposit refund gating:** Resident cannot request refund until vacating **approved** AND **vacate date reached** (`depositRefundEligibility.ts`).
7. **PG-scoped admin access:** Non–super-admins only see their assigned PGs.
8. **Client/server boundary:** Never pass `Date` or `Map` from RSC to client components — serialize first.
9. **Documentation:** Any code change must update [[CHANGELOG]] and relevant brain docs before task is complete.

---

## Admin module map (where to act)

| Need to… | Go to |
|----------|-------|
| Daily priority queue | `/admin/operations` → [[Operations]] |
| Approve move-out | `/admin/vacating` → [[Vacating]] |
| Process refund | `/admin/checkout-settlements/[id]` |
| Assign bed | `/admin/pgs/[pgId]/map` or `/admin/residents` |
| Collect rent / approve UPI proof | `/admin/revenue/billing` |
| Resident financial profile | `/admin/residents/[customerId]` |
| KYC | `/admin/residents/kyc` |

Routes index: [[ROUTES]].

---

## Key file locations

| Area | Path |
|------|------|
| Admin pages | `app/(admin)/admin/` |
| Customer pages | `app/(customer)/`, `app/(customer)/account/` |
| API / webhooks | `app/api/` |
| DB schema | `src/db/schema/` |
| Services | `src/services/` |
| Admin nav SSOT | `src/lib/admin/navigation.ts` |
| Legacy master docs | `AWESOME_PG_MASTER_DOCUMENTATION_V2.md` |

---

## Related documents

- [[START_HERE]] — single AI entry point
- [[CURRENT_STATE]] — priorities, bugs, debt
- [[FEATURES]] — feature inventory
- [[WORKFLOWS]] — step-by-step flows
- [[DATABASE]] — tables & relationships
- [[ROUTES]] — all routes
- [[ARCHITECTURE]] — modules & data flow
- [[DECISIONS]] — ADR log
- [[BUGS]] — open/resolved issues
- [[CHANGELOG]] — task history
- [[HANDOVER]] — paste into any AI
- [[README]] — Obsidian vault index
