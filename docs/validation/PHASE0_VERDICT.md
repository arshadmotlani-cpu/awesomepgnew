# Phase 0 — Billing engine validation verdict

**Date:** 2026-07-24  
**Scope:** Read-only production audit; no billing engine code changes.

**Artifacts:**

| Document | Role |
|----------|------|
| [BILLING_SETTLEMENT_BUSINESS_RULES.md](../BILLING_SETTLEMENT_BUSINESS_RULES.md) | BR-* business rule book + code SSOT |
| [BILLING_ENGINE_INVARIANTS.md](../BILLING_ENGINE_INVARIANTS.md) | INV-* registry + failure signatures |
| [ACTIVE_MOVEOUT_PHASE0_MATRIX.md](./ACTIVE_MOVEOUT_PHASE0_MATRIX.md) | Per-resident matrix (generated) |

---

## Consistency verdict

**All automatable invariants pass** for every active non-terminal move-out in production at audit time.

| Metric | Value |
|--------|-------|
| Active rows scanned | 8 |
| Full automated pass | 8 |
| Violations by signature | **None** |

### Workflow coverage (production snapshot)

| Workflow stage | Count | Notes |
|----------------|-------|-------|
| `pending_request` | 3 | Estimate path + `treatAsApprovedForTail: true` |
| `waiting_vacating_date` | 5 | Same estimate path |
| `settlement_review` | 0 | No rows — INV-X1 not exercised |
| `refund_ready` | 0 | No rows — locked checkout path not exercised |
| Pipeline `room_inspection` | 0 | N/A |

Bookings in matrix: APG-2026-0033, 0032, 0036, 0076, 0045, 0048, 0082, 0083.

### Checks run per row

- `assertCheckoutSettlementWaterfallConsistent` (INV-W1–W3)
- `validateMoveOutSettlementExplanations` (INV-N3, INV-C2, INV-E1–E3, INV-X2 where pending)
- INV-C1 — clamped paid coverage vs `moveInDate`
- INV-C3 — no tail when vacating inside a paid anniversary window

### Not automatable in Phase 0 (no prod rows or N implementation)

| Invariant | Status |
|-----------|--------|
| INV-X1 | No `settlement_review` / `refund_ready` rows |
| INV-C4 | Not implemented |
| INV-E4 | Not implemented |
| INV-N1, INV-N2, INV-P1 | Partial — implied by V2, no dedicated assert |

---

## Commands (regenerate)

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/audit-active-moveout-settlement-explanations.ts
USE_PRODUCTION_DB=1 npx tsx scripts/report-phase0-moveout-validation-matrix.ts
```

---

## Phase 1 engine-change proposal

**Trigger:** Implement Phase 1 only after explicit acceptance of this Phase 0 package.

Because **no failure signatures** appeared in production, Phase 1 is **infrastructure + completeness**, not resident-specific fixes:

1. **`src/lib/billing/billingEngineValidation.ts`** — Single runner for all INV-* checks; delegate explainability; return grouped signatures.
2. **`scripts/validate-active-moveout-billing-engine.ts`** — Replace/extend audit scripts; branch by `deriveMoveOutWorkflowStage`:
   - Pending / waiting / inspection → estimate presentation (current behavior).
   - Settlement / refund → locked checkout waterfall via `checkoutSettlement` detail; assert **INV-X1**.
3. **Implement missing asserts** (no prod failures today — preventive):
   - INV-N1, INV-N2, INV-P1 explicit checks on waterfall output.
   - INV-C4 semantic tail vs paid coverage days.
   - **INV-E4** — contract: displayed ₹0 lines require non-empty `reasonLines` in explanations.
4. **CI** — Optional non-blocking job on matrix script; flip to blocking when settlement/refund stages exist in prod and INV-X1 is green.
5. **Regression** — Add fixtures to `billingCoverageRegression.test.ts` or `billingEngineValidation.test.ts` for each signature **if** prod ever reports a failure — one engine fix per signature, never per booking SQL.

**No Phase 1 work** is required for Govind/Bhuwan or any named resident — none appear with a shared signature in this report.

---

## Acceptance (Phase 0)

- [x] Business rules + invariant registry published and cross-linked to code.
- [x] Production matrix for every active move-out row.
- [x] Verdict: automatable checks pass; violation list empty.
- [x] Phase 1 proposal limited to unified validator + unimplemented invariants (no per-resident patches).
