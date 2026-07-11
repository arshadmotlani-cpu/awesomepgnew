# Automotive Capital — Deployment Checklist

Production deployment for `invest.awesomepg.in`.

## Prerequisites

- [ ] Separate Neon PostgreSQL database created
- [ ] Vercel project linked (same project as Awesome PG)
- [ ] Domain `invest.awesomepg.in` added in Vercel → Domains

## Environment Variables (Vercel)

Set for **Production**, **Preview**, and **Development** as appropriate:

| Variable | Required | Notes |
|----------|----------|-------|
| `INVEST_DATABASE_URL` | Yes (prod) | Neon connection string for Capital DB only |
| `INVEST_AUTH_SECRET` | Yes | 32+ byte random secret (`openssl rand -base64 32`) |
| `INVEST_ADMIN_EMAIL` | Yes (seed) | Admin login email — used only on first `capital:db:seed` |
| `INVEST_ADMIN_PASSWORD` | Yes (seed) | Strong password — used only on first seed |
| `BLOB_READ_WRITE_TOKEN` | Recommended | Vercel Blob for document uploads |
| `NEXT_PUBLIC_CAPITAL_URL` | Recommended | `https://invest.awesomepg.in` |

**Do not** point `INVEST_DATABASE_URL` at the Awesome PG `DATABASE_URL`.

## Local Setup

```bash
# Add to .env.local
INVEST_DATABASE_URL=postgresql://...
INVEST_AUTH_SECRET=...
INVEST_ADMIN_EMAIL=you@example.com
INVEST_ADMIN_PASSWORD=your-secure-password

# Optional local dev on localhost
CAPITAL_DEV_HOST=1

# Run migrations + seed
npm run capital:db:migrate
npm run capital:db:seed

# Dev server
npm run dev
# Visit with CAPITAL_DEV_HOST=1 → http://localhost:3000
# Or add invest.localhost to /etc/hosts
```

## Build Verification

```bash
npm run build                    # Must pass
npx tsx --test tests/capital/unit/*.test.ts
npx eslint "src/capital/**" "app/(capital)/**" "app/api/capital/**"
```

## Deploy

```bash
git push origin main             # Triggers Vercel build
# vercel-build.sh runs capital:db:migrate when INVEST_DATABASE_URL is set
```

## Post-Deploy Verification

| Check | How |
|-------|-----|
| PG unaffected | `https://www.awesomepg.in` loads normally |
| Capital host | `https://invest.awesomepg.in` → login page |
| PG on invest blocked | `https://invest.awesomepg.in/admin` → 404 |
| Capital on www blocked | `https://www.awesomepg.in/dashboard` → 404 |
| Login | Sign in with seeded admin credentials |
| Dashboard | KPI cards load with real data |
| Create asset | Add car → appears in list + ledger |
| Payment | Record payment → outstanding updates |
| Reports | Export CSV from `/reports/outstanding` |
| PWA | Install from mobile browser |
| Health | `GET /api/capital/health` returns `{ ok: true }` |

## Security Post-Deploy

- [ ] Rotate `INVEST_ADMIN_PASSWORD` in DB after first login (Settings → Phase 2)
- [ ] Confirm `INVEST_ADMIN_PASSWORD` removed from Vercel after seed (optional)
- [ ] Verify `ac_session` cookie is httpOnly + secure in production
- [ ] Confirm no Capital routes leak on www host

## Rollback

- Revert git commit and redeploy
- Capital DB is isolated — PG rollback does not affect Capital data
- Neon PITR available for Capital DB recovery

## Support

Planning docs: `docs/automotive-capital/`
