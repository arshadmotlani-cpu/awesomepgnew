# Admin Performance Investigation — Production 504 Timeout

**Incident:** `/admin/overview` returned `504 GATEWAY_TIMEOUT` / `FUNCTION_INVOCATION_TIMEOUT` while resident pages worked.

**Root commit:** `045ce00` — Payment proof rejection + approval SSOT rebuild.

**Fix commits:** `0bfb293`, follow-up perf hardening (local, not deployed).

---

## Root cause (proven)

### Infinite recursion

`getOperationsCenterData` was changed to call `loadApprovalQueueSnapshot`, which calls `loadUnifiedOperationsQueue`, which calls:

```
loadResidentOperationsResidentsPage
  → loadResidentOperationsDashboard
    → getOperationsCenterData  ← cycle
```

**Evidence:** `scripts/profile-admin-overview.ts` on broken code → `RangeError: Maximum call stack size exceeded`.

### Amplifiers

| Issue | Impact |
|-------|--------|
| `syncActions: true` on overview page | Full `syncActionItems()` on every overview load |
| Duplicate queue loads | Layout badges + overview reporting + revenue each built queue |
| `getWaitingForApprovalCount` | Second full queue load in layout (pre-fix) |
| Sequential N+1 in `paymentProofQueue` | Per-proof `await` in loops |
| `syncActionItems` on operations/notifications/resident pages | Extra DB writes on render |

---

## Fixes applied

1. **Break recursion** — `getOperationsCenterData` uses `getPendingPaymentReviewsForRequest` only.
2. **React `cache` per request** — `getUnifiedOperationsQueueForRequest`, `getPendingPaymentReviewsForRequest`, `loadOverviewContext`.
3. **Single queue base build** — filter applied in memory; all filters share one base per request.
4. **Remove render-time sync** — overview, operations, notifications, resident profile.
5. **Revenue decoupled** — `getRevenueCommandCenterData` reads cached payment reviews, not full ops queue.
6. **Parallel proof enrichment** — `Promise.all` for QR rows and per-PG proof items.
7. **Profiling** — `ADMIN_PROFILE=1`, `scripts/profile-admin-full.ts`, build counters.

---

## Timing

| Step | Before (broken) | After (local, no DB) |
|------|-----------------|----------------------|
| `loadAdminNavBadges` | Stack overflow | ~8ms |
| Full overview SSR | Never completes | Completes (DB profiling needs `DATABASE_URL`) |

**Production target:** < 2s SSR, no function > 500ms unless justified.

Run on production DB:
```bash
ADMIN_PROFILE=1 DATABASE_URL=... npx tsx scripts/profile-admin-full.ts
```

---

## Request dedup (per `/admin/overview` request)

| Loader | Before | After |
|--------|--------|-------|
| `buildUnifiedOperationsQueue` base | 3–4× | **1×** (cached) |
| `fetchPendingPaymentReviews` | 3–5× | **1×** (cached) |
| `syncActionItems` | 1× on overview | **0×** (explicit Sync only) |
| WFA badge queue | 2× (layout) | **0× extra** (derived from cached queue) |

---

## Cycle audit (static tests)

`tests/unit/adminCycleAudit.test.ts` forbids:

- `getOperationsCenterData` → `loadApprovalQueueSnapshot` / `loadUnifiedOperationsQueue`
- Page renders → `syncActionItems()`
- Revenue → full ops queue for payment counts

---

## Regression coverage

Unit tests (41 passing in admin cluster):

- `adminCycleAudit.test.ts`
- `adminOverviewPerformance.test.ts`
- `operationsCenter.test.ts`
- `operationsQueueParity.test.ts`
- `approvalService.test.ts`

Build: `npm run build` — pass.

---

## Remaining technical debt

1. **Per-proof DB queries** — `buildRentReviewItem` / `buildElectricityReviewItem` still query invoice + financial ID per row (batch possible).
2. **`loadResidentOperationsResidentsPage` weight** — still loads dashboard + residents + audit in one queue build; acceptable with cache but heavy on cold cache.
3. **`loadApprovalQueueSnapshot`** — still builds filtered queue when called from integrity scripts (not SSR hot path).
4. **Production profile** — run `profile-admin-full.ts` against Neon with real data to confirm < 2s.

---

## Manual verification checklist (post-deploy)

- [ ] Admin login
- [ ] `/admin/overview` loads < 5s
- [ ] Operations / WFA / booking approval / KYC
- [ ] Billing Centre, Revenue, Refund Console
- [ ] Resident profile
- [ ] Sync now button still refreshes action items
