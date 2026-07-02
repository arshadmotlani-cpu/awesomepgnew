# Dual-Identifier Customer Authentication

**Status:** Implemented  
**Date:** 2026-07-02

## Problem

Residents could lock themselves out when they remembered their phone but not their email, because login and forgot-password accepted email only.

## Solution

One account, one password, two login identifiers (email + E.164 phone).

## Flow changes

| Flow | Before | After |
|------|--------|-------|
| Login | Email + password | Email **or** phone + password (auto-detect via `@`) |
| Forgot password | Email → OTP to that email | Email **or** phone → OTP to **registered email** (masked in UI) |
| Signup phone conflict | Full email revealed / generic error | “Existing account” + Login / Forgot password |
| Booking expiry | `?next=` redirect | Unchanged — middleware preserves booking URL |

## Database impact

**None.** `customers.email` and `customers.phone` remain unique. No new tables.

Login rate limits reuse `email_otp_attempt_log` with actions `login_failed` / `login_success`.

## API changes

| Route | Change |
|-------|--------|
| `POST /api/auth/customer/login` | Accepts `identifier` (or legacy `email`) |
| `POST /api/auth/customer/email/send` | Accepts `identifier` for forgot_password; phone resolves to registered email |
| `GET /api/auth/customer/phone/lookup` | **New** — signup guard for existing phone |

## Migration plan

No migration. Deploy code only. Existing sessions and passwords unchanged.

## Backward compatibility

- Login API still accepts `email` field.
- Email-only OTP signup unchanged.
- Admin auth unchanged.
- `maskEmailForDisplay()` never returns full email in API responses.

## Key files

- `src/lib/auth/loginIdentifier.ts`
- `src/lib/auth/loginRateLimit.ts`
- `app/api/auth/customer/login/route.ts`
- `app/api/auth/customer/email/send/route.ts`
- `app/api/auth/customer/phone/lookup/route.ts`
- `src/components/auth/CustomerLoginForm.tsx`
