# P0 Operations Queue Audit

## Root causes

| Issue | Root cause | Fix |
|-------|------------|-----|
| **Arshad — stale bed assignment** | `syncBedAssignmentActions` used raw SQL: any `confirmed` booking with non-active reservation, ignoring onboarding eligibility (`isResidentBedAssignmentEligible`). Blocked Residents used the same loose heuristic. | Bed sync now uses `listResidentsForAdmin` + `isResidentBedAssignmentEligible`. Stale `bed_assignment` unresolved rows auto-close when no longer eligible. |
| **Mohd Aatif — move-out / checkout** | Valid when vacating is `approved` and checkout settlement is in `awaiting_resident_details`, `awaiting_admin_review`, `approved`, or `refund_pending` with refund > 0. | No change when settlement is genuinely open. Terminal settlements with ₹0 refund now auto-close. |
| **Harish — stale refund** | `listPendingDepositRefunds` and `refund_pending` action items ignored completed checkout with `final_refund_paise = 0`. `admin_deposit_refund_status` could remain `pending` after zero-refund settlement. Dismiss only closed notifications — queue reads `vacating_requests` + `checkout_settlements` directly. | Exclude stale ₹0 `refund_pending` from queue; `operations_queue_dismissals` SSOT; dismiss repairs domain rows (complete settlement/vacating/booking flag). |
| **Crash — Open request** | Action Center linked to `/admin/requests/{id}` — **route does not exist** (only `/admin/requests`). Next.js error digest `1224555493` is the server error reference from `app/(admin)/admin/error.tsx`. | All request hrefs now point to `/admin/requests`. Extension requests no longer stay open after `approved`/`completed`. |

## Audit every OPEN `unresolved_action`

Run on production after deploy:

```bash
npx tsx scripts/audit-open-unresolved-actions.ts
npx tsx scripts/audit-open-unresolved-actions.ts --fix   # close invalid rows
npx tsx scripts/sync-admin-notifications.ts             # full sync
```

### Validation rules (automated)

| action_type | Valid when | Auto-close when |
|-------------|------------|-----------------|
| `bed_assignment` | `isResidentBedAssignmentEligible(resident)` | No active onboarding booking awaiting bed |
| `kyc_review` | Pending `kyc_submissions` row | Submission no longer pending |
| `payment_proof_review` | In pending payment review queue | Proof approved/rejected |
| `move_out_approval` | Vacating `pending`/`approved` | Vacating completed/cancelled; or settlement terminal ₹0 |
| `checkout_settlement` | Settlement operational, refund may be due | `completed`/`refund_paid` with ₹0 refund |
| `deposit_refund_approval` | Refundable balance > 0 and not terminal | Settlement `completed`/`refund_paid` with ₹0 |
| `room_transfer_approval` | Resident request `submitted`/`under_review` | Request `rejected`/`completed` |

### Named resident matrix (post-fix expectations)

| Resident | Symptom | Expected after sync | Action |
|----------|---------|---------------------|--------|
| **Arshad Motlani** | Blocked — bed not assigned | **CLOSE** if no `onboardingBookingId` with confirmed/paid path | Run `--fix` after deploy |
| **Mohd Aatif Siddiqui** | Move-out → checkout | **KEEP** if settlement awaiting resident/admin/refund | Verify settlement status in admin |
| **Harish** | Review refund | **CLOSE** — bed released, ₹0 refund, settlement completed | Run `--fix` after deploy |
| **Crash (extension request)** | Page error on Open request | **CLOSE** or href fixed — no orphan route | Re-sync action items |

## Files changed

- `src/services/unresolvedActionSync.ts` — bed eligibility SSOT, terminal checkout close, stale bed close
- `src/services/actionItems.ts` — stale refund/checkout resolve, request href fix
- `src/services/operationsCenter.ts` — exclude zero-refund completed settlements from refund queue
- `src/lib/residents/residentOperationsResidentsView.ts` — blocked residents use bed eligibility SSOT
- `src/services/residentRequestActions.ts` — extensions only while submitted/under_review
- `scripts/audit-open-unresolved-actions.ts` — production audit + `--fix`

## Verification

```bash
node --import tsx --test tests/unit/residentBedAssignment.test.ts
npx tsx scripts/audit-open-unresolved-actions.ts
```

After production migrate + deploy: open Operations → badge count should match real pending work only.
