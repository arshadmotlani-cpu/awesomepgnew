# P0 URL Consistency Repair

## Root issue

Shareable links (invoices, WhatsApp, payment links, KYC, referrals, password reset) used fragmented helpers (`getPublicCustomerBaseUrl`, `getWatchdogBaseUrl`, `window.location.origin`, `NEXT_PUBLIC_APP_URL || localhost`) that could emit `http://localhost:3000` on Vercel production when env vars were unset.

## SSOT

`src/lib/url.ts`

| Environment | `getAppUrl()` |
|-------------|---------------|
| `VERCEL_ENV=production` | `https://www.awesomepg.in` (hardcoded canonical) |
| `VERCEL_ENV=preview` | `https://{VERCEL_URL}` |
| Development | `http://localhost:3000` |

Helpers:
- `appAbsoluteUrl(path)` — server-side absolute URLs
- `clientAppBaseUrl()` / `clientAppAbsoluteUrl(path)` — client share links (never localhost on awesomepg.in)

## Files changed

| File | Change |
|------|--------|
| `src/lib/url.ts` | **New** canonical URL builder |
| `src/lib/appUrl.ts` | Re-exports `getAppUrl`; keeps `maskEmail` |
| `src/lib/deploy/config.ts` | `getWatchdogBaseUrl()` → `getAppUrl()` |
| `src/lib/kyc/adminWhatsApp.ts` | `publicSiteBaseUrl` / `clientPublicSiteBaseUrl` → url SSOT |
| `src/lib/billing/paymentLinkUrl.ts` | Uses `appAbsoluteUrl` |
| `src/lib/billing/sendInvoiceOnWhatsApp.ts` | Uses `getAppUrl` / `appAbsoluteUrl` |
| `src/lib/auth/adminPasswordReset.ts` | Reset email links via `appAbsoluteUrl` |
| `src/lib/healing/envHealer.ts` | Removed `NEXT_PUBLIC_BASE_URL` requirement |
| `src/components/customer/account/ReferralsPanel.tsx` | `clientAppAbsoluteUrl` (no `window.location.origin`) |
| `scripts/post-deploy-ops.ts` | Targets `CANONICAL_PRODUCTION_URL` by default |
| `tests/unit/appUrl.test.ts` | **New** |
| `tests/unit/invoiceDeepLink.test.ts` | Updated for canonical production |
| `tests/integration/criticalJourneys.test.ts` | Updated |

## Flows fixed (via SSOT chain)

| Flow | Entry point |
|------|-------------|
| Invoice WhatsApp share | `sendInvoiceOnWhatsApp` → `getAppUrl` |
| Resident invoice public URL | `buildInvoicePublicUrl` → `appAbsoluteUrl` |
| Payment links (`/pay/{id}`) | `paymentLinkPublicUrl` |
| Rent / electricity / deposit WhatsApp | `paymentLinks.ts` → `paymentLinkPublicUrl` |
| KYC WhatsApp reminders | `adminWhatsApp.ts` → `clientAppBaseUrl` |
| Admin password reset email | `adminPasswordReset.ts` |
| Referral share links | `ReferralsPanel.tsx` |
| Health checks / watchdog | `deploy/config.ts` |
| Invoice document payment link | `invoiceDocumentModel.ts` → `paymentLinkPublicUrl` |

Admin notifications and action queue use **relative** `/admin/...` paths (correct for in-app navigation).

## Before / after

| Surface | BEFORE (prod, env unset) | AFTER |
|---------|--------------------------|-------|
| Invoice WhatsApp share | `http://localhost:3000/resident/invoices/...` | `https://www.awesomepg.in/resident/invoices/...` |
| Payment link | `http://localhost:3000/pay/...` | `https://www.awesomepg.in/pay/...` |
| KYC WhatsApp (admin) | `window.location.origin` or localhost | `https://www.awesomepg.in` when on production host |
| Referral link | `window.location.origin` or bare `awesomepg.in` | `https://www.awesomepg.in/pgs?ref=...` |
| Password reset email | `localhost` fallback | `https://www.awesomepg.in/admin/reset-password?...` |

## Verification

```bash
node --import tsx --test tests/unit/appUrl.test.ts tests/unit/invoiceDeepLink.test.ts
```

Production: share any paid invoice via WhatsApp — link must start with `https://www.awesomepg.in`, never `localhost`.

## Intentionally unchanged

- `playwright.config.ts`, screenshot scripts — local dev tooling defaults to localhost
- `docs/h10-screenshots/*` — captured local screenshots manifest
- In-app `window.location` for same-page navigation (login redirect, etc.) — not shareable URLs
