# Deployment checklist

Use this list before every production deploy. Full audit: `/admin/system/health-report`. Quick gate: `/admin/health`.

## Pre-deploy

- [ ] `npm run db:migrate` — latest migration applied on target database
- [ ] `npm test` — all unit + integration tests pass (0 failures)
- [ ] `npm run build` — clean production build locally or on staging
- [ ] Env vars set on Vercel/host (see below)
- [ ] Staging smoke pass → then production

## Required environment variables (production)

```
AUTH_SECRET=...
CRON_SECRET=...
BLOB_READ_WRITE_TOKEN=...
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_APP_URL=https://www.awesomepg.in
```

Staging/dev mock payments:

```
MOCK_WEBHOOK_SECRET=...
```

## Build commands

| Context | Command |
|---------|---------|
| Local | `npm run build` |
| Vercel | `vercel-build` → `npm run db:migrate && next build` |

## Post-deploy ops (production DB + crons)

Neon-linked `DATABASE_URL` values are **not** exported by `vercel env pull` — use Neon dashboard or Vercel runtime.

```bash
# Trigger deployed crons (needs CRON_SECRET from Vercel → Settings → Environment Variables)
CRON_SECRET=… npx tsx scripts/post-deploy-ops.ts

# Direct DB (paste DATABASE_URL from Neon, or run in Vercel → Deployments → … → Functions shell)
npx tsx scripts/expire-fixed-stays-now.ts          # backfill overdue fixed stays
npx tsx scripts/audit-financials.ts                # full integrity scan → audit-output-*.json
npx tsx scripts/repair-financials.ts --dry-run     # preview auto-repairs
npx tsx scripts/repair-financials.ts               # apply safe repairs (append-only ledger)
```

After deploy, run **expire-fixed-stays** once so bookings past 11 AM IST checkout complete immediately (daily automation cron at 06:00 UTC is the ongoing safety net; manual route remains for backfill).

## Post-deploy smoke (~10 min)

| Flow | Steps |
|------|-------|
| Admin health | Open `/admin/health` — all smoke checks PASS |
| Booking wizard | Pick bed → plan → dates → review → `/booking/new` params correct |
| Mobile date picker | Edit opens calendar above bottom sheet (z-index) |
| Booking | Create → pay → admin approve → confirmed |
| Deposit | Check-in → collect → deduct → refund → balances correct |
| Vacating | Request → complete → `deposit_settlements` row |
| Payment links | Resident A opens own link; Resident B blocked |
| PG scope | Scoped admin denied on other PG bed map action |
| Mock webhook | Unsigned POST → 401; no payment row |
| Fixed-stay dates | 7-night stay with distant reservation → no false warning |
| Extension | Prior checkout +1 day suggested check-in prefills correctly |

## Automated checks

```bash
npm test
npm run test:e2e          # optional; set BASE_URL for remote target
npm run docs:check
```

## Rollback

1. Revert deploy in Vercel (or redeploy previous production build)
2. If schema migrated forward, do **not** roll back migrations without operator review
3. Re-run `/admin/health` after rollback

## References

- Full system audit: `/admin/system/health-report`
- Security smoke flows: `docs/AWESOME_PG_MASTER_DOCUMENTATION_V2.md` Part 16
- Admin guide: `/admin/guide` (Security & deploy category)
