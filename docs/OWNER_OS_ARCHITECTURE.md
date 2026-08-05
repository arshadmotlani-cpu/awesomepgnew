# Owner OS — Architecture (Phase 1)

## Host isolation

| Host | Engine |
|------|--------|
| `www.awesomepg.in` | Awesome PG |
| `fyhair.awesomepg.in` | FYH Salon |
| `invest.awesomepg.in` | Automotive Capital |
| `owner.awesomepg.in` | Owner OS |

Middleware order: Hair → Capital → **Owner** → PG.

Public URLs on Owner host (`/dashboard`, `/net-worth`, …) rewrite to internal `/owner/...` so they never collide with Capital’s `/dashboard` App Router segment.

## Databases

`OWNER_DATABASE_URL` must ≠ `DATABASE_URL` / `INVEST_DATABASE_URL` / `HAIR_DATABASE_URL`.

Tables: `oo_admin_users`, `oo_auth_sessions`, `oo_event_inbox`.

## Brains (Engine-local registry)

`src/owner/brains/registry.ts` — Owner OS catalog. Global ecosystem registry remains `docs/ECOSYSTEM_V2_BRAIN_REGISTRY.md`.

Personal Finance Brain implementation stays at `src/personalFinance/` and is **imported**, not copied.

## Money flow (consume only)

```
Engine public API / event
  → Personal Finance Brain snapshot
  → Owner Brain / Net Worth Brain projection
  → Owner OS dashboard (explainable UI)
```

No rent / TVI / salon paid-revenue recalculation inside `src/owner/`.

## Auth

Cookie `oo_session` · email+password · host-gated.
