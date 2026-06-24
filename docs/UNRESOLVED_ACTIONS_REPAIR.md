# P0 Unresolved Action Engine — SSOT Repair

## Root cause

Admin work was tracked in **three independent layers** that could drift:

| Layer | Problem |
|-------|---------|
| `admin_notifications` | Bell badges; can archive/clear while work remains |
| `action_items` | Action Center queue; not wired to sidebar or resident profile |
| Heuristics (`resident360Workflow`, KYC status checks) | Profile showed actions that queues hid, or vice versa |

**Symptom:** A KYC submission, payment proof, or move-out could appear on the resident profile, in Operations, in KYC, or in notifications — then vanish from one surface while still requiring admin action.

## Fix

Introduced **`unresolved_actions`** as the single source of truth (SSOT):

- **OPEN** → appears everywhere (sidebar badges, resident profile primary action, audits)
- **CLOSED** → appears nowhere
- Notifications remain a **delivery layer only** (bell icon); they do not drive sidebar counts

### Core APIs (`src/services/unresolvedActions.ts`)

- `getOpenActionsCount(session, bucket?)` — sidebar badge counts
- `getOpenActionsByType(session, actionType)` — typed queues
- `resolveAction({ sourceKey | actionType + entity })` — close on approval
- `upsertOpenAction(...)` — idempotent open
- `getOpenActionsForResident(residentId)` — resident profile SSOT

### Sync bridge (`src/services/unresolvedActionSync.ts`)

At the end of every `syncActionItems()`:

1. Mirror open `action_items` → `unresolved_actions` (`unresolved:{source_key}`)
2. Detect bed-assignment gaps → `bed_assignment:{customerId}`
3. Close stale OPEN rows not in the active key set

Domain writes call `scheduleAdminNotificationSync()` → `syncActionItemsForCron()` → full sync including unresolved mirror.

### Badge buckets

| Sidebar | Bucket | Action types |
|---------|--------|--------------|
| Operations | `operations` | bed_assignment, move_out_approval, deposit_refund, invoice_review, room_transfer, maintenance |
| Payment reviews | `payments` | payment_proof_review |
| KYC | `kyc` | kyc_review |
| Checkout | `checkoutSettlements` | checkout_settlement |

## Files changed

| Area | Path |
|------|------|
| Migration | `src/db/migrations/0070_unresolved_actions.sql` |
| Schema | `src/db/schema/unresolvedActions.ts`, `enums.ts`, `index.ts` |
| SSOT service | `src/services/unresolvedActions.ts` |
| Sync bridge | `src/services/unresolvedActionSync.ts` |
| Action items hook | `src/services/actionItems.ts` |
| Sidebar badges | `src/services/adminNavBadges.ts` |
| Admin layout sync | `app/(admin)/layout.tsx` |
| Live API | `app/api/admin/live/route.ts` |
| Nav | `src/components/admin/navItems.ts` |
| Resident profile | `app/(admin)/admin/residents/[customerId]/page.tsx` |
| Resident helpers | `src/lib/residents/residentUnresolvedActions.ts`, `resident360Workflow.ts` |
| Visibility audit | `src/services/kycVisibilityAudit.ts` |
| Tests | `tests/unit/unresolvedActions.test.ts`, `tests/unit/resident360Workflow.test.ts` |
| Verify script | `scripts/verify-unresolved-actions.ts` |

## Verification

```bash
npm run db:migrate
npx tsx scripts/verify-unresolved-actions.ts
npm test -- tests/unit/unresolvedActions.test.ts tests/unit/resident360Workflow.test.ts
```

### Manual E2E (staging/production)

1. Note sidebar badge counts (Operations, Payments, KYC, Checkout).
2. Create KYC submission → KYC badge +1; resident profile shows review CTA.
3. Create payment proof → Payments badge +1.
4. Create move-out request → Operations badge +1.
5. Approve each → corresponding badge −1; action CLOSED in DB.
6. Mark notification read → sidebar badges **unchanged** (notifications not SSOT).

## PASS/FAIL matrix

| Check | Expected | Status |
|-------|----------|--------|
| `unresolved_actions` table exists | Migration 0070 applied | Run `npm run db:migrate` |
| Sidebar Operations count | `getOpenActionsCount(..., 'operations')` only | PASS (code) |
| Sidebar Payments count | `getOpenActionsCount(..., 'payments')` only | PASS (code) |
| Sidebar KYC count | `getOpenActionsCount(..., 'kyc')` only | PASS (code) |
| Sidebar Checkout count | `getOpenActionsCount(..., 'checkout')` only | PASS (code) |
| Notifications bell | `countUnreadNotifications` — separate from module badges | PASS (code) |
| KYC approve closes action | `reviewKycSubmission` → sync → CLOSED | PASS (code) |
| Payment proof approve closes action | sync resolves stale `payment_received` items | PASS (code) |
| Resident profile primary action | `getOpenActionsForResident` → `primaryUnresolved` | PASS (code) |
| Upsert + resolve idempotency | `scripts/verify-unresolved-actions.ts` | Run against DB |
| KYC visibility audit SSOT | `openUnresolvedAction` field | PASS (code) |

## Screenshots

Screenshots require a running admin session with test data. After deploy:

1. Sidebar with badge counts before/after creating KYC + payment proof + move-out.
2. Resident profile workflow bar showing primary unresolved action.
3. `SELECT status, action_type, source_key FROM unresolved_actions WHERE status = 'OPEN' LIMIT 20;`
