# Production Audit Baseline

**Generated:** Wave A implementation — unified production verification harness.

**Baseline commit:** `7ed11c2` on `main`

## Purpose

Single deploy gate aggregating financial, deposit, checkout, counter parity, ops badge, and notification checks.

## Admin UI

- **URL:** `/admin/system/production-audit`
- **Service:** `src/services/productionAudit.ts`

## CLI

```bash
npx tsx scripts/run-production-health-audit.ts
npx tsx scripts/production-issues-audit-report.ts
npx tsx scripts/billing-readiness-report.ts
npx tsx scripts/audit-open-unresolved-actions.ts
```

## Gates

| Gate | Source | Pass criteria |
|------|--------|---------------|
| Financial Integrity | `runFinancialHealthAudit` | `hasMismatch: false` |
| Invoice Integrity | SQL checks | No overpaid/partial anomalies |
| Occupancy Integrity | `runBedAudit` | Zero ghost/double assignments |
| Notification Integrity | `notificationEngine` | Inbox count = unread count |
| Vacating Integrity | `runVacatingAudit` | No pipeline issues |
| SSOT Integrity | Combined financial + invoice | All aligned |
| Deposit Integrity | `runDepositAudit` (10-sample) | No ledger drift |
| Checkout Pipeline | `runCheckoutAudit` | No orphan/missing settlements |
| Counter Parity | `runCounterParityAudit` | Overview = destination totals |
| Operations Badge | Ops queue vs sidebar | Badge = `allQueueCount` |
| Notification Parity | Payment review artifacts | No stale rows |

## Local verification note

Local `DATABASE_URL` may be empty in `.env.production.local`. Run against production by pulling Vercel env:

```bash
vercel env pull .env.production.local --environment=production
npx tsx scripts/run-production-health-audit.ts
```

## Angatra deposit investigation

```bash
npx tsx scripts/investigate-angatra-deposit.ts
npx tsx scripts/repair-angatra-deposit.ts  # append-only repair
```

Service equivalent: `auditDepositByLookup(session, { phone: '7074754939' })`

## Wave rollout

After each implementation wave, re-run production audit and document any new failures here.
