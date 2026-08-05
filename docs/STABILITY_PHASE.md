# Stability Phase

Effective **2026-08-01**. Awesome PG prioritizes correctness and regression safety over velocity.

## Rules

### 1. Identify dependents before editing

Before modifying any module:

- Grep for imports and call sites (`rg "from '@/src/services/foo'"`, `rg "foo\\("`).
- List admin UI, resident UI, scripts, and tests that depend on it.
- Note cross-product impact (PG vs Hair vs Capital).

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

This runs, in order:

1. **Build** — `npm run build`
2. **Unit/integration tests** — scoped to affected products (pg / hair / capital)
3. **Billing settlement suite** — when billing, resident money, checkout, or settlement paths change

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

### 9. Billing Centre releases — Shantinagar Phase 1 certification (mandatory)

Before any **Billing Centre** deploy (Phase 2+), every active Shantinagar resident must pass automated portal certification:

```bash
npx vercel env run --environment production npm run cert:shantinagar-phase1
```

The cert is **read-only**, reconciles 21 fields per resident (rent SSOT, invoices, electricity allocation, deposit, Total Due portal vs backend), and **exits non-zero if any resident differs by even ₹1**.

Phase 1 resident portal work is **not complete** until this cert passes with `CERTIFIED` for all active residents.

## Agent / developer checklist

- [ ] Dependents identified
- [ ] Baseline tests green
- [ ] Code change minimal; SSOT reused
- [ ] Regression test added (bug fixes)
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
