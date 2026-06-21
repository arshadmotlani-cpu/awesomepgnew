# Operations

> Domain hub — the single priority queue where operators act on rent, KYC, beds, move-outs, and refunds.

Cross-links: [[START_HERE]] · [[FEATURES#Operations center]] · [[DECISIONS#Operations as action hub]]

---

## Purpose

**`/admin/operations`** is the canonical action hub for daily PG operations. It aggregates overdue rent, pending KYC, bed assignment gaps, move-out pipeline items, refund settlements, and payment proofs — with deep links to the right module for each action.

**SSOT:** `residentOperationsDashboard.ts`, `buildResidentOperationsDashboard`, `moveOutPipeline.ts`, `actionItems.ts`

---

## Related features

- [[Operations]] center — `/admin/operations`
- [[Action Center]] sync + Action Drawer
- Move-out queue with lifecycle timeline + ScrollToHash
- KYC pending, rent overdue, bed unassigned cards
- Checkout settlement deep links when vacate approved
- [[Notifications]] admin feed mirror

See [[FEATURES#Operations center]] · [[FEATURES#Action Center]]

---

## Related workflows

| Workflow | Ops role |
|----------|----------|
| [[WORKFLOWS#KYC Approval]] | Surface pending → link to [[KYC]] |
| [[WORKFLOWS#Bed Assignment]] | Unassigned bed alerts |
| [[WORKFLOWS#Billing]] | Overdue rent / proof approval |
| [[WORKFLOWS#Vacating]] | Pending approve → [[Vacating]]; approved → [[Checkout Settlements]] |
| [[WORKFLOWS#Refund Processing]] | Settlement status in queue |
| [[WORKFLOWS#Notifications]] | Action item sync |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/operations` | **Primary action hub** |
| `/admin/vacating` | Approve move-out (from queue) |
| `/admin/checkout-settlements/[id]` | Approved vacate → settlement |
| `/admin/residents/kyc/[id]` | KYC from queue |
| `/admin/revenue/billing` | Rent / proof from queue |
| `/admin/pgs/[pgId]/map` | Bed assignment from queue |

**Where to act:** [[ROUTES#Where to act]]

---

## Related database entities

| Source | Feeds queue |
|--------|-------------|
| `vacating_requests` | Move-out stages |
| `checkout_settlements` | Refund progress |
| `kyc_submissions` | Pending identity |
| `rent_invoices`, `electricity_invoices` | Overdue billing |
| `bed_reservations`, `bookings` | Assignment gaps |
| `action_items` | Synced task registry |
| `customers`, `bookings` | Resident context |

See [[ARCHITECTURE#Operations core]]

---

## Related decisions

- [[DECISIONS#Operations as action hub]] — **primary ADR for this domain**
- [[DECISIONS#Checkout settlements as refund SSOT]]
- [[DECISIONS#Split vacate request from deposit refund]]
- [[DECISIONS#Action Center idempotent sync]]
- [[DECISIONS#Client Date serialization]] — pipeline queue fix
- [[DECISIONS#Bed assignment SSOT alignment]]

---

## Related hubs

[[Vacating]] · [[Checkout Settlements]] · [[Billing]] · [[KYC]] · [[Bed Assignment]] · [[Residents]] · [[Notifications]] · [[Action Center]]

See [[BUGS#OPS-UX-01]] · [[CURRENT_STATE#Consolidate admin actions]]
