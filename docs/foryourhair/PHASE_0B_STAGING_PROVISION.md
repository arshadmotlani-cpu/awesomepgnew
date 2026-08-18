# Phase 0B — Staging Platform DB Provisioning (S0)

**GATE 1:** Staging `PLATFORM_DATABASE_URL` must be provisioned before S1–S4.

## Steps (Neon)

1. Create a **new Neon project** or branch dedicated to Platform SaaS identity (not PG / Hair / Capital / Owner).
2. Copy the connection string → `PLATFORM_DATABASE_URL` on **staging Vercel only** (Preview + staging branch).
3. Verify isolation: connection string must differ from `HAIR_DATABASE_URL`, `DATABASE_URL`, `INVEST_DATABASE_URL`, `OWNER_DATABASE_URL`.
4. Run migrations:
   ```bash
   npm run platform:db:migrate
   ```
5. GATE 1 SQL:
   ```sql
   SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'platform';
   SELECT COUNT(*) FROM platform.organizations; -- expect 0 pre-bootstrap
   ```

## Hair staging branch

Use a **Neon branch** for Hair staging (not production). Set `HAIR_DATABASE_URL` on staging to that branch before S2–S5.

## Artifacts (local, do not commit)

| File | Purpose |
|------|---------|
| `staging-bootstrap-ids.json` | Output of `npm run hair:saas:bootstrap-platform` |

## Env flags (staging cutover S10)

| Variable | Staging cutover | Production default |
|----------|-----------------|-------------------|
| `FYH_SAAS_TENANT` | `1` | `0` |
| `WORKFORCE_MEMBERSHIP_AUTH` | `1` | `0` |
| `FYH_BOOTSTRAP_ORG_ID` | optional backfill override | — |
| `FYH_BOOTSTRAP_LOC_ID` | optional backfill override | — |

## Sequence reference

See Phase 0B staging migration plan — S0 → S11. **S9 NOT NULL** is manual: `npm run hair:saas:apply-not-null` after gates green (not in automatic `hair:db:migrate`).

**Full cutover runbook:** [PHASE_0B_STAGING_CUTOVER.md](./PHASE_0B_STAGING_CUTOVER.md)

**Step-by-step Neon + Vercel provisioning (operator):** [PHASE_0B_STAGING_OPERATOR_GUIDE.md](./PHASE_0B_STAGING_OPERATOR_GUIDE.md)

**Read-only preflight (staging URLs only):**

```bash
npm run hair:saas:staging-preflight
```
