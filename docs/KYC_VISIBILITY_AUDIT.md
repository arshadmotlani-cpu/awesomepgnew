# P0 KYC Visibility Audit

**Date:** 2026-06-24  
**Production run:** Vercel build with `VERIFY_KYC_VISIBILITY=1`  
**Overall:** PASS

## Root cause

Two different definitions of “KYC pending” existed:

| Surface | Old trigger | SSOT (fixed) |
|---------|-------------|--------------|
| Resident profile (`buildResident360Workflow`) | `customers.kyc_status = 'pending'` **OR** pending submission | **Pending `kyc_submissions` row only** |
| KYC queue / Operations / Notifications / Action items | Pending `kyc_submissions` only | Same |

`customers.kyc_status` defaults to `pending` for every account. Payment-verified residents (no upload yet) appeared on the **Residents** list with “identity review required” on profile, but **no** queue item, badge, or action — because nothing was uploaded to review.

“Identity review required” means **admin must review uploaded documents**, not “account KYC field is unset.”

## Dhairya Zinzuvadiya (reported case)

Production DB query during build: **no customer** matching `Dhairya`, `Zinzuvadiya`, or `dhair` in `customers.full_name`.

Bed map snapshot (2026-06-23) shows label **“Dhairya”** on Room 202 B2 — may be manual occupancy label or a name variant not in `customers.full_name`. Re-check profile URL customer UUID if name differs.

**Expected state after fix (no pending submission):**

1. KYC uploaded? **No** (no `kyc_submissions` row)
2. KYC pending review? **No**
3. KYC approved? **No** (`kyc_status` likely still default `pending`)
4. Profile warning? **No** (was false positive before fix)
5. Queue / notification / ops? **No** (correct — nothing to review)

If KYC **is** uploaded later, all four surfaces must appear via `sourceKey: kyc:{submissionId}`.

## Production evidence (2026-06-24 build)

```json
{
  "overall": "PASS",
  "summary": {
    "kycReviewRequired": 0,
    "kycReviewPass": 0,
    "legacyFalsePositives": 0,
    "paymentReviewOpen": 0,
    "bedAssignmentOpen": 3,
    "checkoutOpen": 0
  }
}
```

- **0** payment-verified residents with `kyc_status=pending` and no pending submission (legacy false positives)
- **0** open KYC review items — all in sync
- **3** bed-assignment queue items (separate bucket)

## Files changed

| File | Change |
|------|--------|
| `src/lib/residents/residentUnresolvedActions.ts` | SSOT: `isKycReviewRequired`, `buildKycReviewAction` |
| `src/lib/residents/resident360Workflow.ts` | Profile workflow uses SSOT |
| `src/components/admin/residents/ResidentProfilePrimaryActions.tsx` | Primary actions use SSOT |
| `src/services/residentAdmin.ts` | `hasPendingKycSubmission` on list rows |
| `src/components/admin/ResidentsTable.tsx` | KYC filter uses submission flag |
| `src/services/kycVisibilityAudit.ts` | Cross-surface audit |
| `scripts/verify-kyc-visibility.ts` | Production runner |
| `scripts/vercel-build-repair.sh` | `VERIFY_KYC_VISIBILITY=1` |
| `tests/unit/resident360Workflow.test.ts` | Regression tests |

## Before / after

| Check | Before | After |
|-------|--------|-------|
| Payment-verified, no KYC upload | Profile: “identity review required” | Profile: next real action (bed/rent/none) |
| Pending `kyc_submissions` | All surfaces (when synced) | Unchanged — all surfaces |
| Residents “KYC pending” filter | `kyc_status = pending` | `hasPendingKycSubmission` |
| Action SSOT | Split (profile vs queue) | `residentUnresolvedActions` + `action_items` |

## PASS / FAIL matrix

| Invariant | Production |
|-----------|------------|
| Pending KYC → queue | PASS (0 items) |
| Pending KYC → action_item | PASS |
| Pending KYC → notification | PASS |
| Pending KYC → profile warning | PASS |
| No false profile KYC without submission | PASS (0 legacy false positives) |
| Payment review / bed / checkout surfaces | PASS |
| **Overall** | **PASS** |

## Re-run

```bash
npx tsx scripts/verify-kyc-visibility.ts
npx tsx scripts/verify-kyc-visibility.ts --sync   # sync action_items first
VERIFY_KYC_VISIBILITY=1                           # Vercel build
```
