# PG P0 production verification runbook

Operational steps for **PG-P0-2** and **PG-P0-3** (Awesome PG www). Code fixes from Production Stabilization are largely merged; this runbook validates production after deploy.

## Prerequisites

- `.env.prod.live` at repo root (gitignored) with production `DATABASE_URL`
- Operator access to admin + resident flows on www.awesomepg.in

## PG-P0-2 — Database audit

```bash
npx tsx scripts/verify-production-p0.ts
```

Expected artifacts:

- Auth/session TTL checks (env)
- `scripts/production-stabilization-audit.ts` completes on production URL
- Room 203 / Shantinagar spot checks per script output

Record PASS/FAIL lines in [`FINDINGS_SIGNOFF.md`](./FINDINGS_SIGNOFF.md) under “Production verification run”.

## PG-P0-3 — Vacating / checkout ops

After a successful P0-2 run and deploy:

1. Pick one **approved vacating** resident (non-prod test account if available).
2. Confirm admin bed map state matches resident portal (notice / checkout pending).
3. Complete checkout settlement path; confirm bed returns to bookable state after turnover buffer.
4. Confirm no duplicate active assignment on the same bed (ghost booking audit clean).

Sign off in `FINDINGS_SIGNOFF.md` with date and operator initials.

## Occupancy SSOT (PG-P0-1)

Engine path: `bedOccupancyResolve` + `bedOccupancyEngine`. Parity regression: `tests/unit/bedOccupancyAdminPublicParity.test.ts`.

Remaining SQL loader consolidation is tracked in [`OCCUPANCY_PHASE0_STATUS.md`](./OCCUPANCY_PHASE0_STATUS.md).

## Operations Center (PG-P0-4)

Deferred until product approval — see [`OPERATIONS_CENTER_AUDIT.md`](../OPERATIONS_CENTER_AUDIT.md).
