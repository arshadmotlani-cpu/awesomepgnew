# Current state — monorepo

**Stabilization roadmap:** Final Stabilization Master Plan (waves W0–W4) — P0/P1 backlog, CI, and per-product gates. Plan lives in Cursor plans (`repo_final_stabilization`); do not treat this file as the full backlog.

## Product gates (summary)

| Product | Automated | Operational |
|---------|-----------|-------------|
| **Hair** | `tests/hair/**` (`npm run test:hair`), Playwright `npm run test:e2e:hair`, nightly workflow when secrets set | [`UAT_AUDIT.md`](foryourhair/UAT_AUDIT.md), [`RELEASE_READINESS.md`](foryourhair/RELEASE_READINESS.md), [`QUICK_SALE.md`](foryourhair/QUICK_SALE.md) |
| **PG** | `tests/unit/**`, smoke E2E in CI | [`PRODUCTION_READINESS_AUDIT.md`](PRODUCTION_READINESS_AUDIT.md), [`PG_P0_VERIFICATION_RUNBOOK.md`](PRODUCTION_STABILIZATION/PG_P0_VERIFICATION_RUNBOOK.md), [`PRODUCTION_READINESS_SIGNOFF.md`](PRODUCTION_STABILIZATION/PRODUCTION_READINESS_SIGNOFF.md) |
| **Capital** | `tests/capital/unit/**` in main test runner | [`PRODUCTION_SIGNOFF.md`](automotive-capital/PRODUCTION_SIGNOFF.md) |

## Awesome PG production architecture (locked)

- **Occupancy SSOT:** `fetchBedOccupancyRows` / `resolveBedOccupancy` — public listing, bed map, and transfer selection share one projection. A target bed with an **active 72-hour room-change hold** is never Available.
- **Room change:** resident-initiated, **no admin approval**. Target hold is exactly 72 hours. Payment settlement auto-completes the transfer. Expiry/cancel/complete/fail are asserted. Quote is frozen. Room-change payables are not wallet-deducted.
- **Electricity:** historical **room occupancy coverage** (not current bed ID). Same-room bed changes coalesce. Cross-room splits at the reservation boundary. Holds create zero electricity liability. Generation is idempotent by room+month and requires a validated calculation breakdown before financial commit. **Due date exists; new electricity late fee is always ₹0.** Historical invoices may still store a locked late-fee residual from the old policy — do not rewrite them.
- **Migrations:** drizzle `_journal.json` on `main` ends at `0149_room_change_engine`. SQL files `0132`–`0138` exist in the repo but are **not registered** in that journal. Production may already contain Room OS tables from an earlier out-of-band apply; PG occupancy/electricity/room-change **do not depend** on applying those files again. Writers skip missing `room_os_outbox`. Do not re-run 0132–0138 for this stability cleanup.
- **Read-only certs:** `npm run cert:electricity-room-coverage-readonly`, `npm run cert:room-change-occupancy-readonly`.

## Platform

- Env contract: [`ENV_CONTRACT.md`](ENV_CONTRACT.md) · `npm run env:check [-- --product=hair|capital]`
- CI: `.github/workflows/ci.yml` (unit + build + PG smoke E2E)
- Hair E2E: `.github/workflows/hair-e2e.yml` (optional secrets)

<!-- DOC_SYNC_STATE_START -->
## Automated doc sync

> **Last sync:** 2026-09-04 14:27:16 UTC  
> **Areas touched:** [[Billing]], [[Vacating]]  
> **Docs flagged:** ARCHITECTURE.md, CHANGELOG.md, DECISIONS.md, PROJECT/features.md, SYSTEM/CURRENT_STATE.md, SYSTEM/WORKFLOWS.md  
> **Staged code files:** 10  
> **Action:** Review [[CHANGELOG#Pending pre-commit sync · 2026-09-04]] (Pending section) before push.
<!-- DOC_SYNC_STATE_END -->
