# Phase 0B — Staging Cutover Runbook

**Scope:** Staging / preview only. **Do not run bootstrap, backfill, NOT NULL, or flag flips on production** until GATE 9 sign-off.

**Defaults (production + local until cutover):** `FYH_SAAS_TENANT=0`, `WORKFORCE_MEMBERSHIP_AUTH=0` — tenant filters are no-ops; legacy single-tenant behavior.

---

## Preconditions

| Check | Command / action |
|-------|----------------|
| Hair tests green | `npm run test:hair` → **243 pass, 0 fail** (latest run) |
| No production URLs in shell | Confirm `HAIR_DATABASE_URL` / `PLATFORM_DATABASE_URL` host is **staging Neon branch** |
| Isolation | `npm run env:check -- --product=hair` and `--product=platform` |
| Code deployed to staging | Vercel preview/staging branch with Phase 0B code; flags still `0` |

---

## Phase A — Provision (S0, GATE 1)

1. **Neon — Platform DB** (new project or branch, not PG/Hair/Capital/Owner).
2. **Neon — Hair staging branch** (copy of prod or empty; not production primary).
3. **Vercel staging env only:**
   - `PLATFORM_DATABASE_URL` → Platform connection string
   - `HAIR_DATABASE_URL` → Hair staging branch
   - Keep `FYH_SAAS_TENANT=0`, `WORKFORCE_MEMBERSHIP_AUTH=0`
4. Run migrations on staging (from CI/deploy or locally against staging URLs):
   ```bash
   npm run platform:db:migrate
   npm run hair:db:migrate
   ```
5. **GATE 1 SQL** (read-only):
   ```sql
   SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'platform';
   SELECT COUNT(*) FROM platform.organizations; -- expect 0
   SELECT column_name FROM information_schema.columns
     WHERE table_name = 'fyh_customers' AND column_name = 'organization_id';
   ```

---

## Phase B — Schema additive (S2–S3, GATE 2)

Already applied if `hair:db:migrate` succeeded through `0036_saas_unique_indexes`.

Verify nullable tenant columns exist and support tables present:

```sql
SELECT COUNT(*) FROM fyh_customers WHERE organization_id IS NOT NULL; -- expect 0 pre-backfill
SELECT COUNT(*) FROM fyh_org_invoice_sequences;
```

**Rollback (staging only):** Neon branch reset before backfill.

---

## Phase C — Bootstrap + backfill (S4–S5, GATE 3)

Run **against staging Hair + Platform URLs only**:

```bash
# Requires both HAIR_DATABASE_URL and PLATFORM_DATABASE_URL (staging)
npm run hair:saas:bootstrap-platform
npm run hair:saas:backfill-tenant
npm run hair:saas:bootstrap-verify
npm run hair:saas:tenant-reconcile
```

**Artifacts:** `staging-bootstrap-ids.json` (local; do not commit).

**GATE 3 checks:**

```sql
SELECT COUNT(*) FROM platform.organizations;        -- >= 1
SELECT COUNT(*) FROM platform.memberships;          -- >= active logins
SELECT COUNT(*) FROM fyh_invoices WHERE organization_id IS NULL;  -- 0
SELECT COUNT(*) FROM fyh_appointments WHERE location_id IS NULL; -- 0
```

**Financial checksum** (compare to pre-backfill snapshot):

```sql
SELECT SUM(grand_total_paise) FROM fyh_invoices;
SELECT SUM(amount_paise) FROM fyh_expenses;
```

---

## Phase D — App deploy with flags off (S7, GATE 4)

1. Deploy Phase 0B code to staging with `FYH_SAAS_TENANT=0`.
2. Smoke: login, appointments, quick sale, invoice register — must behave as before.
3. No tenant cookies required yet; guards do not enforce Platform membership.

---

## Phase E — Enable SaaS on staging (S10, GATE 5–8)

**Only after GATE 3 green.**

1. Set on **staging Vercel** (not production):
   ```
   FYH_SAAS_TENANT=1
   WORKFORCE_MEMBERSHIP_AUTH=1
   ```
2. Redeploy staging.
3. Re-login — verify cookies `fyh_org_id`, `fyh_location_id` set.
4. Manual smoke:
   - Dashboard KPIs load
   - Customer list / create
   - Appointment create + checkout
   - Quick sale paid
   - Invoice register export
   - Vendor purchase + payment
5. Run tests against staging DB (optional):
   ```bash
   npm run test:hair
   ```

---

## Phase F — NOT NULL constraints (S9, GATE 3 post-S10)

**Destructive — staging only, after E green:**

```bash
npm run hair:saas:apply-not-null
```

Verify:

```sql
SELECT COUNT(*) FROM fyh_customers WHERE organization_id IS NULL; -- 0
```

**Rollback:** Neon branch restore point required before this step.

---

## Phase G — Production (GATE 9 — out of scope here)

Do **not** execute until:

- Staging soak (24h+) with `FYH_SAAS_TENANT=1`
- Stakeholder sign-off on GATE 9 checklist
- Production Neon branch + maintenance window
- Production bootstrap/backfill runbook repeated on **production staging branch first**, then prod cutover window

Production defaults remain `FYH_SAAS_TENANT=0` until explicit production cutover.

---

## Quick reference — npm scripts

| Script | Purpose |
|--------|---------|
| `npm run platform:db:migrate` | Platform schema |
| `npm run hair:db:migrate` | Hair through 0036 (not NOT NULL) |
| `npm run hair:saas:bootstrap-platform` | S4 Platform org/users |
| `npm run hair:saas:backfill-tenant` | S5 Hair tenant IDs |
| `npm run hair:saas:bootstrap-verify` | Checksums / null checks |
| `npm run hair:saas:tenant-reconcile` | Read-only Hair ↔ Platform |
| `npm run hair:saas:apply-not-null` | S9 manual NOT NULL |
| `npm run test:hair` | Full suite (migrate + 58 files) |

---

## Flag reference

| Variable | Staging (pre-cutover) | Staging (cutover) | Production (default) |
|----------|----------------------|-------------------|----------------------|
| `FYH_SAAS_TENANT` | `0` | `1` | `0` |
| `WORKFORCE_MEMBERSHIP_AUTH` | `0` | `1` | `0` |

Implementation: `src/hair/lib/tenant/flags.ts` — only `1` or `true` enables enforcement.
