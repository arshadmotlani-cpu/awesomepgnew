# Production readiness — manual sign-off

Record PASS/FAIL and operator initials. Linked runbooks:

- PG P0: [`PG_P0_VERIFICATION_RUNBOOK.md`](./PG_P0_VERIFICATION_RUNBOOK.md)
- Hair RC: [`../qa/hair-rc/README.md`](../qa/hair-rc/README.md)
- Capital: [`../automotive-capital/PRODUCTION_SIGNOFF.md`](../automotive-capital/PRODUCTION_SIGNOFF.md)

## MV-1 — PG production DB (PG-P0-2)

| Step | Pass | Fail | Notes |
|------|------|------|-------|
| `npx tsx scripts/verify-production-p0.ts` | ☐ | ☐ | |
| Auth TTL ≥60d | ☐ | ☐ | |
| Stabilization audit script | ☐ | ☐ | |
| FINDINGS_SIGNOFF updated | ☐ | ☐ | |

**Operator / date:** _______________

## MV-2 — Vacating / checkout (PG-P0-3)

| Step | Pass | Fail | Notes |
|------|------|------|-------|
| Admin map vs resident portal (vacating) | ☐ | ☐ | |
| Checkout settlement completes | ☐ | ☐ | |
| No duplicate bed assignment | ☐ | ☐ | |

**Operator / date:** _______________

## MV-3 — Occupancy parity spot-check

| Step | Pass | Fail | Notes |
|------|------|------|-------|
| 5 beds admin vs public label | ☐ | ☐ | |
| Booking on public “available” bed | ☐ | ☐ | |

**Operator / date:** _______________

## MV-4 — Hair ERP RC

```bash
npm run hair:db:migrate && npm run hair:db:seed
node --import tsx --test tests/hair/integration/rcVisitLoop.test.ts
HAIR_DEV_HOST=1 npm run test:e2e:hair
```

| Gate | Pass | Fail | Notes |
|------|------|------|-------|
| Integration 14/14 | ☐ | ☐ | |
| Playwright 20/20 | ☐ | ☐ | |
| fyhair host `/loyalty` | ☐ | ☐ | |

**Operator / date:** _______________

## MV-5 — Capital OS

| Step | Pass | Fail | Notes |
|------|------|------|-------|
| Login → Dashboard | ☐ | ☐ | |
| Vehicle lifecycle | ☐ | ☐ | |
| Reports charts | ☐ | ☐ | |
| One vehicle reconciliation | ☐ | ☐ | |

**Operator / date:** _______________

## MV-6 — APG OS Admin smoke

| Step | Pass | Fail | Notes |
|------|------|------|-------|
| `/admin/login` | ☐ | ☐ | |
| Post-login sidebar brand | ☐ | ☐ | |
| `/admin/operations` loads | ☐ | ☐ | |

**Operator / date:** _______________
