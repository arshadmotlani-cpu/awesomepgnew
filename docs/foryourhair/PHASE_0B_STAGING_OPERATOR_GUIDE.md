# Phase 0B — Staging operator guide (provision only)

**Purpose:** Create isolated Hair + Platform staging databases and wire **Vercel Preview** (and optional local shell) — **without** touching production Hair or running Phase 0B migrations/backfill yet.

**Production Hair (do not modify):**

| Item | Value |
|------|--------|
| Neon project ID | `round-grass-90965139` |
| Primary endpoint | `ep-billowing-bar-au20886r` (pooled: `…-pooler…`) |
| Database | `neondb` |

---

## How this repo expects staging to work

| Layer | Expectation |
|-------|-------------|
| **Hair** | A **dedicated Neon branch** (or separate Neon project) with a **different endpoint hostname** than `ep-billowing-bar-au20886r`. See [`PHASE_0B_STAGING_PROVISION.md`](./PHASE_0B_STAGING_PROVISION.md). |
| **Platform** | A **fifth database** — new Neon project or database, connection in `PLATFORM_DATABASE_URL`. Must ≠ PG / Hair / Capital / Owner URLs. |
| **Vercel** | `npm run env:pull` uses **Preview** env ([`package.json`](../../package.json)). Production Hair stays on primary branch via Neon integration. |
| **Hair URL resolution** | `HAIR_DATABASE_URL` is checked **before** `HAIR_DATABASE_DATABASE_URL` ([`src/hair/lib/db/env.ts`](../../src/hair/lib/db/env.ts)). Set canonical `HAIR_DATABASE_URL` on Preview to override integration pointing at primary. |
| **Flags** | `FYH_SAAS_TENANT=0`, `WORKFORCE_MEMBERSHIP_AUTH=0` until staging cutover Phase E. |
| **Neon PR branches** | [`docs/NEON_BRANCH_SETUP.md`](../../NEON_BRANCH_SETUP.md) — ephemeral preview branches for **PG** integration; Hair Phase 0B needs a **stable** branch name (not per-PR ephemeral) for bootstrap/backfill. |

**Repo scripts (provision phase — read-only / env only):**

| Script | Use now? |
|--------|----------|
| `npm run env:check -- --product=hair` | Yes — verify host after you set staging URL |
| `npm run env:check -- --product=platform` | Yes — after Platform URL set |
| `npm run hair:saas:staging-preflight` | Yes — read-only schema/env checks |
| `npm run hair:db:migrate` | **No** — wait until staging URLs confirmed |
| `npm run platform:db:migrate` | **No** — same |
| `npm run hair:saas:bootstrap-platform` | **No** — Phase C |
| `npm run neon:cleanup-branches` | Dry-run only; do not delete `fyh-phase-0b-staging` |

---

## Part 1 — Hair staging Neon branch (console)

**Project:** Neon → project `round-grass-90965139` (same project as production Hair; **new branch**, not primary).

### Option A — Isolated branch with prod-like data (Neon-standard staging)

Neon child branches are **isolated endpoints**; writes on the branch do not affect the parent after creation. Phase 0B cutover allows “copy of prod or empty” ([`PHASE_0B_STAGING_CUTOVER.md`](./PHASE_0B_STAGING_CUTOVER.md) Phase A).

1. Open [Neon Console](https://console.neon.tech) → project **round-grass-90965139**.
2. **Branches** → **Create branch**.
3. Name: `fyh-phase-0b-staging` (or `staging-fyh-0b`).
4. Parent: **primary** (`main` / production branch).
5. Create branch (Neon copies storage at branch point — **production primary is not modified**).
6. Open the **new branch** → **Connection details** → copy **pooled** connection string.
7. Record the new endpoint hostname (must **not** be `ep-billowing-bar-au20886r`).

### Option B — Empty Hair staging (no prod snapshot)

Neon always branches from a parent; “empty” means **no production data dependency** for Phase 0B:

1. Create a **new Neon project** (e.g. `awesomepg-hair-staging`) with an empty `main` branch, **or**
2. Create branch as in Option A, then (later, on staging only) truncate — **not recommended before migrations**.

For Phase 0B bootstrap you will need `hair:db:migrate` + `hair:db:seed` on an empty DB.

### Verify isolation (before any migrate)

Compare endpoints:

```text
Production (never use for Phase 0B): ep-billowing-bar-au20886r…
Staging (target):                    ep-<different-id>…
```

---

## Part 2 — Platform staging Neon database (console)

Platform is a **separate** database ([`PHASE_0B_DECISIONS.md`](./PHASE_0B_DECISIONS.md) — `PLATFORM_DATABASE_URL`).

**Recommended:** new Neon project (keeps Hair project unchanged).

1. Neon Console → **New project** (e.g. `awesomepg-platform-staging`).
2. Region: same as Hair (`aws-us-east-1`) if possible.
3. Copy **pooled** connection string from project **Connection details**.
4. Record endpoint hostname and project ID.
5. Confirm this URL is **not** equal to Hair, PG, Capital, or Owner URLs.

There is **no** Vercel Neon integration for Platform in this repo yet — you will set `PLATFORM_DATABASE_URL` manually on Preview.

---

## Part 3 — Vercel Preview environment variables

**Do not change Production environment variables** for Hair (keep primary / integration as-is).

Vercel → **awesomepg** project → **Settings** → **Environment Variables** → filter **Preview**:

| Variable | Value | Environments |
|----------|--------|--------------|
| `HAIR_DATABASE_URL` | Pooled connection string for **staging branch** (Part 1) | **Preview only** |
| `PLATFORM_DATABASE_URL` | Pooled connection string for Platform staging (Part 2) | **Preview only** |
| `FYH_SAAS_TENANT` | `0` | Preview (explicit) |
| `WORKFORCE_MEMBERSHIP_AUTH` | `0` | Preview (explicit) |

**Optional (local / Preview seed after migrate):**

| Variable | Environments |
|----------|--------------|
| `HAIR_ADMIN_EMAIL` | Preview / Development |
| `HAIR_ADMIN_PASSWORD` | Preview / Development |

**Do not set** on Preview unless you intend to override:

- `HAIR_DATABASE_DATABASE_URL` — integration may still inject primary; `HAIR_DATABASE_URL` wins when both set.

After saving, redeploy a Preview deployment or run:

```bash
npm run env:pull   # pulls Preview → .env.local
```

**Warning:** `env:pull` overwrites `.env.local`. For local staging work without touching pulled production Hair integration vars, use a **dedicated shell** (Part 4) instead of editing `.env.local` production URLs.

**Production environment:** leave existing `HAIR_DATABASE_*` integration variables unchanged.

---

## Part 4 — Local shell for staging (no `.env.local` edit)

Do **not** point `.env.local` at production Hair for Phase 0B work. Use exports in a dedicated terminal:

```bash
# Staging only — paste pooled URLs from Neon (never production ep-billowing-bar-au20886r)
export HAIR_DATABASE_URL='postgresql://…@ep-<STAGING-HAIR-ENDPOINT>…/neondb?sslmode=require'
export PLATFORM_DATABASE_URL='postgresql://…@ep-<STAGING-PLATFORM-ENDPOINT>…/neondb?sslmode=require'
export FYH_SAAS_TENANT=0
export WORKFORCE_MEMBERSHIP_AUTH=0

# Read-only checks (safe)
npm run env:check -- --product=hair
npm run env:check -- --product=platform
npm run hair:saas:staging-preflight
```

Confirm `hair` check prints staging hostname ≠ `ep-billowing-bar-au20886r`.

---

## Part 5 — Neon CLI alternative (optional, no repo script)

If you prefer CLI over console ([Neon CLI](https://neon.tech/docs/reference/neon-cli)):

```bash
# Requires: neonctl auth
# Hair staging branch (parent = primary)
neonctl branches create --project-id round-grass-90965139 --name fyh-phase-0b-staging

# Connection string for new branch
neonctl connection-string --project-id round-grass-90965139 --branch fyh-phase-0b-staging --pooled
```

Platform project creation is typically done in console (new project).

---

## After provisioning (not now)

When staging endpoints are confirmed and preflight is green:

1. `npm run platform:db:migrate` (staging `PLATFORM_DATABASE_URL` only)
2. `npm run hair:db:migrate` (staging `HAIR_DATABASE_URL` only)
3. `npm run hair:saas:staging-preflight` again
4. Then Phase C bootstrap/backfill per [`PHASE_0B_STAGING_CUTOVER.md`](./PHASE_0B_STAGING_CUTOVER.md)

---

## Quick reference — production vs staging

| | Production (untouched) | Staging (target) |
|--|------------------------|------------------|
| Hair endpoint | `ep-billowing-bar-au20886r` | `ep-<new-id>` (different) |
| Hair project | `round-grass-90965139` primary branch | Branch `fyh-phase-0b-staging` or new project |
| Platform | Not used in prod yet | New project + `PLATFORM_DATABASE_URL` |
| Vercel env | Production integration vars | Preview: `HAIR_DATABASE_URL` + `PLATFORM_DATABASE_URL` |
| `FYH_SAAS_TENANT` | `0` | `0` until Phase E |
