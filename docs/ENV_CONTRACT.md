# Monorepo environment contract

Single Vercel deployment hosts three products. Each product uses its **own** Postgres database URL.

| Product | Host | Required env (local / CI) |
|---------|------|---------------------------|
| Awesome PG | `www.awesomepg.in` | `DATABASE_URL` (or `POSTGRES_URL`) |
| Automotive Capital | `invest.awesomepg.in` | `INVEST_DATABASE_URL` |
| For Your Hair | `fyhair.awesomepg.in` | `HAIR_DATABASE_URL` |

Shared: `AUTH_SECRET` (≥32 chars for builds and sessions).

## `vercel env pull` and empty keys

Neon integration variables are often **present but empty** in `.env.local` after `npm run env:pull`. Deploy injects them at runtime; they are not always exportable locally.

- **PG dev** needs a real `DATABASE_URL` pasted from Neon or `.env.example`.
- **Hair-only dev** can omit `DATABASE_URL` if `HAIR_DATABASE_URL` is set — run `npm run env:check -- --product=hair`.
- Never point two products at the same connection string (`assertHairDatabaseIsolated` enforces this for Hair).

## Checks

```bash
npm run env:check              # PG database (default)
npm run env:check -- --product=hair
npm run env:check -- --product=capital
```

## CI

- **PR/main:** unit tests + PG smoke E2E (`.github/workflows/ci.yml`).
- **Hair E2E:** `.github/workflows/hair-e2e.yml` (nightly + manual) when repo secrets `HAIR_DATABASE_URL` (+ optional `HAIR_ADMIN_*`) are set.

See also [`docs/foryourhair/RELEASE_READINESS.md`](foryourhair/RELEASE_READINESS.md) and [`scripts/verify-production-p0.ts`](../scripts/verify-production-p0.ts) for production PG audits.
