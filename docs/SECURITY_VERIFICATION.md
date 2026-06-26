# Security Verification Checklist

**Phase 14** — Production hardening verification (see also `SECURITY_REMEDIATION.md`).

## Authentication & authorization

| Check | Verification |
|-------|--------------|
| Middleware cookie presence only | `middleware.ts` |
| Server guards DB session lookup | `guards.ts`, `session.ts` |
| PG scope on financial mutations | Grep `adminCanAccessPg` on write paths |
| `mustChangePassword` enforced | Admin login flow |

## Cron

| Route | Auth |
|-------|------|
| All `/api/cron/*` | `Bearer $CRON_SECRET` |

Scheduled in `vercel.json`: release-holds, generate-monthly-rent, expire-bed-reserves, automation, financial-reconciliation.

## Uploads

| Type | Limit | Storage |
|------|-------|---------|
| KYC | 8 MB, image types | Private Vercel Blob |
| Payment proof | ~450 KB compressed | Private Blob |

## Webhooks

| Endpoint | Production guard |
|----------|------------------|
| `/api/webhooks/mock` | Blocked in production |
| `/api/webhooks/razorpay` | Signature verify |

## Secrets

- `assertProductionBootSecrets()` in `instrumentation.ts`
- No secrets in client bundle (VAPID public key only)

## Audit logs

Required on: deposit transfer, express walk-in credit, booking cancel refund, settlement approve.

## Sign-off

- [ ] SECURITY_REMEDIATION.md items verified on production
- [ ] Cross-PG mutation attempt fails
- [ ] Mock webhook returns 403 in production
