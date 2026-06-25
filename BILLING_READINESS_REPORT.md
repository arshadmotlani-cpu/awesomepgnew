# Billing Readiness Report

> Generated: 2026-06-25T20:53:07.840Z  
> Target: https://www.awesomepg.in  
> Duration: 919ms  
> Overall: **READY** (23 PASS · 3 WARN · 0 FAIL)

## Deployment

| Item | Value |
|------|-------|
| Production commit (runtime) | `8790834a9cfe550a4f6a540bca6761b530bdd5f1` |
| Local HEAD | `ref: refs/heads/main` |
| Latest migration (repo) | `0079_close_stale_invoice_review_ops` |
| Migrations applied (DB) | 76 |

## Scheduler status

- **PASS** Anniversary scheduler cron schedule: 30 18 * * * UTC (00:00 IST) in vercel.json
- **PASS** Next scheduler run: 2026-06-27T18:30:00.000Z
- **PASS** Billing health snapshot: Generated today 0, failures 0, pending approvals 0
- **PASS** Scheduler last run: success on 2026-06-26 created 0 failed 0

## Cron status

- **PASS** Anniversary scheduler cron schedule: 30 18 * * * UTC (00:00 IST) in vercel.json
- **PASS** Cron endpoint auth: CRON_SECRET configured on server

## Billing profiles

- **PASS** Monthly resident billing profiles: 4 auto-generate profiles, 0 missing cycle fields
- **PASS** Fixed-date residents excluded: All fixed_stay profiles have auto_generate=false

## Rent verification

- **PASS** Revenue rent reconciliation: generated 0 collected 0 pending 0 overdue 0
- **PASS** Rent E2E flow: 4 monthly residents · idempotent generator OK · no 2026-06-01 invoice required before anniversary run

## Electricity verification

- **PASS** Revenue electricity reconciliation: generated 0 collected 0 pending 0 overdue 0
- **WARN** Electricity latest batch split: No electricity batches in production
- **PASS** Electricity table electricity_bills: Present on production
- **PASS** Electricity table electricity_invoices: Present on production
- **PASS** Electricity equal split logic: ₹1,501 / 3 → ₹500.33 each + ₹0.01 remainder
- **PASS** Electricity pro-rata split logic: weighted shares 3750+3750+2500 + remainder 0 = 10000
- **PASS** Electricity occupied bed split (sample room): Room 202: 3 monthly occupant(s) eligible for split
- **PASS** Electricity invoice schema: 5/5 required columns present
- **PASS** Electricity notification wiring: notifyElectricityReminder available for bill fan-out reminders
- **PASS** Electricity payment flow wiring: UPI proof upload + webhook payment recording wired
- **WARN** Electricity latest batch reconciliation: No electricity batches yet — split logic verified statically only
- **PASS** Electricity verification runtime: Lightweight checks completed 2026-06-26 · 0 electricity proof(s) pending review

## Notification verification

- **WARN** Admin notifications: 0 rent batch notifications, 0 rent proofs awaiting approval
- **PASS** Electricity notification wiring: notifyElectricityReminder available for bill fan-out reminders

## Revenue verification

- **PASS** Revenue rent reconciliation: generated 0 collected 0 pending 0 overdue 0
- **PASS** Revenue electricity reconciliation: generated 0 collected 0 pending 0 overdue 0
- **WARN** Electricity latest batch reconciliation: No electricity batches yet — split logic verified statically only

## Resident billing verification

- **PASS** Resident billing verification: 4 auto-bill residents · 0 active invoices for 2026-06-01

## Full check list

| Status | Section | Detail |
|--------|---------|--------|
| PASS | Migration table resident_billing_profiles | Present on production |
| PASS | Migration table billing_generation_runs | Present on production |
| PASS | Migration table billing_generation_failures | Present on production |
| PASS | Anniversary scheduler cron schedule | 30 18 * * * UTC (00:00 IST) in vercel.json |
| PASS | Next scheduler run | 2026-06-27T18:30:00.000Z |
| PASS | Billing health snapshot | Generated today 0, failures 0, pending approvals 0 |
| PASS | Monthly resident billing profiles | 4 auto-generate profiles, 0 missing cycle fields |
| PASS | Fixed-date residents excluded | All fixed_stay profiles have auto_generate=false |
| PASS | Revenue rent reconciliation | generated 0 collected 0 pending 0 overdue 0 |
| PASS | Revenue electricity reconciliation | generated 0 collected 0 pending 0 overdue 0 |
| PASS | Scheduler last run | success on 2026-06-26 created 0 failed 0 |
| WARN | Admin notifications | 0 rent batch notifications, 0 rent proofs awaiting approval |
| PASS | Resident billing verification | 4 auto-bill residents · 0 active invoices for 2026-06-01 |
| PASS | Cron endpoint auth | CRON_SECRET configured on server |
| WARN | Electricity latest batch split | No electricity batches in production |
| PASS | Rent E2E flow | 4 monthly residents · idempotent generator OK · no 2026-06-01 invoice required before anniversary run |
| PASS | Electricity table electricity_bills | Present on production |
| PASS | Electricity table electricity_invoices | Present on production |
| PASS | Electricity equal split logic | ₹1,501 / 3 → ₹500.33 each + ₹0.01 remainder |
| PASS | Electricity pro-rata split logic | weighted shares 3750+3750+2500 + remainder 0 = 10000 |
| PASS | Electricity occupied bed split (sample room) | Room 202: 3 monthly occupant(s) eligible for split |
| PASS | Electricity invoice schema | 5/5 required columns present |
| PASS | Electricity notification wiring | notifyElectricityReminder available for bill fan-out reminders |
| PASS | Electricity payment flow wiring | UPI proof upload + webhook payment recording wired |
| WARN | Electricity latest batch reconciliation | No electricity batches yet — split logic verified statically only |
| PASS | Electricity verification runtime | Lightweight checks completed 2026-06-26 · 0 electricity proof(s) pending review |

---

## Can Awesome PG begin using automatic billing for real residents?

**YES**

Production verification completed with 23 passing checks and 3 non-critical warnings only. Rent generation treats existing and paid invoices as success; electricity verification uses lightweight logic checks without creating batches; scheduler, cron auth, billing profiles, revenue reconciliation, and resident billing visibility all passed. Automatic anniversary rent billing is safe to rely on for real monthly residents.
