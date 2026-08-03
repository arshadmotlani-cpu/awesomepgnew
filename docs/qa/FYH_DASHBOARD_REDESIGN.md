# FYH Dashboard Redesign + Capital Dashboard Fix

Generated: 2026-08-03

## Part 1 — Investment OS (`invest.awesomepg.in/dashboard`) crash

### Root cause

Client-side `TypeError` when chart components accessed `.length` or `.map` on **undefined** series props during first render of `OverviewDashboard`.

Primary crash site: `HoldingLineChart` / `CountBarChart` in `src/capital/components/charts/AnalyticsCharts.tsx`.

### Fix

- `normalizeAnalyticsBundle()` in `src/capital/services/analytics.ts`
- `chartRows()` helper in chart components
- Safe access in `OverviewDashboard.tsx`
- Tests: `tests/capital/unit/analyticsBundle.test.ts`

### Regression risk

Low — empty chart states render instead of crashing.

---

## Part 2 — FYH Premium Dashboard OS

### Architecture

- Dashboard nav group: `/dashboard/revenue`, `/dashboard/staff-performance`
- `/landing` → role-based redirect
- `/billing` → `/billing/invoices`

### Performance

One SSR `Promise.all` per page; Recharts client-only.

### Tests

```bash
npx tsx --test tests/capital/unit/analyticsBundle.test.ts
npx tsx --test tests/hair/unit/revenueDashboard.test.ts
```
