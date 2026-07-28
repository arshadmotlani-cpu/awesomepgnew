# For Your Hair ERP (Salon)

Luxury Salon ERP on `fyhair.awesomepg.in`.

Isolated from Awesome PG and Automotive Capital (separate routes, layout, DB, auth cookie).

## Host routing

Same pattern as Automotive Capital (`invest.awesomepg.in`): root middleware detects the Salon host and runs Hair middleware only.

| Host | App |
|------|-----|
| `fyhair.awesomepg.in` | Salon ERP (production) |
| `fyhair.localhost` | Local alias |
| `foryourhair.awesomepg.in` | Legacy alias (still allowed) |
| `localhost` + `HAIR_DEV_HOST=1` | Dev |

Public URLs (`/dashboard`, `/customers`, …) are rewritten internally to `/fyh/...` so they never collide with Capital or PG App Router pages.

Root `/` on the Salon host redirects to `/dashboard` (if signed in) or `/login` (same as invest).

## Environment

```bash
# Neon — must NOT equal DATABASE_URL or INVEST_DATABASE_URL
HAIR_DATABASE_URL=postgresql://...

# Optional Vercel Neon integration aliases also work:
# HAIR_DATABASE_DATABASE_URL / FORYOURHAIR_DATABASE_URL / HAIR_POSTGRES_URL

# Seed admin (first migrate/seed only)
HAIR_ADMIN_EMAIL=admin@fyhair.local
HAIR_ADMIN_PASSWORD=change-me

# Local host switch (use instead of CAPITAL_DEV_HOST)
HAIR_DEV_HOST=1
```

## Scripts

```bash
npm run hair:db:migrate
npm run hair:db:seed
npm run hair:db:studio
```

## DNS / Vercel

1. Create a **new Neon database**.
2. Add `HAIR_DATABASE_URL` (and admin seed vars) in Vercel.
3. Add domain `fyhair.awesomepg.in` to the same AwesomePG Vercel project.
4. DNS: `fyhair` → Vercel (`76.76.21.21` or CNAME).

## Auth

- Cookie: `fyh_session` (host-scoped; never shared with PG or Capital)
- Tables: `fyh_admin_users`, `fyh_auth_sessions`, `fyh_settings`
