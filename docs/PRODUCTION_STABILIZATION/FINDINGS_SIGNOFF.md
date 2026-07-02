# Production Stabilization — Findings Sign-Off

**Date:** 2026-07-02  
**Plan:** Production Stabilization Phase (5 phases)  
**Constraint:** No database mutations during this investigation batch

---

## Deliverables

| Phase | Document | Status |
|-------|----------|--------|
| 1 — Auth & sessions | [PHASE1_AUTH_SESSION_FINDINGS.md](./PHASE1_AUTH_SESSION_FINDINGS.md) | Code audit complete; live DB pending |
| 2 — Electricity | [PHASE2_ELECTRICITY_FINDINGS.md](./PHASE2_ELECTRICITY_FINDINGS.md) | Validation plan + scripts; Room 203 data pending |
| 3 — Payment UX | [PHASE3_PAYMENT_UX_FINDINGS.md](./PHASE3_PAYMENT_UX_FINDINGS.md) | Decision: remove Pay All; **implemented** |
| 4 — UPI safety | [PHASE4_UPI_AUDIT_FINDINGS.md](./PHASE4_UPI_AUDIT_FINDINGS.md) | Code risk register; per-PG DB pending |
| 5 — Polish / SSOT | [PHASE5_OCCUPANCY_SSOT_APPROVAL_REQUEST.md](./PHASE5_OCCUPANCY_SSOT_APPROVAL_REQUEST.md) | Approval request issued |

**Tooling:** [`scripts/production-stabilization-audit.ts`](../scripts/production-stabilization-audit.ts) — read-only Phases 1, 2, 4 when `DATABASE_URL` is set (`USE_PRODUCTION_DB=1`).

---

## Master priority roadmap

### P0 — Critical

| Item | Phase | Next action |
|------|-------|-------------|
| Session cookie-clear on reject | 1 | Implementation PR |
| Auth SSOT / split identity | 1 | Run `/admin/system/auth-integrity` + repair |
| Room 203 electricity validation | 2 | Run trace scripts on production DB |
| UPI inventory all PGs | 4 | Run audit script on production DB |
| Occupancy SSOT Phase 0 | 5 | **Await approval** in PHASE5 doc |
| Harish checkout completion | 2 | Ops — unblock June validation |

### P1 — High

| Item | Phase |
|------|-------|
| Session env in DEPLOYMENT_CHECKLIST | 1 |
| Standard session 14–30d or remember-me policy | 1 |
| Pay All removed (misleading CTA) | 3 — **done** |
| UPI resolver SSOT | 4 |
| `ensureDefaultPaymentCategories` non-destructive | 4 |

### P2 — Medium

Session purge cron, per-device revoke, electricity E2E certification, dark-theme primitives, admin mobile pass.

### P3 — Nice to have

True batch Pay All checkout, customer `loading.tsx`, dead code cleanup.

---

## Verification performed

| Check | Result |
|-------|--------|
| Phase 1 code trace | Pass |
| Phase 3 Pay All code review | Pass — removed |
| Phase 4 default UPI constants | Documented |
| Production DB audit script | Created; **not run** (empty DATABASE_URL locally) |
| Unit tests | Run after code changes |

---

## Blockers for full sign-off

1. **DATABASE_URL** — Neon connection string required locally for `scripts/verify-production-p0.ts` (Vercel integration does not export via pull)
2. **Production repair** — after deploy, run Room 203 repair if Krishna still at ₹1,531: `npx tsx scripts/run-shantinagar-occupancy-ssot-repair.ts` (production DB)
3. **Occupancy SSOT** — code complete; production certification pending Neon access

---

## P0 implementation status (2026-07-02)

| P0 item | Code status | Production verify |
|---------|-------------|-------------------|
| Session cookie-clear on reject | **Implemented** | Pending deploy |
| Remember-device + 30d standard TTL | **Implemented** | Pending deploy |
| Room 203 checkout exclusion | **Fixed** (`roomElectricityOccupants.ts`) | Run repair script on prod |
| UPI non-destructive defaults + SSOT resolver | **Implemented** | Run audit on prod |
| Occupancy SSOT engine | **Complete** (prior phases) | Run `verify-production-p0.ts` |


## Approval

| Gate | Owner | Status |
|------|-------|--------|
| Investigation complete | Engineering | **Yes** |
| Safe to begin P0 implementation PRs | Product + Engineering | **Pending DB validation + SSOT approval** |

---

## Recommended next steps

1. Paste production `DATABASE_URL` into secure runner → execute audit script → append `AUDIT_REPORT.json` to this folder
2. Sign PHASE5 occupancy approval
3. Open P0 PRs: session cookie-clear, UPI resolver audit fixes
4. Complete Harish checkout → re-run Room 203 validation
