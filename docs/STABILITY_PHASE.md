# Stability Phase

Effective **2026-08-01**. Awesome PG prioritizes correctness and regression safety over velocity.

## Rules

### 1. Identify dependents before editing

Before modifying any module:

- Grep for imports and call sites (`rg "from '@/src/services/foo'"`, `rg "foo\\("`).
- List admin UI, resident UI, scripts, and tests that depend on it.
- Note cross-product impact (PG vs Hair vs Capital).
- In the reply **before edits**, list blast radius: `This change affects: [files, functions, types, routes].` If unsure, treat it as affected.

### 1b. Shared contracts — all consumers or stop

Changing a function signature, prop shape, API response, database schema, or shared type requires updating **every consumer in the same task**. If that is too large, **stop** and report instead of a partial update.

### 1c. Minimize the diff

Touch only the files/lines needed for the request. No drive-by refactors, renames, reformats, or deleting unexplained code without asking.

### 2. Run related tests before changes

Establish a green baseline:

| Area | Command |
|------|---------|
| Full PG unit + integration | `npm run test:pg` |
| Billing / settlement | `npm run test:billing-settlement` |
| Hair | `npm run test:hair` |
| Capital | `npm run test:capital` |
| Full monorepo | `npm test` |

### 3. After changes — automated verification

```bash
npm run stability:report
```

`npm run build` (and deploy typecheck) set `NODE_OPTIONS=--max-old-space-size=8192`. The default Node heap (~2GB) OOMs during TypeScript on this monorepo; **8GB is the deliberate known-working ceiling** used for local/CI builds — not an arbitrary jump to 16GB.

This runs, in order:

1. **Build** — `npm run build`
2. **Unit/integration tests** — scoped to affected products (pg / hair / capital)
3. **Billing settlement suite** — when billing, resident money, checkout, or settlement paths change

Do not mark work complete on “should work.” If you cannot verify (no coverage, cannot run tests), say so.

### 3b. Ecosystem Baseline v1 (frozen 2026-08-05)

In addition to Stability Phase, every change must leave **Health Score = 100** with no Brain regression. New Engines/Brains must register with Health Brain (audit, score, repairs, events, audit trail, performance). See [ECOSYSTEM_BASELINE_V1.md](./ECOSYSTEM_BASELINE_V1.md).

If Health Score drops below 100, the change is incomplete until fixed.

### 4. Unrelated failures — STOP

If a test fails that is **not** explained by your change:

- Do **not** continue with the feature.
- Do **not** skip or delete the test.
- Bisect, fix the regression, re-run until green.

### 5. Bug fixes require regression tests

Every bug fix adds (or extends) a test that fails on the old behavior and passes on the fix.

If tests exist for the path, run them and keep them green. If the path has **no** tests, add a **minimal** test covering the change.

Place tests next to the SSOT module:

- Billing → `tests/unit/billing*.test.ts`, `billingCoverageRegression.test.ts`
- Resident portal → `tests/unit/resident*.test.ts`, `paymentModeLabels.test.ts`
- Room inventory → `tests/unit/roomIntegrity*.test.ts`

### 6. No duplicated business logic

Single sources of truth (examples):

| Concern | SSOT |
|---------|------|
| Monthly rent | `resolveMonthlyRentPaiseForBooking()` |
| Resident totals | `getResidentFinancialAccount()` |
| Invoice amounts | `projectInvoice()` / `rent_invoices` rows |
| Settlement math | `docs/BILLING_ENGINE_INVARIANTS.md` modules (frozen — see settlement-engine-freeze rule) |
| Room capacity | Active bed count + `syncRoomCapacityFromActiveBeds()` |

If UI and API disagree, fix the duplicate — do not add a third copy.

If duplicated logic, missing types, or global coupling is why things keep breaking, say so. Prefer a small structural fix over another workaround.

### 7. Billing changes — production verification

Before deploying billing-related work:

- Run relevant **read-only** audits against production DB (local env with audit credentials).
- Examples: `npx tsx scripts/audit-room-inventory-readonly.ts`, billing cert / resident audit scripts.
- Record outcomes in the regression report **Possible risks** section.

### 8. Regression report before commit

```bash
npm run stability:report          # staged + unstaged vs HEAD
npm run stability:report -- --ci  # branch diff vs origin/main (for PRs)
```

The report includes:

- **Changed files**
- **Affected modules** (inferred from paths)
- **Tests run**
- **Pass/fail**
- **Possible risks** (heuristic checklist)

Commit and push only when the report exits **0**.

### 8b. Impact Summary (end of every change)

After the work, state:

- What changed
- What else you checked/updated as a result
- What you did **not** change but flagged as a risk
- Manual verification the operator should do

### 9. Billing Centre releases — Shantinagar Phase 1 certification (mandatory)

Before any **Billing Centre** deploy (Phase 2+), every active Shantinagar resident must pass automated portal certification:

```bash
npx vercel env run --environment production npm run cert:shantinagar-phase1
```

The cert is **read-only**, reconciles 21 fields per resident (rent SSOT, invoices, electricity allocation, deposit, Total Due portal vs backend), and **exits non-zero if any resident differs by even ₹1**.

Phase 1 resident portal work is **not complete** until this cert passes with `CERTIFIED` for all active residents.

## Agent / developer checklist

- [ ] Dependents identified and listed in the reply before edits
- [ ] Shared contracts: all consumers updated, or stopped and reported
- [ ] Baseline tests green
- [ ] Code change minimal; SSOT reused
- [ ] Regression test added (bug fixes); minimal test if the path had none
- [ ] Impact Summary written
- [ ] `npm run stability:report` green
- [ ] Production read-only audit (if billing/inventory/money)
- [ ] Shantinagar Phase 1 cert (`npm run cert:shantinagar-phase1`) before Billing Centre releases
- [ ] **Ecosystem Baseline v1:** Health Score remains 100; no Brain regresses (`docs/ECOSYSTEM_BASELINE_V1.md`)
- [ ] Regression report reviewed

## Related docs

- [ECOSYSTEM_BASELINE_V1.md](./ECOSYSTEM_BASELINE_V1.md) — frozen floor: Health Score = 100, Brain registration law
- [SETTLEMENT_ENGINE_FREEZE.md](./SETTLEMENT_ENGINE_FREEZE.md)
- [BILLING_ENGINE_INVARIANTS.md](./BILLING_ENGINE_INVARIANTS.md)
- [SETTLEMENT_REPAIR_POLICY.md](./SETTLEMENT_REPAIR_POLICY.md)
