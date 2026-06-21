# Memory — Mistakes

> **Append-only** failures, bugs, and wrong turns — so they are not repeated.

**Rule:** Never delete. Link resolved bugs in [[BUGS]] and formal fixes in [[DECISIONS]].

---

## 2026-06-21

- **Passed `Date` objects to client pipeline UI** — crashed `/admin/vacating` with "Overview could not load" → fixed `toClientMoveOutPipelineItem()` ([[BUGS#VAC-CRASH-01]])
- **Bed map vs residents list used different occupancy queries** — "Assign bed" while map showed assigned → fixed `occupancySsot.ts` alignment ([[BUGS#BED-SSOT-01]])
- **Vacating notice didn't generate checkout-month rent** — resident owed pro-rated days but invoice missing → `vacatingCheckoutBilling.ts` ([[BUGS#VAC-RENT-01]])
- **Ops queue vacating rows had empty `customerId`** — lifecycle timeline and deep links broken → fixed in `d4c01c6`
- **Resident vacating timeline advanced to meter/refund before vacate date** — premature meter upload → `vacatingJourney.ts` stage cap
- **Scattered admin CTAs for same vacating/refund action** — operator confusion; target [[Operations]] hub only ([[BUGS#OPS-UX-01]])

---

## Patterns to avoid

| Mistake | Prevention |
|---------|------------|
| Duplicate financial math in UI | Always use `residentFinancialEngine.ts` |
| Mutating `pricing_snapshot` | Read frozen snapshot for historical billing |
| Shortening stay before same-day checkout complete | Follow `vacatingCheckout.test.ts` rules |
| Unstructured notes in random files | Classify into [[]] first |

---

## How to append

```markdown
## YYYY-MM-DD
- **What went wrong:** … → **Fix / lesson:** … (link [[BUGS#…]] if tracked)
```

---

## Related

[[insights]] · [[BUGS]] · [[DECISIONS]] · [[decisions]]
