# Room OS Environment Variables

## Required for Room OS operation

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection; migrations, projectors, certification |
| `CRON_SECRET` | Yes | Authenticates `/api/cron/room-os-outbox` and other cron routes |
| `AUTH_SECRET` | Yes | Admin session auth (production audit, Operations Centre) |

Generate `CRON_SECRET`:

```bash
openssl rand -hex 32
```

Set on Vercel project environment variables for Production and Preview (if staging crons run there).

## Room OS feature flags (default off)

| Variable | Default | Enable values | Effect |
|----------|---------|---------------|--------|
| `ROOM_OS_OPERATIONS_QUEUE` | off (unset) | `1`, `true`, `on` | Operations Centre uses Room OS read APIs via `roomOsOperationsQueueAdapter.ts` |
| `ROOM_OS_BILLING_CENTRE` | off (unset) | `1`, `true`, `on` | Billing Centre collections uses `roomOsCollectionsAdapter.ts` |

Disable explicitly with `0` or unset the variable.

Source: `src/lib/operations/featureFlag.ts`

## Not required for initial Room OS cutover

| Variable | Notes |
|----------|-------|
| Workflow-specific vars | None; workflow API exists but admin payments use Payment SSOT directly until UI wiring |
| `ROOM_OS_*` beyond the two above | No other Room OS env vars exist |

## Vercel cron

`vercel.json` schedules:

```json
"path": "/api/cron/room-os-outbox",
"schedule": "*/5 * * * *"
```

Vercel attaches `CRON_SECRET` automatically when configured as a project env var.

## Local / CLI scripts

For certification and audits against production:

```bash
export DATABASE_URL="postgresql://..."
export CRON_SECRET="..."
```

Scripts also attempt to load from `.env.production.local`, `.env.local`, etc. (see audit scripts).

## Checklist before deploy

- [ ] `DATABASE_URL` points to correct Neon branch
- [ ] `CRON_SECRET` set and matches between Vercel and manual curl tests
- [ ] `ROOM_OS_OPERATIONS_QUEUE` unset or `0` on production (until cutover)
- [ ] `ROOM_OS_BILLING_CENTRE` unset or `0` on production (until cutover)

See [04-feature-flag-rollout.md](./04-feature-flag-rollout.md) for staged enablement.
