# UI billing & settlement audit

Checklist for financial parity and explainability. SSOT loader: `loadVacatingBillingPresentation` / `loadVacatingBillingPresentationBundle`.

| Surface | Route / component | SSOT loader | Explanations | Notes |
|---------|-------------------|-------------|--------------|-------|
| Operations approve | `MoveOutOpsActionPipeline` → approve modal | `buildVacatingApprovalPreviewAsync` → bundle | Yes — `SettlementStatementDocument` | Refund disabled until preview loads |
| Vacating pipeline | `/admin/vacating` | Same as operations previews | Via approval preview | No direct approve without statement |
| Financial workspace | `/admin/bookings/[id]/financial` | `loadVacatingBillingPresentationBundle` | Statement `Why these numbers` | Refund hero uses waterfall when available |
| Resident home / requests | `ResidentAreaSection` | Bundle | Statement document | Pending/approved only |
| Checkout settlement | `/admin/checkout-settlements/[id]` | Locked waterfall + presentation align | Add via checkout detail page (waterfall panel) | Locked amounts authoritative |
| Refund receipt | `/admin/refunds/receipt/[settlementId]` | Checkout detail totals | Link to settlement statement | Totals must match `waterfall.refund.totalPaise` |
| Resident pay flows | Rent/electricity UPI | `bookingMoneyBalances` / invoices | N/A (not move-out settlement) | Out of settlement waterfall scope |

## Implemented improvements (this project)

- Single **presentation bundle** type with mandatory explainability report.
- **Locked waterfall** aligns BCM tail fields via `alignCoverageToLockedWaterfall` so historical checkout rows validate without live-invoice drift.
- Financial workspace refund chip prefers **waterfall refund** over `deposit − deduction`.

## Remaining UX risks

- Checkout command center waterfall panel does not yet embed full `Why these numbers` collapsible (amounts match locked V2; add explanations in follow-up if needed).
- Legacy label **deduction** on vacating row vs **notice from deposit** in statement — statement is SSOT; row field is submit snapshot only (INV-X2).
