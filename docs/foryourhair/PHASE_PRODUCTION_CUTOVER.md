# FYHAIR SaaS — Production Cutover Runbook

**Status:** Planning / pre-execution  
**Last updated:** 2026-08-21  
**Scope:** Complete production cutover for FYHAIR multi-tenant SaaS — **do not execute until final approval**

---

## Safety lock (read first)

**Until you explicitly approve the final cutover window, do NOT:**

| Action | Status |
|--------|--------|
| Run production Hair or Platform migrations | **BLOCKED** |
| Write production Hair or Platform data (bootstrap/backfill) | **BLOCKED** |
| Set `FYH_SAAS_TENANT=1` on Vercel **Production** | **BLOCKED** |
| Set `WORKFORCE_MEMBERSHIP_AUTH=1` on Vercel **Production** | **BLOCKED** |
| Add `PLATFORM_DATABASE_URL` to Vercel **Production** | **BLOCKED** (until Phase 1) |
| Change DNS (GoDaddy / Vercel domains) | **BLOCKED** |
| Delete production Hair data | **FORBIDDEN** |
| Wipe production Platform DB after bootstrap | **FORBIDDEN** |

**Production defaults must remain:**

```
FYH_SAAS_TENANT=0
WORKFORCE_MEMBERSHIP_AUTH=0
```

With flags off, tenant filters are no-ops and existing single-tenant FYH behavior continues unchanged.

---

## 1. Repository audit (2026-08-21)

### Git state

| Check | Result |
|-------|--------|
| Branch | `main` @ `f3f0275d` — synced with `origin/main` |
| SaaS code committed & pushed | **Yes** — Phase 0B foundation through Platform Admin console |
| Uncommitted SaaS-related files | `scripts/hair-saas-staging-reset.ts`, `scripts/hair-saas-staging-verify.ts` (staging ops only) |
| Unrelated uncommitted | `docs/CURRENT_STATE.md` (vault sync — not cutover-critical) |

### Committed SaaS surface (HEAD)

| Area | Location | Notes |
|------|----------|-------|
| Platform schema + migrations | `src/platform/db/migrations/0001_*`, `0002_*` | `platform.*` schema |
| Hair tenant schema | `0034_saas_tenant_nullable`, `0035_saas_support_tables`, `0036_saas_unique_indexes` | Auto via `hair:db:migrate` |
| NOT NULL constraints | `0037_saas_not_null.sql` | **Not in migration journal** — manual `hair:saas:apply-not-null` only |
| Tenant layer | `src/hair/lib/tenant/*` | Flags, filters, cookies, `resolveTenantContext` |
| Platform services | `src/platform/services/admin.ts`, `memberships.ts` | Org provisioning, subscription gating |
| Platform Admin UI | `app/(platform)/platform/admin/*` | SaaS control center |
| Salon team RBAC | `src/hair/lib/auth/teamManagementAccess.ts`, `src/hair/actions/team.ts` | Owner/co-owner/manager/biller/staff |
| Bootstrap CLI | `scripts/hair-saas-bootstrap-platform.ts`, `backfill-tenant.ts`, etc. | **Staging-gated** (`requireStagingEnv`) |
| Staging runbooks | `PHASE_0B_STAGING_CUTOVER.md`, operator guide | Validated on Preview |

### Automated test baseline (read-only, this session)

```
node --import tsx --test tests/hair/unit/tenant*.test.ts \
  tests/hair/unit/teamManagementAccess.test.ts \
  tests/hair/unit/publicInvoiceTenantIsolation.test.ts \
  tests/hair/unit/workforceOrgScoping.test.ts \
  tests/platform/unit/*.test.ts
→ 28 pass, 0 fail, 2 skip (DB-gated invitation tests)
```

Preview/staging E2E manually verified by operator (2026-08-21).

### Known code gaps before production bootstrap

| Gap | Risk | Mitigation in cutover |
|-----|------|----------------------|
| Bootstrap script uses `requireStagingEnv()` — **refuses production Hair host** | Cannot run existing scripts against prod without new gate | Phase 3: production safety gate + `CONFIRM_PRODUCTION_CUTOVER=1` (see §Blockers) |
| `hair-saas-bootstrap-platform.ts` sets `role` but not `accessRole` on memberships | RBAC reads `access_role`; default is `staff` | Patch script OR post-bootstrap SQL to set `access_role` from `wf_engine_memberships` |
| Bootstrap role heuristic (`arshad` email → owner) | Wrong roles for production staff | Map from `wf_engine_memberships.rank` + `job_role` explicitly |
| Subdomain → org resolution | Not implemented | v1: org from Platform membership + cookies, not hostname |
| Public invoice URLs | Global invoice number; org scope enforced when SaaS flag on | v1 acceptable for single org; multi-org needs slug in URL (future) |

---

## 2. Architecture preserved (no redesign)

```
┌─────────────────────────────────────────────────────────────────┐
│  Single Vercel deployment (awesomepg monorepo)                  │
├─────────────────────────────────────────────────────────────────┤
│  PLATFORM_DATABASE_URL          HAIR_DATABASE_URL               │
│  (new — prod Neon project)      (existing — ep-billowing-bar…)  │
│  • platform.users               • fyh_* business data           │
│  • platform.organizations       • wf_* workforce                │
│  • platform.locations           • organization_id / location_id │
│  • platform.memberships         • (mirrored UUIDs, no cross-FK) │
│  • platform.invitations                                         │
│  • platform.plans / subscriptions / entitlements                │
│  • platform.platform_memberships (super-admin)                  │
└─────────────────────────────────────────────────────────────────┘
```

**Authority model (unchanged):**

| Role | Scope |
|------|-------|
| **PLATFORM ADMIN** | SaaS owner — orgs, plans, subscriptions, platform users; via `platform.platform_memberships`; **not creatable from salon UI** |
| **OWNER** | Full org access |
| **CO_OWNER** | Org-level access |
| **MANAGER** | Operations; cannot assign owner/co-owner |
| **BILLER** | Billing/appointments billing; no team mgmt; no stock qty changes |
| **STAFF** | Own appointments, performance, permitted sales |

---

## 3. Execution order (complete runbook)

Execute phases **in order**. Do not skip gates. Each gate is PASS/FAIL in §18.

```
Phase 0  — Pre-cutover (read-only)           ← YOU ARE HERE
Phase 1  — Provision production Platform DB  ← Neon + Vercel (no Hair writes)
Phase 2  — Hair additive schema on PROD      ← migrations 0034–0036 only
Phase 3  — Bootstrap Platform + backfill Hair ← DATA WRITES (maintenance window)
Phase 4  — Verify checksums + login          ← flags still OFF
Phase 5  — Deploy code + soak flags OFF        ← production behavior unchanged
Phase 6  — Enable SaaS flags (canary)        ← FYH_SAAS_TENANT=1 + WORKFORCE_MEMBERSHIP_AUTH=1
Phase 7  — NOT NULL constraints              ← after Phase 6 green
Phase 8  — DNS polish (optional)             ← vanity subdomains
Phase 9  — First net-new customer via UI     ← normal onboarding, no DB scripts
```

---

## A. Production Platform database

### A1. Provision (Neon Console — **you click**)

1. Create a **new Neon project** (recommended name: `awesomepg-platform-production`).
   - **Do not** reuse PG (`DATABASE_URL`), Hair, Capital, or Owner projects.
2. Copy the **pooled** connection string (`…-pooler…`).
3. Store as `PLATFORM_DATABASE_URL` — **do not set on Vercel Production until Phase 1 gate passes**.

### A2. Required env var

| Variable | Production purpose |
|----------|-------------------|
| `PLATFORM_DATABASE_URL` | Dedicated Platform SaaS identity DB |

Isolation enforced in code: `assertPlatformDatabaseIsolated()` — must ≠ `DATABASE_URL`, `HAIR_DATABASE_URL`, `INVEST_DATABASE_URL`, `OWNER_DATABASE_URL`.

### A3. Migration commands (Phase 1 — against Platform URL only)

```bash
# Local shell — paste PRODUCTION Platform URL (never commit)
export PLATFORM_DATABASE_URL='postgresql://…@ep-<PLATFORM-PROD>…/neondb?sslmode=require'

npm run platform:db:migrate
```

**Migration order (automatic):**

1. `0001_platform_initial.sql` — schema `platform`, users, orgs, locations, memberships, plans, subscriptions
2. `0002_platform_admin_lifecycle.sql` — `access_role`, invitations, subscription events, status constraints

### A4. GATE 1 — Platform DB isolation (SQL, read-only)

```sql
-- Must return exactly one row: platform
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'platform';

-- Pre-bootstrap: expect 0
SELECT COUNT(*) FROM platform.organizations;

-- Confirm NOT connected to Hair/PG (run from your shell, not SQL)
-- npm run env:check -- --product=platform
-- Host must NOT contain: ep-billowing-bar-au20886r
-- Host must NOT equal DATABASE_URL host
```

### A5. Production plan + platform super-admin (Phase 1 — after migrate)

**Plan (SQL or Platform Admin UI after first deploy with URL set):**

```sql
INSERT INTO platform.plans (slug, name, limits)
VALUES ('fyhair-production', 'FYHAIR Production', '{"locations": 1, "seats": 50}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
```

**Platform super-admin (you):**

Option A — after Phase 5 deploy with `PLATFORM_DATABASE_URL` on Production:

1. Visit `/platform/auth/login` on production host.
2. Use Platform Admin → Users to grant platform admin membership.

Option B — one-time CLI (requires Platform URL + your user row):

```bash
# Uses setPlatformAdminMembership in src/platform/services/admin.ts
# Pattern: create platform_users row + platform.platform_memberships
# Prefer Option A once Platform auth is live on production.
```

**Never** create platform admin from FYH salon Team UI — enforced by routing (`/platform/*` only) and absence of salon-side API.

---

## B. Existing production Hair database

**Rule: zero deletes. Additive schema + backfill only.**

Production Hair Neon:

| Item | Value |
|------|--------|
| Project ID | `round-grass-90965139` |
| Primary endpoint | `ep-billowing-bar-au20886r` |
| ~Customers | ~2,910 |
| ~Invoices | ~1,992 |
| ~Appointments | ~1,953 |

(Fresh counts: run `npx tsx scripts/hair-db-introspection-readonly.ts` before cutover — read-only.)

### B1. Phase 2 — Additive Hair schema (no data change)

**Before:** Neon **branch snapshot** or point-in-time backup of primary.

```bash
export HAIR_DATABASE_URL='postgresql://…@ep-billowing-bar-au20886r-pooler…/neondb?sslmode=require'
# DO NOT set STAGING_ONLY=1
# DO NOT set FYH_SAAS_TENANT=1

npm run hair:db:migrate
```

Applies through `0036_saas_unique_indexes` only. **`0037` NOT NULL is Phase 7.**

Verify nullable columns exist:

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'fyh_customers' AND column_name = 'organization_id';
-- expect 1 row

SELECT COUNT(*) FROM fyh_customers WHERE organization_id IS NOT NULL;
-- expect 0 before backfill
```

**Flags remain OFF** — app behavior unchanged after schema-only migrate.

### B2. Phase 3 — Bootstrap first organization (Platform + Hair link)

Represents the **existing salon** (not a empty tenant).

**Source of truth for org metadata:** singleton `fyh_settings` row:

| Field | Platform target |
|-------|-----------------|
| `business_name` | `platform.organizations.name` |
| `timezone` | `platform.organizations.default_timezone` |
| `gstin` | `platform.organizations.gstin` |
| `business_address` | `platform.locations.address` |
| `invoice_prefix` | `fyh_org_invoice_sequences.prefix` |

**Suggested slug:** `for-your-hair` (from business name — must be unique in Platform).

**Bootstrap steps (maintenance window):**

```bash
export HAIR_DATABASE_URL='…production hair…'
export PLATFORM_DATABASE_URL='…production platform…'
export CONFIRM_PRODUCTION_CUTOVER=1   # required once production gate script exists

# 1. Create Platform org, location, users, memberships, subscription=active
npm run hair:saas:bootstrap-platform   # ⚠ today: staging-gated — see Blockers

# 2. Backfill organization_id / location_id on all Hair rows
npm run hair:saas:backfill-tenant

# 3. Verify null counts + financial checksums
npm run hair:saas:bootstrap-verify
npm run hair:saas:tenant-reconcile
```

**Tables backfilled** (from `scripts/hair-saas-backfill-tenant.ts`):

- **Org-only (37 tables):** settings, customers, CRM, catalog, vendors, loyalty, notifications, admin, wf_* payroll, etc.
- **Org + location (27 tables):** appointments, invoices, payments, stock movements, purchases, expenses, wf_schedules, wf_employees, etc.
- **Derived rows:** `fyh_staff_locations`, `fyh_location_stock` from existing `fyh_products.stock_qty`

**Preserves:** every customer, invoice, appointment, payment, product, inventory row — only adds tenant UUID columns.

### B3. Workforce → Platform identity link

For each active `wf_employees` with `can_login`:

1. Create `platform.users` (email + existing `password_hash`).
2. Set `wf_employees.user_id` = platform user id.
3. Create `platform.memberships` with correct **`access_role`** (owner/co_owner/manager/biller/staff).
4. Create `platform.membership_locations` → primary location.
5. Preserve `wf_auth_sessions` — **existing `fyh_session` cookie path unchanged**.

Legacy `fyh_admin_users`: same email → same platform user; bridge via `employeeToHairAdmin()` continues.

### B4. Login transition (no lockout)

| Phase | What staff experience |
|-------|----------------------|
| **Before cutover (flags OFF)** | Login at `fyhair.awesomepg.in/login` → workforce session → full access (today) |
| **After backfill, flags OFF** | Identical — tenant columns populated but ignored |
| **After flags ON** | Same login URL + password; session resolves Platform membership; single org auto-selected; cookies `fyh_org_id`, `fyh_location_id` set on login |
| **Password** | Unchanged — copied from `wf_employees.password_hash` at bootstrap |
| **Forced logout** | Not required — existing sessions remain valid until expiry; re-login picks up tenant cookies |

**Dual-read safety:** If Platform membership resolution fails while flags are ON, investigate before proceeding — do not enable flags until bootstrap verify passes.

**Owner identity:** Map ecosystem/super admin to `access_role = 'owner'` on bootstrap org membership. Confirm explicitly in GATE 7.

---

## C. Tenant safety verification

### C1. Org-scoped tables (must have `organization_id` after backfill)

All tables in `ORG_ONLY_TABLES` + `ORG_LOC_TABLES` in `hair-saas-backfill-tenant.ts`, plus support tables from `0035`:

- `fyh_org_invoice_sequences`, `fyh_org_customer_sequences`, `fyh_location_stock`, `fyh_staff_locations`

### C2. Location-scoped tables (must have `location_id`)

Appointments, invoices, billing children, stock, purchases, expenses, wf_schedules, wf_attendance, wf_employees (org+loc).

### C3. Service-layer TenantContext

When `FYH_SAAS_TENANT=1`:

- `orgFilter` / `locationFilter` in `src/hair/lib/tenant/filters.ts` enforce predicates.
- `requireTenantContext()` throws if context missing on guarded paths.
- Integration proof: `tests/hair/integration/tenantIsolation.test.ts`

### C4. Public invoice routes

- `/i/[invoiceNumber]`, `/invoice/[invoiceNumber]` — tenant-scoped reads when flag on.
- Test: `tests/hair/unit/publicInvoiceTenantIsolation.test.ts`

### C5. Workforce org scoping

- `wf_engine_memberships.organization_id` backfilled.
- Test: `tests/hair/unit/workforceOrgScoping.test.ts`

### C6. Cross-tenant isolation

- Staging proof: `scripts/hair-saas-staging-verify.ts` (temp org B).
- Production: run reconcile + spot-check after bootstrap; full multi-org isolation matters when org #2 exists.

### C7. Location isolation

- Enforced via `membership_locations` + `locationFilter` on location-scoped services.
- Single-location bootstrap: all rows get primary `location_id` — matrix testing when location #2 added.

---

## D. RBAC verification

Enforcement layers:

| Layer | Module |
|-------|--------|
| Team UI caps | `teamManagementAccess.ts` — `allowedAssignRolesForMembershipRole` |
| Server actions | `src/hair/actions/team.ts` — `canAssignTeamRole` |
| Permissions | `WORKFORCE_MEMBERSHIP_AUTH=1` → Platform `access_role` templates |
| Platform admin | `platform.platform_memberships` — separate from org memberships |

**Production checks (GATE 10):**

| Actor | Can | Cannot |
|-------|-----|--------|
| Owner | All salon ops + team invite all roles | Create platform admin |
| Co-owner | Same as owner for org ops | Create platform admin |
| Manager | Invite/edit manager, biller, staff | Assign owner/co-owner |
| Biller | Billing workflows | Team mgmt, stock qty changes |
| Staff | Own scope only | Team mgmt, billing admin |
| Salon user | — | Access `/platform/admin` |
| Platform admin | SaaS console | Impersonate without audit (future) |

Tests: `tests/hair/unit/teamManagementAccess.test.ts`, staging verify RBAC section.

---

## E. Subscription

### E1. Production plan setup

```sql
-- After platform migrate
INSERT INTO platform.plans (slug, name, limits) VALUES (…);
```

### E2. First existing salon subscription

Bootstrap script creates:

```sql
INSERT INTO platform.organization_subscriptions
  (organization_id, plan_id, status)
VALUES (…, …, 'active');
```

**Critical:** Status must be `active` (or `trial` / `past_due`) — **not** `suspended` / `cancelled`.

`loadMembershipForUserOrg()` blocks when subscription status ∉ `{trial, active, past_due}`.

### E3. Status behavior

| Status | Salon access when SaaS ON |
|--------|----------------------------|
| `trial` | Allowed |
| `active` | Allowed |
| `past_due` | Allowed (grace) |
| `suspended` | **Blocked** |
| `cancelled` | **Blocked** |

### E4. Avoid accidental lockout during migration

1. Keep `FYH_SAAS_TENANT=0` through Phases 2–5 — subscription gating not enforced in FYH app.
2. Create subscription `active` **before** enabling flags (Phase 3 bootstrap).
3. Only enable flags after GATE 7 (owner login) passes on staging-like verification.

---

## F. Vercel environment variables

**Do not change Production env until Phase 1 approval.**

### Production (Vercel → Production environment)

| Variable | Cutover value | Purpose |
|----------|---------------|---------|
| `HAIR_DATABASE_URL` or `HAIR_DATABASE_*` | **Unchanged** — existing Neon integration | Hair business DB |
| `DATABASE_URL` | **Unchanged** | Awesome PG |
| `INVEST_DATABASE_URL` | **Unchanged** | Capital |
| `OWNER_DATABASE_URL` | **Unchanged** | Owner OS |
| `PLATFORM_DATABASE_URL` | **New** — Phase 1+ | Platform SaaS identity |
| `FYH_SAAS_TENANT` | `0` until Phase 6 → then `1` | Tenant filter enforcement |
| `WORKFORCE_MEMBERSHIP_AUTH` | `0` until Phase 6 → then `1` | Platform membership permissions |
| `AUTH_SECRET` | **Unchanged** (≥32 chars) | Session signing (PG + Platform + Hair) |
| `HAIR_ADMIN_EMAIL` / `HAIR_ADMIN_PASSWORD` | If used for seed/smoke | Legacy admin bootstrap only |

**Do not set on Production unless needed:**

- `STAGING_ONLY`
- `FYH_BOOTSTRAP_ORG_ID` / `FYH_BOOTSTRAP_LOC_ID` (emergency override only)

### Preview / Staging (Vercel → Preview)

| Variable | Current validated value |
|----------|-------------------------|
| `HAIR_DATABASE_URL` | `ep-noisy-forest-autehrcv` (fyh-phase-0b-staging) |
| `PLATFORM_DATABASE_URL` | `ep-green-feather-aun0w5jc` (awesomepg-platform-staging) |
| `FYH_SAAS_TENANT` | `1` (after staging cutover) |
| `WORKFORCE_MEMBERSHIP_AUTH` | `1` (after staging cutover) |

Verify: `npx tsx scripts/staging-verify-vercel-env.ts` (read-only Vercel API).

---

## G. DNS / domain architecture

### Current production domains (from repo)

| Host | Product | Config |
|------|---------|--------|
| `www.awesomepg.in` | Awesome PG | `middleware.ts` apex → www redirect |
| `fyhair.awesomepg.in` | FYHAIR salon app | `src/hair/lib/host.ts` → `isHairHost` |
| `foryourhair.awesomepg.in` | FYHAIR legacy alias | Same |
| `invest.awesomepg.in` | Automotive Capital | Capital middleware |
| `owner.*` | Owner OS | Owner middleware |
| `/platform/*` | Platform SaaS | **Any host** — `platformMiddleware` in `middleware.ts` |

**Single Vercel project** — no per-salon Vercel projects.

### Recommended v1 production DNS (minimal change)

| URL | Purpose | Required? |
|-----|---------|-----------|
| `fyhair.awesomepg.in` | Salon application (existing users) | **Yes — keep** |
| `fyhair.awesomepg.in/platform/admin` | Platform Admin console | **Yes — works today** |
| `admin.fyhair.awesomepg.in` | Vanity alias → same deployment | Optional (professional) |
| `app.fyhair.awesomepg.in` | Alias to salon app | Optional |

**Separate admin subdomain:** **Not required.** Platform routes are path-based (`/platform/*`) and host-agnostic. Add `admin.fyhair…` only for branding/bookmarks.

### Future multi-salon URLs (v2 — not in current code)

| URL | Purpose | Implementation status |
|-----|---------|----------------------|
| `{slug}.fyhair.awesomepg.in` | Per-salon entry | **Not built** — Phase 0B decision: org picker on single host for v1 |
| Wildcard DNS `*.fyhair.awesomepg.in` | Auto salon URLs | Requires middleware hostname → org slug lookup |

**Today:** new salon org slug is stored in `platform.organizations.slug` but URL is **not** auto-provisioned from slug. Onboarding uses shared app host + org cookie / picker.

### GoDaddy + Vercel setup (when approved — Phase 8)

1. **Vercel** → Project → Domains → Add:
   - `admin.fyhair.awesomepg.in` (optional CNAME to `cname.vercel-dns.com`)
2. **GoDaddy** → DNS → CNAME:
   - `admin.fyhair` → Vercel target
3. **SSL:** Automatic via Vercel (Let's Encrypt).
4. **Wildcard (future):** CNAME `*.fyhair` → Vercel + enable wildcard cert on Vercel Pro.

**Do not change DNS until Phase 8 gate.**

---

## H. First customer onboarding flow (production)

After cutover, **net-new customers** use Platform Admin UI only — no manual DB.

```
YOU (Platform Admin)
  │
  ├─► /platform/admin/onboarding
  │     • Organization name + slug
  │     • Primary location
  │     • Plan selection
  │     • Subscription status (trial/active)
  │     • First owner name + email
  │
  ├─► createOrganizationWithOwnerInvite()
  │     • Platform: org, location, user, membership, subscription, invitation
  │     • Hair: fyh_settings, sequences via provisionHairOrganization()
  │     • Hair: wf_employees stub via ensureHairLoginEmployee() after invite accept
  │
  ├─► Owner receives invitation → accepts → sets password
  │
  ├─► Owner logs in (/platform/auth/login or fyhair /login workforce path)
  │
  ├─► Owner → Team UI → invites manager / biller / staff
  │
  └─► Staff operate within RBAC caps
```

**Existing salon (bootstrap path):** same data model, but created via Phase 3 bootstrap script instead of onboarding wizard — one-time migration.

---

## 4. Production rollback plan (non-destructive)

**Principle:** Roll back **flags and config**, not business data.

| Problem | Rollback | Data impact |
|---------|----------|-------------|
| SaaS flags cause auth/tenant issues | Set `FYH_SAAS_TENANT=0`, `WORKFORCE_MEMBERSHIP_AUTH=0` on Vercel Production → redeploy | **None** — filters become no-ops |
| Platform membership blocks login | Flags OFF restores workforce-only auth | **None** |
| Wrong tenant backfill | **Do not** delete rows — flags OFF first; fix IDs with targeted UPDATE | No deletes |
| Subscription wrongly suspended | `UPDATE platform.organization_subscriptions SET status='active'` | **None** on Hair |
| Schema migrate failure | Restore Hair from Neon snapshot (Phase 2 backup) | Restore point only if migrate partial |
| NOT NULL applied too early | Restore from pre-Phase-7 snapshot | Last resort |
| DNS vanity subdomain issues | Remove CNAME — primary `fyhair.awesomepg.in` unchanged | **None** |

**Never rollback by:**

- Dropping `organization_id` columns on production
- Deleting customers/invoices
- Pointing Hair at a different empty database

**Rollback verification (GATE 18):** With flags OFF, confirm legacy login + invoice totals match pre-cutover checksum file.

---

## 5. Production gates checklist (18 gates)

| Gate | Name | Pass criteria | Phase |
|------|------|---------------|-------|
| **G1** | Platform DB isolation | `platform` schema exists; host ≠ Hair/PG/Capital/Owner; 0 orgs pre-bootstrap | 1 |
| **G2** | Hair DB backup | Neon snapshot / branch saved; checksum JSON exported | 2 pre |
| **G3** | Hair migration | `0034`–`0036` applied; nullable columns exist; **flags OFF** | 2 |
| **G4** | Platform migration | `0001`–`0002` applied; plans row ready | 1 |
| **G5** | Data counts pre | `hair-db-introspection-readonly.ts --json` saved | 3 pre |
| **G6** | Existing login | Workforce login works with **flags OFF** post-migrate | 4 |
| **G7** | Owner login | Owner login + dashboard with **flags ON** (canary) | 6 |
| **G8** | Tenant isolation | Reconcile passes; org A cannot read org B (when 2 orgs exist) | 6 |
| **G9** | Location isolation | Membership location caps enforced in services | 6 |
| **G10** | RBAC | manager/biller/staff caps match matrix (server enforced) | 6 |
| **G11** | Billing/invoices | Invoice register totals = pre-cutover checksum | 6 |
| **G12** | Inventory | Stock quantities match; location_stock seeded | 6 |
| **G13** | Appointments | Create + checkout + pay on production canary | 6 |
| **G14** | Subscription gating | Suspend blocks; active restores (test org or staging repeat) | 6 |
| **G15** | Production canary | 24h soak with flags ON on production host | 6 |
| **G16** | DNS | Optional vanity domains resolve + SSL valid | 8 |
| **G17** | SaaS flag enablement | Production `FYH_SAAS_TENANT=1` + `WORKFORCE_MEMBERSHIP_AUTH=1` signed off | 6 |
| **G18** | Rollback verified | Flags OFF restores legacy behavior; checksums match | Post-cutover drill |

---

## 6. What is complete vs remaining

### Complete

- [x] SaaS application code on `main` (tenant layer, Platform Admin, team RBAC, provisioning services)
- [x] Hair + Platform migrations authored (`0034`–`0036`, `0001`–`0002`)
- [x] Staging Neon DBs provisioned and connected to Preview
- [x] Staging bootstrap/backfill/verify scripts
- [x] Preview E2E manual validation (2026-08-21)
- [x] Staging SaaS flags ON validation (7/7 verify script)
- [x] Platform Admin professional UI deployed to Preview
- [x] Regression tests green (staging session)

### Remaining (before production cutover)

- [ ] **Production Platform Neon project** + `PLATFORM_DATABASE_URL`
- [ ] **Production safety gate** for bootstrap scripts (today: staging-only)
- [ ] **Fix bootstrap `access_role` mapping** for production workforce
- [ ] **Pre-cutover production introspection** snapshot (read-only)
- [ ] **Phase 2–7 execution** on production (approved window)
- [ ] **Commit** staging reset/verify scripts (optional but recommended)
- [ ] **Production canary soak** with flags ON
- [ ] **DNS vanity** (optional Phase 8)
- [ ] **Subdomain per salon** (future product — not blocking v1)

---

## 7. Automation vs manual clicks

| Task | Who |
|------|-----|
| Create production Platform Neon project | **You** — Neon Console |
| Copy connection strings to password manager | **You** |
| Set Vercel Production env vars | **You** — Vercel Dashboard |
| Neon Hair snapshot before migrate | **You** — Neon Console |
| `npm run platform:db:migrate` (prod URL) | **Agent/You** — CLI with exported URL |
| `npm run hair:db:migrate` on production | **Agent/You** — maintenance window |
| Bootstrap + backfill + verify | **Agent/You** — after production gate script |
| Enable SaaS flags on Production | **You** — Vercel Dashboard |
| GoDaddy DNS records | **You** |
| Platform Admin onboarding for customer #2+ | **You** — UI |
| Rollback flag flip | **You** — Vercel (instant) |

---

## 8. Blockers

| # | Blocker | Severity |
|---|---------|----------|
| 1 | **No production `PLATFORM_DATABASE_URL`** | Hard — Phase 1 |
| 2 | **Bootstrap scripts refuse production Hair host** (`requireStagingEnv`) | Hard — need production gate before Phase 3 |
| 3 | **Bootstrap `access_role` not set** from workforce ranks | Hard — wrong RBAC if unpatched |
| 4 | **Production bootstrap never run** | Hard — data path unproven on prod volume |
| 5 | **NOT NULL (`0037`) destructive** — wrong order causes outage | Medium — strict phase order |
| 6 | **Subdomain routing not implemented** | Low for v1 — single salon + shared host OK |

---

## 9. Exact next action (recommended)

**Step 1 (you, ~15 min, zero production risk):**

1. Neon Console → Create project **`awesomepg-platform-production`**
2. Copy pooled connection string to your secrets manager (**do not** add to Vercel Production yet)
3. Local shell with that URL only:
   ```bash
   export PLATFORM_DATABASE_URL='postgresql://…'
   npm run platform:db:migrate
   npm run env:check -- --product=platform
   ```
4. Run GATE 1 SQL (§A4) — confirm `platform` schema, 0 orgs, host isolation

**Step 2 (agent, before Phase 3):**

- Add `scripts/production-safety-gate.ts` + patch `hair-saas-bootstrap-platform.ts` for `access_role` mapping from `wf_engine_memberships`
- Commit staging reset/verify scripts
- **Still no production Hair writes**

---

## 10. Related documents

- [PHASE_0B_STAGING_CUTOVER.md](./PHASE_0B_STAGING_CUTOVER.md) — staging reference (validated)
- [PHASE_0B_BOOTSTRAP_MIGRATION.md](./PHASE_0B_BOOTSTRAP_MIGRATION.md) — backfill design
- [PHASE_0B_AUTH_MIGRATION.md](./PHASE_0B_AUTH_MIGRATION.md) — login continuity
- [PHASE_0B_STAGING_OPERATOR_GUIDE.md](./PHASE_0B_STAGING_OPERATOR_GUIDE.md) — Neon/Vercel wiring
- [ENV_CONTRACT.md](../ENV_CONTRACT.md) — monorepo env rules

---

## Confirmation log

| Check | 2026-08-21 |
|-------|------------|
| Production Hair written | **No** |
| Production Platform written | **No** |
| Production Vercel env changed | **No** |
| Production DNS changed | **No** |
| `FYH_SAAS_TENANT` on Production | **Not enabled** (expected unset/0) |
| This document executed cutover | **No — plan only** |
