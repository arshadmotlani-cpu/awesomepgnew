# Memory — Bugs

> **Append-only** problem and error log (operational memory).  
> Tracked issues with IDs and fixes: [[BUGS]] (formal bug registry).

**Rule:** Never delete entries. Link resolved items to [[BUGS#Resolved]] and [[mistakes]].

---

## 2026-06-23

- **VAC-B5-01** — Shanti Nagar 203-B5: `/admin/vacating` crash (ISO date + bigint RSC boundary); refund badge vs empty `/admin/requests` (checkout SSOT vs legacy table) → [[BUGS#VAC-B5-01]]

## 2026-06-22

- **VAC-CRASH-02** — Map + Date props crashed move-outs advanced tools → serialized via `toMoveOutAdvancedToolsRow` ([[BUGS#VAC-CRASH-02]])
- **VAC-DATE-01** — Vacating date picker crash on invalid input → `tryDiffDays` + form defaults ([[BUGS#VAC-DATE-01]])
- **EXP-INV-01** — Express walk-in invoice missing → `finalizeExpressWalkInFinancialInvoice` ([[BUGS#EXP-INV-01]])
- **SEARCH-01** — Partial resident search blocked at 3 chars → 2-char / 2-digit phone ([[BUGS#SEARCH-01]])

## Open

- **OPS-UX-01** — Duplicate vacating/deposit/refund CTAs across admin UI → use [[Operations]] only ([[BUGS#OPS-UX-01]])
- **OPS-UX-02** — Legacy route bookmarks still in use → see [[ROUTES#Legacy redirects]]
- **RES-LIST-01** — `listResidentsForAdmin` LIMIT 200 may omit older residents in ops timeline
- **VAC-SAME-01** — Same-day vacating approve + stay shortening edge case → see tests

---

## Resolved (memory log)

## 2026-06-21

- **VAC-CRASH-01** — `/admin/vacating` crash (Date serialization) → `d4c01c6` ([[mistakes]])
- **BED-SSOT-01** — Bed map vs residents list mismatch → `88a16e8`
- **VAC-RENT-01** — Missing checkout-month rent on notice → `369bddb`

---

## How to append

```markdown
## YYYY-MM-DD
- **BUG-ID or summary:** symptom → status (link [[BUGS#…]] if tracked)
```

---

## Related

[[mistakes]] · [[BUGS]] · [[tasks]] · [[active_memory]] · [[insights]]

<!-- INTEL_2026-06-21T19:59:31Z -->
### 2026-06-21T19:59:31Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 4 files changed, 217 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `MEMORY/active_memory.md`
- `INTELLIGENCE.md`


<!-- INTEL_2026-06-21T19:59:45Z -->
### 2026-06-21T19:59:45Z

- **Types:**  · REFACTOR ·  · BUG ·  · DECISION ·  · INSIGHT ·  · TASK ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 11 files changed, 368 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `MEMORY/decisions.md`
- `MEMORY/ideas.md`
- `MEMORY/insights.md`
- `MEMORY/tasks.md`


<!-- INTEL_2026-06-21T20:03:44Z -->
### 2026-06-21T20:03:44Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 6 files changed, 360 insertions(+), 59 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`


<!-- INTEL_2026-06-21T20:59:03Z -->
### 2026-06-21T20:59:03Z

- **Types:**  · REFACTOR ·  · BUG ·  · FEATURE ·  · TASK ·  · DECISION ·  · INSIGHT · 
- **Primary:** BUG
- **Summary:** 8 files changed, 328 insertions(+), 6 deletions(-)
- **Files:**
- `AI_SYSTEM_PROMPT.md`
- `BUGS.md`
- `Billing.md`
- `CHANGELOG.md`
- `Checkout Settlements.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `Vacating.md`

