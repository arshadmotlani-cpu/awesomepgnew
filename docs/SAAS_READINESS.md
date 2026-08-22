# Hair / salon software — multi-tenant SaaS readiness

**Date:** 2026-08-22  
**Scope:** For Your Hair (`src/hair/`, Hair Neon, Platform org scaffolding).  
**Ask:** Can external salons sign up and use this as isolated accounts?  
**Answer:** **No. Not even close to safe self-serve multi-tenant.** Scaffolding exists (Platform orgs, nullable `organization_id` / `location_id`, cookie org picker, `FYH_SAAS_TENANT` filters). Enforcement is **opt-in and incomplete**. Turning on a second salon on the same Hair DB today would be a **data-isolation failure**, not a UX gap.

Related prior work (do not treat as “done”): `docs/foryourhair/PHASE_0A_SAAS_AUDIT.md`, `docs/foryourhair/PHASE_0B_DECISIONS.md` (stakeholder sign-off **pending**). This document is the blunt 2026-08-22 snapshot of **code as it is**.

There is **no** `salon_id` / `tenant_id` column. The equivalent is mirrored Platform UUIDs: `organization_id`, `location_id`, `user_id` (`src/hair/db/schema/tenantColumns.ts`). **No PostgreSQL FKs** to Platform (different databases).

---

## 1. Data isolation

### How filters work

`src/hair/lib/tenant/flags.ts` — `isFyhSaasTenantEnabled()` is true only when `FYH_SAAS_TENANT=1` or `true`. **Default: off.**

`src/hair/lib/tenant/filters.ts` — `orgFilter` / `locationFilter` return **`undefined` when the flag is off**, so `and(orgFilter(...), eq(...))` becomes an **unscoped** query. `tenantWriteDefaults` writes **no** org/location when the flag is off.

That is the whole game: **tenant columns without enforced WHERE clauses are decoration.**

### Tables missing tenant columns entirely

| Table | Issue |
|-------|--------|
| **`wf_auth_sessions`** | No `organization_id`, no `location_id`. Session is `employee_id` only (`src/workforce/db/schema.ts`). Org is inferred later from cookies + Platform memberships — **only when SaaS flag is on**. |

No other operational `fyh_*` / `wf_*` table was found **without** an `organization_id` column in Drizzle. Almost all of those columns are **nullable** in schema (`organizationIdCol()` has no `.notNull()`).

### Tables that have org/location columns but are still unsafe

**Nullable org on nearly every `fyh_*` / `wf_*` row** — NULL org rows are invisible to `eq(organization_id, tenantOrg)` **or** appear in unscoped queries when the flag is off. Either way, mixed-tenant data is possible.

**SQL migration `0037_saas_not_null.sql` exists** (SET NOT NULL on many tables) but is **not listed** in `src/hair/db/migrations/meta/_journal.json` (journal ends at `0036_saas_unique_indexes`). Hair migrator uses the journal. **Treat 0037 as not part of the applied migration path until it is journaled and gated.**

**Drizzle schema vs SQL 0036:** `0036_saas_unique_indexes.sql` drops global uniques (`fyh_invoices_number_uidx`, `fyh_customers_code_uidx`, …) and creates `(organization_id, …)` uniques. **Drizzle still declares the old global uniques**, e.g.:

- `fyh_invoices_number_uidx` on `invoice_number` alone — `src/hair/db/schema/billing.ts`
- `fyh_customers_code_uidx` on `customer_code` alone — `src/hair/db/schema/customers.ts`

**Unclear without production introspection:** whether 0036 has actually been applied on live Hair DB. If **not** applied, two orgs cannot share invoice numbers. If **applied**, two orgs **can** share the same `invoice_number`, which makes public lookup by number alone a **cross-tenant read** (see §7).

**Documented but not in Drizzle:** `fyh_tenant_mirror` / `fyh_tenant_location_mirror` (Phase 0B) — **not implemented** under `src/hair/db/schema/`.

**Org-only tables (no `location_id` — may be OK for catalog/CRM, still need org):**  
`fyh_customers`, `fyh_settings`, `fyh_staff`, `fyh_products`, `fyh_services`, `fyh_service_categories`, `fyh_brands`, loyalty/membership/package/bridal, notifications, `fyh_financial_ledger`, vendor headers/payments, `fyh_admin_users`, historical import, most `wf_*` except schedules/attendance.

**Location-scoped (have `location_id`):** appointments, invoices/lines/payments/credit notes, stock movements, commissions, attributions, expenses, floor stock, purchases, `fyh_staff_locations`, `fyh_location_stock`, `wf_schedules`, `wf_attendance`.

**SaaS helper tables (NOT NULL org already):** `fyh_org_invoice_sequences`, `fyh_org_customer_sequences`, `fyh_staff_locations`, `fyh_location_stock` (`src/hair/db/schema/saas.ts`).

### Domain money path still unscoped

`src/hair/domain/catalog/adapter.ts` — `loadBillableCatalog()` selects **all** active `fyh_services` / `fyh_products` with **no `orgFilter`**.

`src/hair/domain/checkout/pipeline.ts` — hold/invoice CRUD by id; inserts without `tenantWriteDefaults`.

`src/hair/domain/ledger/service.ts` — ledger by `customerId`, no org on write.

Many **service** modules (`src/hair/services/invoices.ts`, customers, appointments) **do** call `orgFilter` — which is a **no-op** when `FYH_SAAS_TENANT` is unset.

### Platform vs Hair

| DB | Role |
|----|------|
| `PLATFORM_DATABASE_URL` | `platform.users`, `organizations`, `locations`, `memberships`, `plans`, `organization_subscriptions`, `organization_entitlements`, … |
| `HAIR_DATABASE_URL` | All salon ops + workforce |

Integrity is **application + reconcile scripts**, not FKs.

---

## 2. Auth

**Today (default):** one Hair database = one implicit salon. Login is user/employee, not tenant.

| Path | Cookie | Store |
|------|--------|--------|
| Primary | Hair session cookie | `wf_auth_sessions` → `wf_employees` (`src/hair/lib/auth/session.ts` → `getWorkforceSession`) |
| Legacy | same cookie family | `fyh_auth_sessions` + `fyh_admin_users` — **`fyh_admin_users.email` is globally `.unique()`** |

Org/location: cookies `fyh_org_id` / `fyh_location_id` + Platform memberships, resolved in `src/hair/lib/tenant/resolveTenantContext.ts`.

Guards (`src/hair/lib/auth/guards.ts`): redirect to `/select-organization` **only if SaaS flag on**.

UI: `app/(hair)/fyh/(app)/select-organization/page.tsx` exists. App layout (`app/(hair)/fyh/(app)/layout.tsx`) always requires Hair auth.

**Middleware** (`src/hair/middleware/hairMiddleware.ts`): cookie **presence** only, not cryptographic verify. Host allowlist in `src/hair/lib/host.ts` (`fyhair.awesomepg.in`, legacy `foryourhair.*`).

**Single-salon baked in:** default flag off; unscoped queries; global admin email unique; `wf_auth_sessions` not org-tagged; public invoice URL is `/i/[invoiceNumber]` with no org slug.

`isPublicInvoiceLookupAllowed` (`src/hair/services/invoices.ts`): if SaaS **off**, lookup is **allowed with null tenant** → `orgFilter` omitted → **first matching invoice number in the whole DB**. If SaaS **on** and no ctx, lookup returns null (public invoices currently **broken** for unauthenticated multi-tenant unless something else injects ctx — `resolveTenantContextOptional` on the public page typically has **no org cookie**).

---

## 3. Pricing / money logic (`priceBasket` vs `invoiceMath`)

| Function | File | Canonical? | Shared in-memory tenant state? |
|----------|------|------------|--------------------------------|
| `priceBasket` | `src/hair/domain/basket/engine.ts` | **Intended POS/checkout SSOT** (2026-08-01 Quick Sale architecture) | **No** — pure function on a basket snapshot |
| `invoiceMath` (`sumCartLines`, `computeGrandTotalFromParts`) | `src/hair/lib/invoiceMath.ts` | **Still live** for holds / helpers | **No** — pure math |

**Still imported by:** `src/hair/services/quickSale.ts`, `src/hair/services/invoices.ts`, `src/hair/services/quickSaleHold.ts`, tests.

**Writes:** `checkoutFromBasket` in `src/hair/domain/checkout/pipeline.ts` is the persist path (`finalizeQuickSale` and Quick Sale actions import it). Dual **formulas** remain a correctness bug (GST-inclusive engine vs tax-on-net helpers), not a concurrency leak **by themselves**.

**Would two tenants leak via pricing math?** No shared cache keyed without tenant. `hairDb` on `globalThis` is a connection pool. React `cache()` on tenant context is request-scoped.

**Would two tenants leak via pricing callers?** **Yes** — `loadBillableCatalog()` mixes all orgs’ services/products. Unscoped checkout/ledger writes can attach money to the wrong org or to NULL org. That is a **breach**, not a rounding issue.

**Do not tenant-scope pricing until this dual path is collapsed** (Phase 2 sequencing). Simpler to fix with one live salon than N.

Hardcoded GST: `SALON_GST_BPS = 1800` in `src/hair/lib/taxConfig.ts` (and a duplicate in `salonServices.ts`). FEATURES.md: GST fixed 18% “until Settings.” Per-tenant GST without settings wiring will stamp the wrong tax.

---

## 4. Hardcoded “this is my salon”

| Location | What |
|----------|------|
| `src/hair/lib/invoiceBranding.ts` | Legal/print block: name **For Your Hair**, Kadbi Chowk Nagpur address, phone **9823444886**; logo alt Shabana; register **Shabana Makeovers & For Your Hair**. File comment: used on **public/print invoices**, not ERP settings. |
| `src/hair/db/schema/settings.ts` | Defaults: `business_name='For Your Hair'`, `currency='INR'`, `timezone='Asia/Kolkata'`, `invoice_prefix='FYH'`, `default_gst_bps=1800` |
| `src/hair/lib/taxConfig.ts` | 18% GST constant |
| `src/hair/lib/money.ts` | `currency: 'INR'` |
| `src/hair/components/HairAppHeader.tsx` / brand tokens | “For Your Hair” product chrome |
| Notifications / loyalty copy | “…at For Your Hair” |
| `src/hair/lib/invoicePublicLinks.ts` | `FYH_PUBLIC_HOST = 'https://fyhair.awesomepg.in'` |
| `src/lib/brand/fyhBrandTokens.ts` | Product name / tagline |

**Already per-org (underused for print):** `fyh_settings` (`business_name`, `business_address`, `gstin`, …); `platform.organizations.gstin`; `platform.locations.address`.

A second salon would still **print your Nagpur GST identity** on customer invoices until print paths stop importing `invoiceBranding.ts`.

---

## 5. Routing / subdomain

| Mechanism | Status |
|-----------|--------|
| Host | Single FYH host + rewrite to `/fyh/...` |
| Org switch | Cookie + `/select-organization` (v1 in Phase 0B) |
| Subdomain `{slug}.fyhair.app` | **Greenfield** (Phase 0B v2, not built) |
| Platform UI | `/platform/*` — operator/admin, not salon self-serve signup |

A second salon would today log into the **same host** and pick an org **if** SaaS flag + memberships exist. There is **no** isolated hostname per tenant.

---

## 6. Billing (SaaS subscription)

| Area | Finding |
|------|---------|
| Hair POS | Cash/UPI/card/wallet on invoices — **not** SaaS billing |
| Stripe | **None** found for Hair/Platform SaaS |
| Razorpay | **PG product only** (`src/lib/payments/*`, `PAYMENT_PROVIDER`) — do not reuse blindly for salon SaaS |
| Platform | Tables `platform.plans`, `organization_subscriptions`, `organization_entitlements`, `subscription_events`. Admin UI can set trial/active. **No payment gateway wired.** Membership load can gate on subscription status (`src/platform/services/memberships.ts`) |

Self-serve paid signup is **not started**.

---

## 7. Severity ranking (breach first)

### CRITICAL — one salon can see or mutate another’s data

1. **`FYH_SAAS_TENANT` default off** → all `orgFilter`/`locationFilter` no-ops → full Hair DB is one tenant.
2. **Unscoped catalog + checkout + ledger domain layer** — POS reads/writes without org even if the flag is later turned on, until those files are fixed.
3. **Public invoice by number** when SaaS is off (current default): `isPublicInvoiceLookupAllowed(null) === true` + unscoped `WHERE invoice_number = ?`. After per-org invoice numbers, **Org B can open Org A’s `/i/INV-0001`**.
4. **Nullable `organization_id`** + unscoped writes → rows with NULL org; mixed into every “list all” query.
5. **No Hair-side org mirror / existence check** — forged or stale `fyh_org_id` cookie is only as good as `resolveTenantContext` (and that path is **skipped** when the flag is off).

### HIGH

6. Schema/SQL drift: Drizzle global uniques vs migration 0036; 0037 NOT NULL not in journal.
7. `fyh_admin_users.email` globally unique; `wf_auth_sessions` not org-scoped.
8. Hardcoded Shabana/FYH invoice legal identity + GST constant.
9. Remaining global uniques if 0036 not applied (invoice number, customer code, brands, categories, notification kind, purchase numbers, employee mobile/email).
10. `fyh_products.stock_qty` vs `fyh_location_stock` — stock can still be global (Phase 0B decision 5 not fully cut over). **Unclear** how complete.

### MEDIUM

11. Public invoice URLs have no org slug/token — even with filters on, unauthenticated customers cannot be tenant-routed safely.
12. `fyh_settings` has no unique on `organization_id` in schema — multiple settings rows per org.
13. Platform subscriptions admin-only; no self-serve billing.
14. Host/public URL hardcoded to fyhair.awesomepg.in.

### LOW

15. INR / Kolkata / ₹ as product defaults (India-first, not a leak).
16. Process-local login rate-limit Map.
17. Subdomain routing not built (blocked correctly until isolation exists).

---

## How far from multi-tenant-ready?

**Distance: a production single-tenant ERP with incomplete SaaS scaffolding.**

You cannot onboard “Salon 2” on this Hair database without a **cross-tenant incident** unless:

1. Dual pricing paths are collapsed first (correctness), then  
2. Every read/write including **domain** catalog/checkout/ledger is org-scoped **with tests that fail if `orgFilter` is missing**, then  
3. NOT NULL + backfill + journaled migrations, then  
4. SaaS flag on in staging with two synthetic orgs and a **hostile** test (Org A session must 404 Org B invoices, catalog, customers), then  
5. Public invoice URLs become unguessable or org-scoped, then  
6. Auth session carries org, then  
7. Billing and subdomains.

**Do not** enable `FYH_SAAS_TENANT` in production as a shortcut. **Do not** start Phase 2 tenant-id spray until Phase 0 gaps above are sequenced (pricing cleanup **before** tenant-scoping money).

Phase 1 marketing waitlist (`saas_waitlist_signups`) is **lead capture only** — it does not make the ERP multi-tenant.

**Conversion sequence (plan only):** [`docs/SAAS_MULTITENANT_PLAN.md`](./SAAS_MULTITENANT_PLAN.md) — pricing SSOT first, then schema/backfill, then scoped queries/public invoices, then session, then SaaS billing, then subdomains. Do not skip gates.
