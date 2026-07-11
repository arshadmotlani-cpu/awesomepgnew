# Decisions — Automotive Capital

Architecture Decision Records (ADRs). Append-only.

---

## ADR-001: Host-Based Routing in Same Next.js App

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Automotive Capital shares the Awesome PG monorepo and Vercel deployment. It needs complete product independence while minimizing infrastructure duplication.

### Decision
Use host-based routing in the existing Next.js app:
- `invest.awesomepg.in` → Capital routes (`app/(capital)/`)
- `www.awesomepg.in` → PG routes (unchanged)

Middleware performs host detection as the first decision. PG middleware logic remains untouched below the host guard.

### Alternatives Considered
1. **Separate repository** — Cleanest isolation but duplicates CI/CD, env management, and deployment overhead.
2. **Separate Vercel project in monorepo** — Good isolation but requires monorepo conversion (not currently structured).
3. **Path prefix (`/invest/`)** — Simpler but URLs would be `awesomepg.in/invest/` which breaks product independence requirement.

### Consequences
- Single build, single deploy
- Must enforce strict module boundaries via ESLint
- Middleware complexity increases slightly
- Risk of PG regression if host guard has bugs (mitigated by tests)

---

## ADR-002: Separate Neon Database

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Financial data for Capital must be isolated from PG operational data. Future scale target is ₹10 crore+.

### Decision
Dedicated Neon PostgreSQL database connected via `INVEST_DATABASE_URL`. Independent Drizzle schema, migrations, and client in `src/capital/db/`.

### Alternatives Considered
1. **Shared database with `ac_` table prefix** — Simpler ops but couples backup/restore, migration timing, and creates risk of cross-query bugs.
2. **SQLite for dev** — Incompatible with Vercel serverless production.

### Consequences
- Two databases to manage in Vercel env
- Build script runs both migration sets
- Complete financial isolation
- Independent Neon branching for preview deploys

---

## ADR-003: Asset-First Domain Model

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Cars are the first investment type but the system must support property, gold, machinery, business investments, and loans without schema redesign.

### Decision
Polymorphic `ac_assets` table with `asset_class` enum. Type-specific detail tables (starting with `ac_automotive_details`). All financial tables reference `asset_id`.

### Alternatives Considered
1. **Car-centric schema** — Simpler for Phase 1 but requires painful migration when adding asset types.
2. **EAV (entity-attribute-value)** — Flexible but terrible query performance and type safety.

### Consequences
- Slightly more complex Phase 1 schema
- New asset classes add a detail table + enum value, not financial table changes
- Services use strategy pattern per asset class

---

## ADR-004: Append-Only Ledger with Reversals

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Financial software managing real money requires audit-grade history. The user explicitly stated "the ledger is sacred."

### Decision
`ac_ledger_entries` is append-only. No UPDATE or DELETE on financial amounts. Corrections create reversal entries with `reversal_of_entry_id`. Source rows marked `is_reversed = true`.

### Alternatives Considered
1. **Soft delete with audit** — Simpler but ledger can be silently corrupted.
2. **Event sourcing** — Most rigorous but over-engineered for single-user Phase 1.

### Consequences
- Ledger grows monotonically (plan partitioning at 1M+ rows)
- UI must clearly show reversed entries
- Integrity check script can verify balance

---

## ADR-005: Money as Paise (bigint)

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Indian Rupee amounts with decimal precision. Floating-point arithmetic is unacceptable for financial software.

### Decision
Store all amounts as `bigint` paise (1/100 rupee). Display formatting converts to rupees with Indian numbering (lakhs, crores).

### Alternatives Considered
1. **Decimal/numeric SQL type** — Correct but Drizzle bigint is simpler and matches PG codebase patterns.
2. **Store as rupees with 2 decimal places in integer** — Same as paise but less conventional naming.

### Consequences
- All UI inputs accept rupees, convert to paise on submit
- All display components format paise to rupees
- Consistent with existing Awesome PG `amount_paise` pattern

---

## ADR-006: Custom DB Sessions (Not NextAuth)

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Single admin user. Need session revocation, audit, and DB-backed validation. Awesome PG already has a proven `auth_sessions` pattern.

### Decision
Adapt PG's DB-backed session pattern for Capital:
- `ac_auth_sessions` table with hashed tokens
- `ac_session` httpOnly cookie
- scrypt password hashing
- No NextAuth dependency

### Alternatives Considered
1. **NextAuth/Auth.js** — Heavier dependency for single-user credentials-only auth.
2. **JWT-only sessions** — Cannot revoke without blocklist; no session audit.

### Consequences
- Proven pattern from PG codebase (copy crypto, adapt session)
- Full control over session lifecycle
- One less dependency

---

## ADR-007: Vercel Blob for Document Storage

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Need secure document upload for invoices, bills, RC, photos. Awesome PG already uses Vercel Blob with a proven wrapper.

### Decision
Use Vercel Blob with adapted `src/capital/lib/storage/blob.ts`. Private blobs served via authenticated proxy route. Path prefix: `capital/documents/`.

### Alternatives Considered
1. **UploadThing** — User's original spec mentioned it, but PG already has Blob infrastructure and adding another upload provider increases complexity.
2. **S3 direct** — More configuration, no benefit over Blob on Vercel.

### Consequences
- Reuse blob wrapper pattern from PG
- Optional separate `INVEST_BLOB_READ_WRITE_TOKEN` for isolation
- No UploadThing dependency

---

## ADR-008: shadcn/ui Component Library

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Premium UI requires polished, accessible components. PG uses hand-rolled Tailwind with no component library. Capital needs a fresh design system.

### Decision
Install shadcn/ui under `src/capital/components/ui/` with Capital-specific tokens. Do not share UI components with PG.

### Alternatives Considered
1. **Reuse PG admin components** — Violates branding independence requirement.
2. **Headless UI only** — More work for same result.
3. **Material UI** — Wrong aesthetic for premium dark glassmorphism.

### Consequences
- New dependencies (Radix, CVA, etc.)
- Components owned in repo (not npm package)
- Full styling control with Capital tokens

---

## ADR-009: Code Location `src/capital/`

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Need clear namespace for all Capital code within the PG monorepo.

### Decision
All Capital domain code under `src/capital/`. Routes under `app/(capital)/`. Drizzle config at `capital/drizzle.config.ts`. Docs at `docs/automotive-capital/`.

### Alternatives Considered
1. **`src/invest/`** — Less descriptive of the product name.
2. **Top-level `apps/capital/`** — Requires monorepo restructuring.

### Consequences
- Clear grep boundary: `src/capital/` vs `src/services/`
- ESLint rules can enforce import restrictions
- Easy to extract to separate repo later if needed

---

## ADR-010: No Demo Data by Default

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Production financial software should not ship with fake data. User requested no demo data unless optional.

### Decision
Seed script creates only: settings singleton, expense categories, admin user. No assets, expenses, or payments unless `CAPITAL_SEED_DEMO=true` env var is set.

### Alternatives Considered
1. **Rich demo dataset** — Useful for development but risky if accidentally deployed to production.

### Consequences
- Empty states are critical UX (designed in UI_SYSTEM.md)
- Developers can opt into demo data locally
- Production starts clean

---

## Template for Future ADRs

```
## ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded

### Context
Why this decision is needed.

### Decision
What we decided.

### Alternatives Considered
What else we evaluated.

### Consequences
Positive and negative outcomes.
```
