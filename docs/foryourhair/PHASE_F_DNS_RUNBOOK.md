# Phase F — Tenant subdomain DNS / certs runbook

**Status:** Code supports `{slug}.fyhair.app` (+ staging parents). DNS is operator work.  
**Do not** enable `FYH_SAAS_TENANT=1` in production until staging smoke (signup → Stripe → webhook → login → isolation → cancel → lock) is green.

## Hostname model

| Host | Behavior |
|------|----------|
| `fyhair.awesomepg.in` (apex) | Multi-org picker; session org SSOT (Phase D) |
| `{slug}.fyhair.app` | Tenant-bound: session org **must** match Platform `organizations.slug` |
| `{slug}.fyhair.awesomepg.in` | Same binding (staging / transition) |
| `{slug}.fyhair.localhost` | Local/dev tenant host |

Reserved labels (not tenants): `www`, `api`, `app`, `admin`, `platform`, `mail`, `status`, `cdn`, `static`, `fyhair`, `foryourhair`.

## DNS (production)

1. Register / use zone for `fyhair.app` (or keep `*.fyhair.awesomepg.in` CNAME if delaying new TLD).
2. Add **wildcard** CNAME: `*.fyhair.app` → Vercel / load balancer target (same as apex Hair app).
3. Apex `fyhair.app` optional redirect → marketing or `fyhair.awesomepg.in`.
4. Issue wildcard TLS (`*.fyhair.app`) via Vercel/Let's Encrypt.
5. Smoke: `curl -I https://{known-slug}.fyhair.app/login` → Hair app, not PG/Capital.

## Cutover

1. Staging: set `FYH_SAAS_TENANT=1` only on staging; create org with known `slug`; open `{slug}.fyhair.localhost` / preview host mapping.
2. Confirm Org A session on Org B host → empty / redirect (no catalog).
3. Confirm public invoice token still works (token embeds org; subdomain is additional binding).
4. Production: keep flag **off** until that smoke is green end-to-end with Stripe.

## Rollback

Remove wildcard DNS / stop advertising tenant hosts. Apex picker path remains; Phase F helpers return null on apex and do not change single-host behavior.
