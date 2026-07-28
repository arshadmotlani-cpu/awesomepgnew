# Auth session verification (manual + staging)

Resident sessions use `apg_customer_session` with **60-day** TTL and **24h-throttled** sliding extension on activity.

## Automated

```bash
node --import tsx --test tests/unit/customerSessionPolicy.test.ts tests/unit/sessionSliding.test.ts
```

## Manual checklist

1. **Login** (password or booking OTP) on `https://www.awesomepg.in`.
2. DevTools → Application → Cookies: `apg_customer_session` **Expires** ≈ 60 days from now.
3. **Refresh page** — still signed in; cookie expiry unchanged or extended after 24h+ idle.
4. **Close browser**, reopen — still signed in.
5. **Apex host**: open `https://awesomepg.in/account` → 308 to `www` with session intact.
6. **Simulate idle return** (staging): set `auth_sessions.expires_at` to 25 days from now and `last_seen_at` to 30 days ago; load `/account` → row and cookie should extend to ~60 days from load time.
7. **Expiry**: set `expires_at` in the past → next request clears cookie and redirects to login.

## Debug logging

Set `AUTH_SESSION_DEBUG=1` on the environment to log create / validate / refresh / reject events (no raw tokens).

## Capital / Hair

- `invest.awesomepg.in` — `ac_session`, 60-day sliding (same 14d / 24h rules).
- `fyhair.awesomepg.in` — `fyh_session`, 60-day standard / 90-day remember-me with sliding. (`foryourhair.awesomepg.in` remains a legacy alias.)
