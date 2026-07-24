# Active move-out — Phase 0 validation matrix

Generated: 2026-07-24T11:35:14.276Z

Read-only audit. See [BILLING_ENGINE_INVARIANTS.md](../BILLING_ENGINE_INVARIANTS.md).

## Summary

- Active non-terminal rows: **8**
- Full pass (automated checks below): **8**
- Rows with any signature: **0**

### Workflow stage counts

- `pending_request`: 3
- `waiting_vacating_date`: 5

## Per resident

| Booking | Workflow | Vacating | Settlement | Pipeline stage | E1–E3 | INV-C1 | INV-C3 | Signatures |
|---------|----------|----------|------------|----------------|-------|--------|--------|------------|
| APG-2026-0033 | waiting_vacating_date | approved | — | notice_verified | PASS | PASS | PASS | — |
| APG-2026-0032 | waiting_vacating_date | approved | — | notice_verified | PASS | PASS | PASS | — |
| APG-2026-0036 | waiting_vacating_date | approved | — | notice_verified | PASS | PASS | PASS | — |
| APG-2026-0076 | waiting_vacating_date | approved | — | notice_verified | PASS | PASS | PASS | — |
| APG-2026-0045 | waiting_vacating_date | approved | — | notice_verified | PASS | PASS | PASS | — |
| APG-2026-0048 | pending_request | pending | — | requested | PASS | PASS | PASS | — |
| APG-2026-0082 | pending_request | pending | — | requested | PASS | PASS | PASS | — |
| APG-2026-0083 | pending_request | pending | — | requested | PASS | PASS | PASS | — |

## Not yet automated (Phase 0 manual N/A)

- **INV-X1** — locked checkout waterfall vs presentation (settlement_review / refund_ready)
- **INV-C4** — tail overlap with paid coverage days
- **INV-E4** — zero amounts require explicit reason text
- **INV-N1/N2/P1** — explicit asserts (partially implied by V2)
