# Security Remediation Report — Awesome PG

**Date:** 2026-06-13  
**Status:** Implemented — deploy after `npm run db:migrate`

---

## Executive Summary

All Priority 0–2 findings from the hostile security audit were remediated. The mock payment webhook can no longer be exploited in production. Deposit refunds are serialized through a single settlement service with row locks, idempotency keys, and balance validation. Multi-tenant PG scoping is enforced on financial admin mutations. Payment links require resident authentication. Production boot fails when critical secrets are missing or insecure.

**Test suite:** 322/322 unit tests passing.

---

## Before / After Architecture

### Before

- Forged `POST /api/webhooks/mock` → `recordPaymentSuccess` → booking confirmed (no auth).
- Multiple refund paths called `recordDepositRefunded` without transactions or locks.
- Empty `pgScope` granted unrestricted admin access.
- Payment links exposed resident PII to anonymous users.

### After

- Production: `/api/webhooks/mock` returns **404**.
- Non-production: HMAC (`MOCK_WEBHOOK_SECRET`) + timestamp window + `webhook_replay_guard`.
- All deposit refunds flow through `depositSettlement.ts` (transaction, `FOR UPDATE`, idempotency, audit).
- `adminCanAccessPg`: only `super_admin` is unrestricted; others require explicit PG membership.
- Financial admin actions call `assertAdmin*Access` helpers.
- Payment links require customer session matching `link.residentId`.
- Offline booking confirmation requires full amount or super_admin override with audit reason.
- `assertProductionBootSecrets()` blocks production boot without required secrets.

---

## Findings Remediation

| # | Finding | Fix |
|---|---------|-----|
| P0-1 | Mock webhook exploit | 404 in production; HMAC; replay guard |
| P0-2 | Deposit refund races | Canonical `depositSettlement.ts` |
| P1-3 | Empty `pgScope` bypass | Deny when scope empty |
| P1-4 | Missing PG scope | `pgAccess.ts` guards on all financial actions |
| P1-5 | Payment link exposure | Session + resident match; no phone on page |
| P1-6 | Offline underpayment | Amount match or `payments:override` + reason |
| P1-7 | Over-refund | Balance validation in settlement service |
| P2-8 | Audit trail | Migration `0052_security_hardening` |
| P2-9 | Migration test | Dynamic latest tag assertion |
| P2-10 | Production hardening | Boot fails on missing secrets |
| Cleanup | Dead code | Removed unused Razorpay UI/helpers |

---

## Deploy Checklist

1. `npm run db:migrate`
2. Production env: `AUTH_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `PAYMENT_PROVIDER=razorpay` + Razorpay keys
3. Dev/CI: `MOCK_WEBHOOK_SECRET` (≥16 chars) for mock webhook scripts

---

## Risk Assessment (Post-Remediation)

| Area | Before | After |
|------|--------|-------|
| Payment forgery | Critical | Low |
| Deposit double-refund | High | Low |
| Cross-PG admin abuse | High | Low |
| Payment link leak | Medium | Low |
| Offline underpayment | Medium | Low |
| Production misconfig | Medium | Low |
