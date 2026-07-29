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

## Modules (live)

| Module | Notes |
|--------|--------|
| Dashboard | Live KPIs from appointments + invoices + inventory |
| Customers | Full CRM (`0002`–`0003`) |
| Appointments | Calendar with Day/Week/Timeline/Chair/Stylist views, @dnd-kit drag/resize, conflict engine (`0007`) |
| Billing | Appointment checkout + **Quick Sale** walk-in POS at `/quick-sale` (`0012`) |
| Services | Production catalog (`0004`–`0005`) |
| Products | Retail + consumables (`0006`) |
| Staff | List/create + commission accrual on paid invoices |
| Inventory | Stock levels + consumption on paid invoices |
| Loyalty | Memberships, packages, bridal, commissions, notification outbox |
| Reports | Period revenue + top services/stylists/customers |
| Settings | Business hours, GST, invoice prefix, buffer |

Archive on services/products soft-deactivates only — rows remain for historical invoices; `listBookableServices()` excludes archived.

Visit loop: Booked → Confirmed → Arrived → In Service → Completed → Invoice → Paid (or Cancelled / No Show).

**Quick Sale** (Dashboard → **+ New → Quick Sale**) is the walk-in billing workflow (`0012`–`0014`). **Hold bill** stores draft invoices with cart, attributions, and payment draft; checkout promotes the draft to a numbered invoice. **Sales attributions** are the performance SSOT; commission rules table is schema-ready only. See [QUICK_SALE.md](./QUICK_SALE.md), [FEATURES.md](./FEATURES.md), [WORKFLOWS.md](./WORKFLOWS.md).

Run Hair tests: `npm run test:hair` (integration needs `npm run hair:db:migrate`).
