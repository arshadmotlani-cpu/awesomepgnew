# Automotive Capital — production sign-off

Use this checklist for **CAP-P0-1** and **CAP-P0-2** on [invest.awesomepg.in](https://invest.awesomepg.in).

## Environment (CAP-P0-2)

- [ ] `INVEST_DATABASE_URL` set in Vercel Production (distinct from PG and Hair)
- [ ] `AUTH_SECRET` matches monorepo deploy
- [ ] Admin password rotated after first deploy (see [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md))
- [ ] Preview vs Production env parity reviewed

## Scripted smoke (CAP-P0-1)

Run locally against production host with invest DB URL (read-only queries only where noted):

1. Login as admin → Dashboard loads (Current Position, Attention queues)
2. Vehicles → open one asset → Overview lifecycle tab matches `ac_asset_status`
3. Recorded sale (if test asset): Profit tab read-only; mode matches ADR-018
4. Reports → monthly profit chart renders without console errors
5. Reconcile one vehicle: TVI = token + purchase payments + external activities (see [`reconciliation/`](./reconciliation/))

## Documentation (CAP-P1-2)

- [ ] [`README.md`](./README.md) status reflects shipped product (not “planning only”)
- [ ] [`TASKS.md`](./TASKS.md) aligned with [`CHANGELOG.md`](./CHANGELOG.md)

## Sign-off

| Field | Value |
|-------|--------|
| Date | |
| Operator | |
| Invest DB host | |
| Result | PASS / FAIL |
| Notes | |
