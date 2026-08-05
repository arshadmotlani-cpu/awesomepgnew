# Current state — monorepo

**Stabilization roadmap:** Final Stabilization Master Plan (waves W0–W4) — P0/P1 backlog, CI, and per-product gates. Plan lives in Cursor plans (`repo_final_stabilization`); do not treat this file as the full backlog.

## Product gates (summary)

| Product | Automated | Operational |
|---------|-----------|-------------|
| **Hair** | `tests/hair/**` (`npm run test:hair`), Playwright `npm run test:e2e:hair`, nightly workflow when secrets set | [`UAT_AUDIT.md`](foryourhair/UAT_AUDIT.md), [`RELEASE_READINESS.md`](foryourhair/RELEASE_READINESS.md), [`QUICK_SALE.md`](foryourhair/QUICK_SALE.md) |
| **PG** | `tests/unit/**`, smoke E2E in CI | [`PRODUCTION_READINESS_AUDIT.md`](PRODUCTION_READINESS_AUDIT.md), [`PG_P0_VERIFICATION_RUNBOOK.md`](PRODUCTION_STABILIZATION/PG_P0_VERIFICATION_RUNBOOK.md), [`PRODUCTION_READINESS_SIGNOFF.md`](PRODUCTION_STABILIZATION/PRODUCTION_READINESS_SIGNOFF.md) |
| **Capital** | `tests/capital/unit/**` in main test runner | [`PRODUCTION_SIGNOFF.md`](automotive-capital/PRODUCTION_SIGNOFF.md) |

## Platform

- Env contract: [`ENV_CONTRACT.md`](ENV_CONTRACT.md) · `npm run env:check [-- --product=hair|capital]`
- CI: `.github/workflows/ci.yml` (unit + build + PG smoke E2E)
- Hair E2E: `.github/workflows/hair-e2e.yml` (optional secrets)

<!-- DOC_SYNC_STATE_START -->
## Automated doc sync

> **Last sync:** 2026-08-05 17:49:42 UTC  
> **Areas touched:** [[ROUTES]]  
> **Docs flagged:** CHANGELOG.md, ROUTES.md, SYSTEM/CURRENT_STATE.md  
> **Staged code files:** 6  
> **Action:** Review [[CHANGELOG#Pending pre-commit sync · 2026-08-05]] (Pending section) before push.
<!-- DOC_SYNC_STATE_END -->
