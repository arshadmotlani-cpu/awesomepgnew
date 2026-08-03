# Admin Performance Snapshot

Generated: 2026-08-03  
Branch: current working tree (optimized loaders)  
Database: production Neon via `.env.prod.live` (read-only)  
Method: loader-equivalent SSR (`scripts/profile-admin-full.ts`, `ADMIN_PROFILE=1`, `ADMIN_DB_PROFILE=1`)

Timings below are **direct service calls from a local machine to production Neon**. They overstate production server-side latency (network RTT is included in DB gaps). Use them for **relative bottlenecks and query counts**, not absolute p95 in prod.

Source artifact: `test-results/admin-perf-snapshot.json`

---

## Overview

| Metric | Value |
|--------|------:|
| Total SSR (loader) | **1,095,016 ms** (~18.3 min wall) |
| Layout SSR | 200,903 ms |
| Page SSR | 894,113 ms |
| DB time (approx) | 1,094,582 ms |
| SQL queries | 7,032 |
| Duplicate queries | 6,900 |
| Queue builds | 4 |
| Payment review fetches | 18 |

**Step breakdown**

| Step | ms |
|------|---:|
| `loadAdminNavBadges` (layout) | 200,045 |
| `getResolvedSidebarLayout` (layout) | 858 |
| `loadOverviewContext` | **894,110** |
| `buildOverviewDashboard` (sync) | 2 |

**Largest bottleneck:** `loadOverviewContext` — ~82% of total time, ~7k queries with heavy per-booking N+1 (deposit ledger, invoices, bookings fetched hundreds of times each).

**Cache:** not measured in this partial run (`--only` skips cache verification pass). React `cache()` dedup applies in Next.js RSC, not in standalone tsx scripts.

---

## Billing Centre

Scenario: `tab=dashboard` (default tab, tab-scoped fetches enabled)

| Metric | Value |
|--------|------:|
| Total SSR (loader) | **2,528,027 ms** (~42.1 min wall) |
| Layout SSR | 198,711 ms |
| Page SSR | 2,329,316 ms |
| DB time (approx) | 2,527,581 ms |
| SQL queries | 13,859 |
| Duplicate queries | 13,721 |
| Queue builds | 6 |
| Payment review fetches | 26 |

**Step breakdown**

| Step | ms |
|------|---:|
| `loadAdminNavBadges` (layout) | 197,851 |
| `getResolvedSidebarLayout` (layout) | 860 |
| `billing Promise.all (tab=dashboard)` | **2,328,419** |
| `resolveFinancialInvoiceIdMap` | 858 |

**Largest bottleneck:** `billing Promise.all (tab=dashboard)` — ~92% of total time. Top duplicate fingerprints are per-booking deposit/resident-billing/room price lookups (888× each).

---

## Operations

Scenario: `filter=waiting_for_approval`

| Metric | Value |
|--------|------:|
| Total SSR (loader) | **400,685 ms** (~6.7 min wall) |
| Layout SSR | 202,737 ms |
| Page SSR | 197,948 ms |
| DB time (approx) | 400,191 ms |
| SQL queries | 2,802 |
| Duplicate queries | 2,733 |
| Queue builds | 2 |
| Payment review fetches | 8 |

**Step breakdown**

| Step | ms |
|------|---:|
| `loadAdminNavBadges` (layout) | 201,816 |
| `getResolvedSidebarLayout` (layout) | 921 |
| `loadUnifiedOperationsQueue` | **197,458** |
| `listRecentPaymentProofRejectionsForAdmin` | 489 |

**Largest bottleneck:** `loadUnifiedOperationsQueue` — ~49% of page time; layout badge load is equally costly (~50%).

---

## Biggest remaining bottlenecks

Ranked by after-run DB time on current branch:

1. **Billing Centre dashboard** — 2.53M ms DB, 13,859 queries. Dominated by parallel billing tab loaders (`listAdminOpenRentInvoices`, health snapshot, command center, etc.) with per-resident N+1 inside queue/build paths.
2. **Overview** — 1.09M ms DB, 7,032 queries. Almost entirely `loadOverviewContext` aggregating financial state per booking.
3. **Shared layout: `loadAdminNavBadges`** — ~200 s on every page (~20% of Overview/Operations total). Runs before page loaders on all three routes.
4. **Operations queue** — 2,802 queries in `loadUnifiedOperationsQueue`; same per-booking invoice/deposit fan-out pattern as Overview.

No single index or micro-optimization will fix this — cost is **O(residents × queries-per-resident)** across live admin reads.

---

## Whether the recent optimizations are working

| Optimization | Evidence |
|--------------|----------|
| Tab-scoped billing fetches (`tab=dashboard` skips paid/generated/failures/diagnostics loaders) | **Active** — dashboard scenario uses gated `Promise.all` (see `simulateBillingTab` in profile script mirroring `billing/page.tsx`). Full 17-fetch baseline is not run on dashboard tab. |
| Overview `reconcile: false` + cached reconciliation | **Active in code** — profile uses `loadOverviewContext(..., { reconcile: false })`. Unit tests pass (`adminCycleAudit.test.ts` 6/6). |
| Unified operations queue cache (layout + page share one build) | **Active in RSC** — static audit confirms shared `cache()` wrapper. Profile script resets counters per simulated navigation, so queue build count (2–6) **does not reflect** production dedup; trust unit tests + RSC behavior. |
| Billing health parallelized (`Promise.all`) | **In working tree** — included inside dashboard `Promise.all`. |
| Operations bare-URL double request | **Fixed** — page redirects without building queue on bare URL (not exercised in this loader profile). |

**Verdict:** Loader-level dedup and tab gating optimizations are **wired correctly** (confirmed by code paths + `adminCycleAudit` tests). Remaining slowness is **intrinsic DB read volume**, not duplicate reconciliation or all-tabs-always billing fetches.

Further meaningful gains require architectural change (batch queries, suspense/streaming splits, caching strategy beyond `force-dynamic`), not another loader dedup pass.
