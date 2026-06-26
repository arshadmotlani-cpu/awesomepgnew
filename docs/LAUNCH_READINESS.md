# Launch Readiness

**Phase 16** — Capacity planning and owner sign-off.

## Production readiness verdict

| Gate | Requirement | Tool |
|------|-------------|------|
| Financial | Zero mismatch | `/admin/system/financial-audit` |
| System health | `allPass` | `/admin/system/health-report` |
| Operations | Badge = queue | `production-issues-audit-report.ts` |
| Billing | READY | `billing-readiness-report.ts` |
| Security | Checklist complete | `SECURITY_VERIFICATION.md` |
| Journey | Happy path | `RESIDENT_JOURNEY_CHECKLIST.md` |

## Scale breakpoints

| Residents | First pressure point | Mitigation |
|-----------|---------------------|------------|
| 10 | Manual ops OK | — |
| 50 | Action sync latency | Cron + overview Sync (layout sync removed) |
| 100 | Financial audit query time | Indexes on `action_items`, `unresolved_actions` |
| 500 | Neon compute, function duration | Pagination on resident/invoice lists |
| 1000 | `notifications` table size | Archive read notifications; index `dedupe_key` |

## What breaks first

1. **Duplicate logic drift** — if surfaces bypass `residentFinancialEngine`
2. **Ops queue stale rows** — if sync cron fails silently
3. **Checkout settlements backlog** — manual admin review at scale
4. **Push delivery** — VAPID expiry / subscription churn

## Post-launch backlog (not blocking)

- Resident installable PWA
- Command palette / global search v2
- `creditsPaise` wallet line in RFE
- Full E2E Playwright suite

## On-call runbook

```bash
# Daily health
npx tsx scripts/run-production-health-audit.ts

# Ops badge parity
npx tsx scripts/production-issues-audit-report.ts

# Stale actions cleanup
npx tsx scripts/audit-open-unresolved-actions.ts --fix

# Financial emergency rebuild
# Admin UI: /admin/system/recalculate-financial
```

## Owner sign-off

| Item | Signed |
|------|--------|
| Money figures match everywhere | |
| One ops queue | |
| Checkout/refund path clear | |
| Mobile usable for daily approvals | |
| Ready for 50+ residents | |
