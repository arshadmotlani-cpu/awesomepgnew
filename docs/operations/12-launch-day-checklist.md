# Room OS Launch Day Checklist

Hour-by-hour timeline from T-24h through T+24h for Room OS production cutover.

**Prerequisites:** Migrations 0132–0138 applied; code deployed; flags **off**; sign-off audit 90/100 complete.

---

## T-24 hours — Pre-launch validation

- [ ] Confirm production deploy is latest main with Room OS hardening
- [ ] Verify migrations 0132–0138 applied (`npm run db:migrate` status or DB inspection)
- [ ] Run full smoke suite per [08-smoke-tests.md](./08-smoke-tests.md)
- [ ] Production audit at `/admin/system/production-audit` — all gates PASS or acceptable warnings
- [ ] Confirm `CRON_SECRET` set; cron running every 5 min
- [ ] Outbox: `deadLetter = 0`, `pending ≤ 50`
- [ ] Notify stakeholders of launch window
- [ ] Assign roles: launch lead, on-call, QA verifier

---

## T-4 hours — Staging final gate

- [ ] Staging: enable `ROOM_OS_OPERATIONS_QUEUE=1`
- [ ] Staging: enable `ROOM_OS_BILLING_CENTRE=1`
- [ ] Complete [09-manual-qa-checklist.md](./09-manual-qa-checklist.md) on staging
- [ ] Staging cert wave 6 PASS
- [ ] Document any warn findings with acceptance rationale

---

## T-1 hour — Go/no-go

- [ ] Review staging QA sign-off
- [ ] Confirm rollback procedure tested ([05-rollback-procedure.md](./05-rollback-procedure.md))
- [ ] On-call available for 4 hours post-cutover
- [ ] **Go/no-go decision:** GO / NO-GO (launch lead sign-off)

---

## T-0 — Production flag cutover (Operations Centre)

**Order:** Operations queue first, billing second.

### Step 1: Enable operations queue

- [ ] Set `ROOM_OS_OPERATIONS_QUEUE=1` in Vercel production env
- [ ] Redeploy or wait for env propagation (< 2 min)
- [ ] Verify Operations Centre loads
- [ ] Check shared tabs: rent due, overdue, electricity
- [ ] Run ops parity audit:

```bash
DATABASE_URL=<prod> npx tsx scripts/run-room-os-ops-parity-audit.ts
```

- [ ] Production audit gate `room_os_ops_parity` PASS

**If FAIL:** Execute rollback immediately; stop launch.

---

## T+30 min — Production flag cutover (Billing Centre)

- [ ] Set `ROOM_OS_BILLING_CENTRE=1` in Vercel production env
- [ ] Verify Billing Centre collections load
- [ ] Spot-check 3–5 collection items for amount/room correctness
- [ ] No duplicate rows vs pre-cutover counts

**If FAIL:** Set `ROOM_OS_BILLING_CENTRE=0`; operations queue may remain on if healthy.

---

## T+1 hour — First health check

- [ ] Cron drain: `deadLetter = 0`
- [ ] Materialization ages < 6 h
- [ ] No elevated error rate in application logs
- [ ] Admin payment approve/reject still works (Payment SSOT path)
- [ ] Browser console clean on Operations Centre and Billing Centre

---

## T+4 hours — Extended monitoring

- [ ] Outbox pending stable or decreasing
- [ ] No sustained `live_fallback` on property/work queue reads
- [ ] Cert wave 6 on production (optional if morning launch)

```bash
DATABASE_URL=<prod> npm run cert:room-os-wave6
```

---

## T+24 hours — Launch closeout

- [ ] Daily monitoring checklist complete ([06-monitoring-dashboard.md](./06-monitoring-dashboard.md))
- [ ] Ops parity audit PASS
- [ ] Materialization audit PASS (no fail on ages)
- [ ] Document launch outcome: SUCCESS / PARTIAL / ROLLBACK
- [ ] Update team on status
- [ ] Schedule weekly cert run in ops calendar

---

## Rollback triggers (any time)

Execute [05-rollback-procedure.md](./05-rollback-procedure.md) if:

- Ops parity audit FAIL with flags on
- Wrong resident/amount data reported by ops team
- Dead-letter count > 0 and growing
- Sustained materialization fail (> 24 h age) with user impact

Rollback is **instant** (env var change, no code deploy required).

---

## Launch sign-off

| Milestone | Lead | Time | Result |
|-----------|------|------|--------|
| T-24h validation | | | |
| T-4h staging QA | | | |
| T-0 ops queue cutover | | | |
| T+30m billing cutover | | | |
| T+24h closeout | | | |

---

## Post-launch (not launch blockers)

Document for future ops cycles:

- Workflow UI wiring to Room OS workflow API (admin payments still use Payment SSOT)
- Optional `ROOM_OS_WORKFLOW` flag when workflow UI is ready
- Timeline/integrity consumer rollout

See [04-feature-flag-rollout.md](./04-feature-flag-rollout.md) for staged rollout details.
