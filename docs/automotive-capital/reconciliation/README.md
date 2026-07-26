# Financial reconciliation outputs

Dated folders are produced by:

```bash
npx tsx scripts/financial-truth-report.ts
```

SSOT: Capital Reset Rebuild investment math.

- **Current Investment** = Seller Price + Σ Costs − Σ Refunds
- **Active Capital** = Σ current investment on open inventory (not Me stakes)
- **Budget Remaining** = Expected − Current Investment
- **Gross / My / Partner** = Sale − Current; Self or 50-50 split
- **Vehicles Sold** = status in sold/settled

Exit code `0` means Dashboard = Vehicle ledger totals = Reports = Database with zero diffs.

See `LATEST_DIFF.md` for the most recent mismatch summary.
