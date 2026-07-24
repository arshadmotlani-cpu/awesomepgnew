# UI billing & settlement audit

Checklist for financial parity and explainability. SSOT loader: `loadVacatingBillingPresentation` / `loadVacatingBillingPresentationBundle`.

| Surface | Route / component | SSOT loader | Explanations | Audience |
|---------|-------------------|-------------|--------------|----------|
| Operations approve | `MoveOutOpsActionPipeline` → approve modal | `buildVacatingApprovalPreviewAsync` → bundle | Link to statement page | **Admin review** — `AdminReviewSettlementScan` |
| Vacating pipeline | `/admin/vacating` | Same as operations previews | Gated `<details>` only | **Admin review** summary; accounting via workspace |
| Financial workspace | `/admin/bookings/[id]/financial` | `loadVacatingBillingPresentationBundle` | Statement `Why these numbers` | **Accountant** — statement expanded |
| Resident home / requests | `ResidentMoveOutSettlementStory` | Bundle | Optional collapsed statement | **Resident** |
| Vacating statement / PDF | `/admin/vacating/[id]/settlement-statement` | Loader | Full report | **Accountant** |
| Checkout settlement | `/admin/checkout-settlements/[id]` | Locked waterfall + presentation align | Waterfall audit panel | **Accountant** |
| Refund receipt | `/admin/refunds/receipt/[settlementId]` | Checkout detail totals | Link to settlement statement | Totals match waterfall |
| Resident pay flows | Rent/electricity UPI | `bookingMoneyBalances` / invoices | N/A | Out of move-out scope |

## Implemented improvements (this project)

- Single **presentation bundle** type with mandatory explainability report.
- **Locked waterfall** aligns BCM tail fields via `alignCoverageToLockedWaterfall`.
- Three-audience layer: `settlementPresentationAudience.ts` + `AdminReviewSettlementScan`.
- Engine **frozen** — [SETTLEMENT_ENGINE_FREEZE.md](../SETTLEMENT_ENGINE_FREEZE.md) · [SETTLEMENT_UX_GUIDE.md](./SETTLEMENT_UX_GUIDE.md).

## Remaining UX risks

- Checkout command center waterfall panel does not yet embed full `Why these numbers` collapsible (amounts match locked V2).
- Legacy label **deduction** on vacating row vs **notice from deposit** in statement — statement is SSOT (INV-X2).
