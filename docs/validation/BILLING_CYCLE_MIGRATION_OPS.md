# Billing cycle migration — admin ops (post-deploy)

Code is deployed. **Do not bulk-migrate.** Use `/admin/billing/cycle-migration` per resident.

## All other residents (billing day 1)

- Status: `eligible` with **no transition preview**
- Action: Expand row → **Migrate to 1st-of-month** with **Create transition invoice unchecked**
- Expected: policy → `calendar_month_1st`, billing day 1, no new charges

## Syed Ahmed (APG-2026-0090)

Production read-only (pre-migrate):

- Paid through: **2026-07-28** (Jul anniversary invoice)
- Transition preview: **₹349** for **2026-07-29 → 2026-07-31** (3 days; user brief cited ₹233 — verify against checkout if disputing)
- After migrate (new code): **August standard invoice** auto-created if uncovered; first cron **2026-09-01** for September

Steps:

1. Generate transition bill (if not already present)
2. Resident pays transition bill (or admin marks paid per existing workflow)
3. Migrate to 1st-of-month (optionally create transition on migrate if not done)
4. Confirm August `standard` invoice exists with due date
5. Re-run: `USE_PRODUCTION_DB=1 npx tsx scripts/verify-billing-cycle-migration-production.ts`

## Saswat Baral (APG-2026-0094)

Production read-only (pre-migrate):

- Check-in **2026-08-08**, anniversary **day 8**, paid through **2026-08-12**
- Transition preview: **₹2,526** for **2026-08-13 → 2026-08-31**
- Sep 1 cron: **skipped** (first auto not yet Sep 1 on old profile); after migrate + paid transition, **already_covered** gate prevents duplicate September bill when paid-through extends through covered period

Steps:

1. Generate transition bill for Aug 13–31
2. Collect payment
3. Migrate to calendar_month_1st
4. Confirm **no duplicate September standard invoice** on next Sep 1 cron (re-run verification script `cronEligibilitySep`)

## Verification

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/verify-billing-cycle-migration-production.ts --markdown
```

See full resident table: [BILLING_CYCLE_MIGRATION_PRODUCTION.md](./BILLING_CYCLE_MIGRATION_PRODUCTION.md)
