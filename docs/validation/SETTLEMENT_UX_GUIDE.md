# Settlement UX guide (post-freeze)

Engine math is frozen. All changes here are **presentation only**. Same billing engine; only the audience layer changes.

See [SETTLEMENT_ENGINE_FREEZE.md](../SETTLEMENT_ENGINE_FREEZE.md) · implementation: `src/lib/vacating/settlementPresentationAudience.ts`.

## Audiences (one screen, one audience)

| Audience | Goal | Time budget | Default UI |
|----------|------|-------------|------------|
| **Resident** | How much will be refunded | Under 15 seconds | Refund + leaving date (+ pending checklist if refund not final) |
| **Admin review** | Approve or reject move-out | Under 10 seconds | Scan bar: refund + leaving + notice status; link to full statement |
| **Financial workspace** | Accounting, investigation, disputes | No limit | Full statement, explainability, audit trail, PDF |

## Screen map

| Screen | Component | Audience |
|--------|-----------|----------|
| Resident move-out | `ResidentMoveOutSettlementStory` | **Resident** |
| Resident optional detail | `SettlementStatementDocument` (`audience=resident`) | **Resident** (collapsed) |
| Operations approve modal | `AdminReviewSettlementScan` | **Admin review** |
| Date change approve (workspace) | `AdminReviewSettlementScan` | **Admin review** |
| Move-out pipeline card | `FinancialSummary` + gated `<details>` for notice panel | **Admin review** (summary only) |
| Financial workspace move-out | `SettlementStatementDocument` (`audience=accountant`, expanded) | **Accountant** |
| Vacating statement page / PDF | `SettlementStatementDocument` (`adminPage`) | **Accountant** |
| Checkout settlement wizard | `CheckoutSettlementWizard` / audit breakdown | **Accountant** |

## Mapping surfaces → audience

| `FinancialDocumentSurface` | `SettlementPresentationAudience` |
|------------------------------|----------------------------------|
| `resident` | `resident` |
| `adminModal` | `adminReview` |
| `adminPage` | `accountant` |

## Default UI must not show (resident + admin review)

Unless user expands accountant path (statement page / workspace):

- Rent consumed / unused prepaid rent / billing coverage language
- Waterfall, BCM, BR-* rule IDs, formulas, engine trace
- Full rent summary, notice day arithmetic tables
- “Audit / engine trace” or “Accountant audit trail”

Plain-language exceptions (resident optional collapsible only): held from deposit for notice, electricity/damages pending finalization.

## Accountant tier

- Full statement layout
- Sections: rent summary, billing/notice/deposit collapsibles
- **Why these numbers** (formula, rule, source)
- **Accountant audit trail**

## Copy principles

- Prefer **refund** and **leaving date** over “deduction”, “waterfall”, “BCM”
- Use “Notice from deposit” / “Held from deposit for notice” in plain tiers
- Pending electricity/damage: “Finalized after meter / inspection”

## Regression

UX edits must not change `estimatedRefundPaise` or waterfall fields — only what is shown and in what order. Run `npm run test:billing-settlement` and `tests/unit/settlementPresentationAudience.test.ts`.
