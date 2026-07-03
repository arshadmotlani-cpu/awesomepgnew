# Neon preview branch setup

Vercel preview deploys fail with **Branch limit reached** when the Neon integration (`neon-champagne-ribbon`) cannot create another database branch for the preview.

## Fix it in 2 minutes (manual — works immediately)

1. Open [Neon Console](https://console.neon.tech) → your project → **Branches**
2. Delete **old preview branches** (names often match git branches like `cursor/...`)
3. **Keep** the primary branch (`main` / `production`)
4. In Vercel → your PR → **Redeploy**

## Enable automatic cleanup (one-time GitHub setup)

Go to **GitHub repo → Settings → Secrets and variables → Actions**:

| Name | Type | Value |
|------|------|-------|
| `NEON_API_KEY` | Secret | Neon console → Account → **API keys** → Create |
| `NEON_PROJECT_ID` | Variable | Neon project → **Settings** → Project ID |
| `NEON_MAX_BRANCHES` | Variable (optional) | Plan limit, e.g. `10` |
| `VERCEL_TOKEN` | Secret (optional) | Vercel → Account → **Tokens** |
| `VERCEL_PROJECT_ID` | Variable (optional) | Vercel project → Settings → Project ID |

### Fastest path: Neon GitHub integration

Install the [Neon GitHub integration](https://neon.tech/docs/guides/neon-github-integration) — it can auto-create `NEON_API_KEY` and `NEON_PROJECT_ID` for Actions.

### Run cleanup now (after secrets are set)

1. **Actions → Neon preview branch cleanup → Run workflow**
2. Or locally:
   ```bash
   NEON_API_KEY=... NEON_PROJECT_ID=... npm run neon:cleanup-branches:execute
   ```

## What runs automatically (after secrets configured)

| Trigger | Behavior |
|---------|----------|
| Every PR push | Frees branch slots before Vercel provisions (3-day retention) |
| Daily 05:15 UTC | Full cleanup (7-day retention) |
| PR closed | Deletes Neon branch for that PR |

## Verify

After deleting branches or running cleanup:

1. Push a commit or click **Redeploy** on Vercel
2. Provisioning Integrations should pass (Neon creates a new branch)
3. Build step should run (TypeScript fixes are on `main` as of PR #9)
