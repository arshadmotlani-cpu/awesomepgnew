# Risks — Automotive Capital

Risk register with likelihood, impact, and mitigations. Review after each phase.

**Scale:** Likelihood and Impact rated Low / Medium / High

---

## R01: PG Regression from Shared Middleware

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | High |
| **Category** | Technical |

**Description:** Extending `middleware.ts` for host routing could break existing PG auth flows on `www.awesomepg.in`.

**Mitigations:**
- Host guard as first middleware decision — PG code path unchanged
- Capital middleware in separate function/file
- Unit tests for both hosts
- PG E2E smoke tests run in CI on every change
- Feature flag: Capital middleware only active when host matches

**Owner:** Implementation team  
**Status:** Open

---

## R02: Cross-Product Import Leakage

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | High |
| **Category** | Architecture |

**Description:** Capital code accidentally imports PG services, schema, or components, creating coupling and potential data leaks.

**Mitigations:**
- ESLint `no-restricted-imports` rule: `src/capital/**` cannot import `src/services/**`, `src/db/schema/**`, `src/components/admin/**`
- Code review checklist
- Separate DB client that only knows `INVEST_DATABASE_URL`

**Owner:** Implementation team  
**Status:** Open

---

## R03: Financial Calculation Errors

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | Critical |
| **Category** | Business |

**Description:** Incorrect ROI, outstanding, settlement %, or profit sharing calculations lead to wrong financial decisions.

**Mitigations:**
- Ledger as SSOT — all mutations through `LedgerService`
- Cached fields rebuildable from source data
- Comprehensive unit tests for money math
- End-to-end workflow test with known numbers (WORKFLOWS.md §18)
- Integrity check script

**Owner:** Implementation team  
**Status:** Open

---

## R04: Ledger Integrity Violation

| | |
|---|---|
| **Likelihood** | Low |
| **Impact** | Critical |
| **Category** | Data |

**Description:** Bug allows ledger entry deletion, amount modification, or orphaned entries.

**Mitigations:**
- Application layer: no DELETE/UPDATE on ledger
- Optional DB trigger preventing UPDATE/DELETE on `ac_ledger_entries`
- Code review: all financial paths must call `LedgerService`
- Integrity check in CI

**Owner:** Implementation team  
**Status:** Open

---

## R05: Session Security Compromise

| | |
|---|---|
| **Likelihood** | Low |
| **Impact** | Critical |
| **Category** | Security |

**Description:** Admin session hijacked or brute-forced, giving access to financial data.

**Mitigations:**
- httpOnly + secure + sameSite cookies
- Rate limiting on login (5/15min)
- DB-backed sessions (revocable)
- Activity log on all auth events
- Strong password required in seed env var

**Owner:** Implementation team  
**Status:** Open

---

## R06: Document Unauthorized Access

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | High |
| **Category** | Security |

**Description:** Private blob URLs exposed in HTML or accessible without authentication.

**Mitigations:**
- Private blob storage only
- Authenticated proxy route for all document access
- Lint rule: no private blob URLs in `<img>` tags (adapt from PG)
- MIME type validation on upload

**Owner:** Implementation team  
**Status:** Open

---

## R07: Build Complexity from Dual Database

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Category** | DevOps |

**Description:** Vercel build fails if Capital migrations fail, blocking PG deploys too.

**Mitigations:**
- Capital migrations run only when `INVEST_DATABASE_URL` is set
- Skip gracefully in PG-only environments
- Separate migration scripts and health checks
- Preview deploys can use Neon branch per PR

**Owner:** DevOps  
**Status:** Open

---

## R08: Performance at Scale (₹10 Cr+)

| | |
|---|---|
| **Likelihood** | Low (Phase 1) / Medium (future) |
| **Impact** | Medium |
| **Category** | Performance |

**Description:** Dashboard aggregate queries slow with thousands of assets and millions of ledger entries.

**Mitigations:**
- Pagination everywhere (50/page)
- Cached aggregates on `ac_assets`
- `unstable_cache` for dashboard (60s TTL)
- Indexes per DATABASE.md
- Plan ledger partitioning at 1M+ rows
- Materialized view for portfolio summary (future)

**Owner:** Implementation team  
**Status:** Open

---

## R09: shadcn Setup Overhead

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | Low |
| **Category** | Technical |

**Description:** Installing and customizing shadcn/ui delays Phase 1 delivery.

**Mitigations:**
- Install only needed components (not full library)
- Capital-specific tokens applied during init
- Can fall back to minimal custom components if blocked

**Owner:** Implementation team  
**Status:** Open

---

## R10: PWA Conflicts with PG Service Worker

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Category** | Technical |

**Description:** PG `public/sw.js` conflicts with Capital service worker on different hosts.

**Mitigations:**
- Capital SW at `public/capital/sw.js` with scope limited to invest host
- Capital layout links Capital manifest only
- PG layout unchanged
- Test PWA install on both hosts independently

**Owner:** Implementation team  
**Status:** Open

---

## R11: Scope Creep

| | |
|---|---|
| **Likelihood** | High |
| **Impact** | Medium |
| **Category** | Product |

**Description:** Feature requests (multi-user, bank feeds, GST, dealer portal) expand scope beyond Phase 1.

**Mitigations:**
- Strict FEATURES.md with "Out of Scope" section
- ROADMAP.md defers enhancements to post-launch phases
- Asset-first schema supports future features without Phase 1 build
- TASKS.md as scope boundary

**Owner:** Product  
**Status:** Open

---

## R12: Neon Database Not Provisioned

| | |
|---|---|
| **Likelihood** | Medium |
| **Impact** | High (blocks Phase 1) |
| **Category** | Infrastructure |

**Description:** `INVEST_DATABASE_URL` not created before implementation begins.

**Mitigations:**
- Document Neon setup steps in ARCHITECTURE.md
- Phase 1 Day 1 task: create Neon project
- `capital:db:migrate` fails with clear error if URL missing
- Can use local Postgres for initial dev

**Owner:** DevOps  
**Status:** Open

---

## Risk Matrix

```
Impact →
         Low        Medium      High        Critical
L  H  │           │ R11       │ R01,R02   │ R03,R04
i  M  │ R09       │ R07,R10   │ R06,R08   │ R05
k  L  │           │ R12       │           │
e
↓
```

---

## Review Schedule

| When | Action |
|------|--------|
| After Phase 1 | Review R01, R02, R07, R12 |
| After Phase 2 | Review R03, R04 |
| After Phase 3 | Review R06, R08 |
| After Phase 4 | Review R09, R10 |
| Before production | Review all risks, close mitigated |

---

## Escalation

| Severity | Response |
|----------|----------|
| Critical (R03, R04, R05) | Stop feature work, fix immediately |
| High (R01, R02, R06) | Fix before next phase gate |
| Medium | Track in TASKS.md, fix within phase |
| Low | Backlog |
