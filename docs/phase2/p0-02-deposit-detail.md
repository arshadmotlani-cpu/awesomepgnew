# P0-2 — Admin Deposit Detail Page

**Route:** `/admin/deposits/[bookingId]`  
**Status:** ✅ Presentation redesign complete

---

## Target structure (implemented)

| Section | Contents |
|---------|----------|
| **1. Deposit summary** | Required · Collected · Refundable · Status (+ sync warning if needed) |
| **2. Correct deposit** | Required · Collected · Reason · Save changes |
| **3. Deposit activity** | Collect · Charge against · Refund (existing server actions) |
| **4. Deposit settlement** | Existing workflow, plain-language labels |
| **5. Advanced tools** | Rebuild wallet · Cancel invoice · Ledger reconcile (collapsed) |

---

## Action count

| | Before | After (visible) |
|---|--------|-----------------|
| Summary stat groups | 5 metrics + separate status badges | 4 metrics in one card |
| Duplicate status badges | Page header row + summary | Summary only |
| Customer refund notice | Shown on admin page | Removed (resident-facing) |
| Correct deposit | 1 submit | 1 submit |
| Activity forms | 3 submits | 3 submits (unchanged backend) |
| Settlement | 2 submits + 3 duplicate stat cells | 2 submits |
| Advanced | 5+ actions visible | Collapsed by default |

**Primary visible actions:** 3 activity + 1 correct save + 2 settlement = 6 form actions across named sections (advanced hidden).

---

## Business logic unchanged

- `loadDepositPageData` — not modified
- `correct-summary` API route — not modified
- `actions.ts` (add/deduct/refund/correct) — not modified
- `settlementActions.ts` — not modified
- `deposit-wallet-actions.ts` — not modified
- Permissions — unchanged (existing page guards)
