# For Your Hair ERP — Release Readiness Report

**Date:** 2026-07-29  
**Scope:** Release Candidate verification (scenarios 1–20) against local non-production Hair Neon (`HAIR_DATABASE_URL` / Vercel `HAIR_DATABASE_*` vars).  
**Constraints:** Bug fixes and wiring only — no new product features.

---

## Verdict

**Production Ready** — for salon go-live on the Hair host and dedicated Hair database, subject to the deployment checklist below.

| Gate | Status |
|------|--------|
| Critical issues | **0** |
| Major issues | **0** |
| Integration scenarios 1–20 (service + DB) | **14/14 pass** (`tests/hair/integration/rcVisitLoop.test.ts`) |
| Playwright Hair UI (scenarios 1–20 UI smoke + edge + responsive) | **20/20 pass** (`tests/e2e/hair/*`, project `hair-setup` + `hair`) |
| Hair unit tests | **Pass** (`tests/hair/unit/*`) |

---

## UAT Phase 1 — Data integrity (2026-07-29)

| Item | Fix |
|------|-----|
| **UAT-C1** | Service consumable `deductInventory` preserved on save; per-row deduct toggle in service form; tests `serviceConsumablesPreserve.test.ts`, `consumableDeduction.test.ts`. |
| **UAT-C2** | Dashboard **Staff on schedule** counts distinct active stylists with appointments today (salon TZ), excluding `isOff` leave. |

No database migration required (column already exists).

---

## Test execution summary

| Layer | Command (local) | Result |
|-------|-----------------|--------|
| Integration + money | `node --import tsx --test tests/hair/integration/rcVisitLoop.test.ts` | 14/14 |
| Unit | `node --import tsx --test tests/hair/unit/*.test.ts` | Pass |
| E2E | `HAIR_DEV_HOST=1 npx playwright test --project=hair-setup --project=hair --workers=1` | 20/20 |

**Environment:** `HAIR_DEV_HOST=1`, admin `HAIR_ADMIN_EMAIL` / `HAIR_ADMIN_PASSWORD`, migrations through `0011`, `npm run hair:db:seed` for RC fixtures.

**Evidence (automated UI):** Playwright covers desktop (1280×800), tablet (820×1180), and mobile (390×844) in `hair-responsive.spec.ts`. Print window features checked in `hair-edge.spec.ts` (scenario 16). See `docs/qa/hair-rc/README.md` for the verification matrix.

---

## Bugs found (RC)

| ID | Severity | Scenario | Description |
|----|----------|----------|-------------|
| RC-001 | **Major** | 3, 12 | Package plan missing from seed → loyalty sell UI empty |
| RC-002 | **Major** | 11 | Commission “mark paid” not wired in loyalty hub |
| RC-003 | **Major** | 19 | Appointment create did not enqueue notification outbox |
| RC-004 | **Major** | 10, 1 | Paid path ignored `deductInventory` / UI claimed deduction off |
| RC-005 | **Major** | 18 | Timezone not editable in Settings |
| RC-006 | **Major** | 12–13 | Dashboard lists / KPI wiring stale or empty |
| RC-007 | **Major** | 14–15 | Global search omitted appointments; hidden on mobile |
| RC-008 | **Major** | — | **`/loyalty` returned 404** — route missing from `HAIR_PUBLIC_PREFIXES` (middleware blocked nav URL) |
| RC-009 | **Major** | 1, 10 | RC consumable kit in DB could point at wrong product or `deductInventory: false` after re-seed |
| RC-010 | **Minor** | — | Stale “billing / commissions coming soon” copy |
| RC-011 | **Minor** | — | `CustomerProfile` used raw `<input type="file">` (repo upload policy) |
| RC-012 | **Minor** | — | Integration `nextSlot()` collided on shared DB across runs |
| RC-013 | **Minor** | — | Playwright login flake on cold dev server (fixed via storage-state setup + typed login) |
| RC-014 | **Minor** | — | Drizzle vs SQL drift on `fyh_settings`, `fyh_staff`, `fyh_products` (migrations `0010`, `0011`) |

---

## Bugs fixed (RC)

| ID | Fix |
|----|-----|
| RC-001 | `src/hair/db/seed.ts` — RC Gold membership + RC Cut Pack package tied to bookable service |
| RC-002 | `CommissionRows.tsx`, `loyalty/page.tsx`, `markCommissionsPaidAction` |
| RC-003 | `createAppointment` → `enqueueNotification`; outbox honesty in `loyaltyOps.processOutboxBatch` |
| RC-004 | `invoices.ts` honors `kit.deductInventory`; `ServicesUi` copy aligned |
| RC-005 | Settings timezone field + `updateSalonSettings` |
| RC-006 | `dashboard.ts` — timezone day bounds, schedule/upcoming/recent bills |
| RC-007 | `search.ts`, `HairGlobalSearch.tsx` |
| RC-008 | `src/hair/lib/host.ts` — add `/loyalty` to `HAIR_PUBLIC_PREFIXES` |
| RC-009 | `seed.ts` — always align consumable row to RC-SHAMPOO + `deductInventory: true` |
| RC-010 | Removed stale copy from `SalonDashboard`, `StaffUi` |
| RC-011 | `CustomerProfile.tsx` → `ImageFileInputInline` |
| RC-012 | `rcFixtures.ts` — per-run day offset for unique slots |
| RC-013 | `hair.auth.setup.ts`, `playwright.config.ts` hair projects, `helpers.ts` |
| RC-014 | `00010_settings_fields.sql`, `0011_schema_align.sql` |

Payment idempotency, checkout status gates, concurrent payment race, and GST/loyalty math are covered in integration tests and `tests/hair/unit/appointmentEngine.test.ts`.

---

## Remaining minor issues (acceptable for v1)

1. **Notifications** — Outbox rows are created; WhatsApp/SMS/email **delivery adapters are not connected**. UI does not claim messages were delivered.
2. **Gift cards** — Payment method throws “not available yet”; customer profile does not show gift-card counts.
3. **Forgot password** — Login link is placeholder (`preventDefault`).
4. **RBAC** — Single admin salon scope; no stylist/receptionist roles in RC.
5. **Local dev** — Main app `DATABASE_URL` in `.env.local` may be empty (Vercel integration); Hair uses `HAIR_DATABASE_*` — keep URLs isolated per `src/hair/lib/db/env.ts`.

---

## Performance observations

- First compile of Hair routes on `next dev` can take **10–30s** per page; subsequent navigations are **&lt;2s**.
- Full RC integration suite ~**5–6 minutes** (serial DB work against Neon).
- Playwright hair suite ~**3 minutes** with warmed dev server and shared auth storage state.
- Dashboard/reports queries are acceptable for single-salon data; no load test on large histories.

---

## Security observations

- Hair session cookie scoped to Hair host; unauthenticated access redirects to `/login` (scenario 17).
- Middleware sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` on Hair rewrites.
- **DB isolation:** Hair client must not equal PG `DATABASE_URL` or Capital DB (`assertHairDbIsolation`).
- Print HTML uses `escapeHtml` (unit-tested) for XSS hardening.
- Admin credentials via env only; no secrets in repo.

---

## Production deployment checklist

1. **Neon (Hair only):** Apply migrations `0009` (loyalty/ops), `0010` (settings fields), `0011` (staff/products align), plus prior Hair migrations.
2. **Seed:** `npm run hair:db:seed` — admin user, RC-style business hours, timezone `Asia/Kolkata`, services/products/membership/package fixtures (or production equivalents).
3. **Vercel env:** `HAIR_DATABASE_URL` or integration `HAIR_DATABASE_*`, `HAIR_ADMIN_EMAIL`, `HAIR_ADMIN_PASSWORD`, session secret(s) as used by Hair auth.
4. **DNS:** `fyhair.awesomepg.in` (and optional `foryourhair` alias) → deployment; verify `isHairHost` in middleware.
5. **Smoke (production):** Login → dashboard → create one customer → book appointment → checkout → pay → confirm invoice paid, stock movement (if consumables enabled), commission row.
6. **CI (recommended):** `node --import tsx --test tests/hair/**` and Playwright `hair-setup` + `hair` projects on preview with Hair env.

---

## Scenario coverage map

| # | Workflow | Automated coverage |
|---|----------|-------------------|
| 1 | Walk-in → pay UPI + stock + commission | Integration + calendar UI |
| 2 | Membership discount | Integration |
| 3 | Package redeem | Integration + loyalty UI |
| 4 | Wallet mixed pay | Integration |
| 5 | Cash + UPI split | Integration |
| 6–8 | Reschedule / cancel / no-show | Integration |
| 9 | Bridal profile | Integration |
| 10 | Inventory on paid | Integration |
| 11 | Commission mark paid | Integration + loyalty UI |
| 12–13 | Dashboard / reports | Integration + ops UI |
| 14–15 | Search desktop + mobile | Ops UI |
| 16 | Print window | Edge E2E |
| 17 | Auth redirect | Visit-loop E2E |
| 18 | Timezone settings | Ops UI |
| 19 | Notification outbox | Integration |
| 20 | Validation / idempotency | Integration + edge E2E |

---

*Generated as part of Hair ERP RC verification. Re-run the test commands above after any change to billing, appointments, or loyalty money paths.*
