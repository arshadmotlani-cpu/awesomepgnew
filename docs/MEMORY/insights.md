# Memory — Insights

> **Append-only** learnings and observations. Lessons, patterns, and "why" notes.

**Rule:** Never delete entries. Link to [[DECISIONS]], [[BUGS]], or domain hubs when relevant.

---

## 2026-07-03

- **Approval pipeline SSOT:** Payment proofs must flow `listPendingPaymentReviews` → `action_items` (`paymentReviewKey`) → notifications (`finalizeApprovalNotificationDeepLink`) → Operations WFA queue. Never deep-link payment proofs to Billing Centre or use independent header counts per filter.

## 2026-06-22

- **Nested Git repos:** App repo (`awesomepg`) and docs vault (`docs/.git`) can coexist; parent may show `docs/` as modified — use separate GitHub remote for vault sync
- **Obsidian vault marker:** Opening `docs/` in Obsidian creates `.obsidian/` (gitignored); absence of `.obsidian/` means vault not yet opened there
- **Wiki-link basenames:** Moving `FEATURES.md` → `PROJECT/features.md` changes link target to `[[features]]` — verify with `npm run docs:links` in app repo

## 2026-06-21

- **RSC serialization:** Passing `Date` objects from server components to `'use client'` children crashes pages — always serialize at boundary ([[DECISIONS#Client Date serialization]])
- **Half-open ranges:** Last occupied day = `upper(stay_range) - 1`; pro-ration uses day after move-out as exclusive end
- **Deposit refund timing:** Residents attempted meter upload before vacate date because UI didn't cap journey stages — fixed in `vacatingJourney.ts`
- **Bed assignment drift:** Bed map and residents list used different SQL predicates until `occupancySsot.ts` alignment (`88a16e8`)
- **Checkout-month rent gap:** Filing vacating notice for partial month (e.g. 5 July) didn't generate 1–5 July rent until `vacatingCheckoutBilling.ts`

---

## How to append

```markdown
## YYYY-MM-DD
- **Topic:** Insight in one or two sentences. Link a domain hub (e.g. [[Vacating]]) if applicable.
```

---

## Related

[[mistakes]] · [[decisions]] · [[DECISIONS]] · [[AI_CONTEXT]]

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

## 2026-07-02

- **Dhruv booking chain:** APG-2026-0036 (fixed 7-night, B3, ended 30 Jun) ≠ current APG-2026-0040 (monthly, B1, Jul–Aug). Incident reports conflated booking codes, beds, and stay types.
- **~₹8k vs ~₹9k pricing:** Shantinagar Room 102 list rent is ₹4,121/mo with 1× month deposit (₹8,242 checkout), not ₹6,000/₹3,000. APG-0036 fixed stay was correctly ₹2,685.
- **Occupancy date field:** `upper(stay_range)` on monthly bookings is a billing-period bound, not a vacancy date — must not drive public pre-bookable state.

## 2026-07-02

- **Dhruv booking chain:** APG-2026-0036 (fixed 7-night, B3, ended 30 Jun) ≠ current APG-2026-0040 (monthly, B1, Jul–Aug). Incident reports conflated booking codes, beds, and stay types.
- **~₹8k vs ~₹9k pricing:** Shantinagar Room 102 list rent is ₹4,121/mo with 1× month deposit (₹8,242 checkout), not ₹6,000/₹3,000. APG-0036 fixed stay was correctly ₹2,685.
- **Occupancy date field:** `upper(stay_range)` on monthly bookings is a billing-period bound, not a vacancy date — must not drive public pre-bookable state.


<!-- INTEL_2026-07-28T13:51:08Z -->
### 2026-07-28T13:51:08Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 2 files changed, 2 insertions(+), 1 deletion(-)
- **Files:**
- `MEMORY/active_memory.md`
- `MEMORY/changelog.md`


<!-- INTEL_2026-07-28T14:00:33Z -->
### 2026-07-28T14:00:33Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 1 file changed, 1 insertion(+)
- **Files:**
- `MEMORY/changelog.md`


<!-- INTEL_2026-07-29T-property-performance-audit -->
### 2026-07-29 — Property Performance accounting

- **INSIGHT:** Overview “Property Performance” was not wrong arithmetically — **Total Revenue** was **operating revenue** (rent principal + electricity + late fees + other income) and **intentionally excluded deposits** (liability). Central Female ₹18,720 = ₹15,000 rent principal + ₹3,720 electricity. Shantinagar ₹64,579 − ₹64,532 = **₹47 late fees** hidden because the widget omitted the Late fees column present on Revenue command center.
- **INSIGHT:** Per-PG rent uses `paidPrincipalPaise` after `splitRentAndLateFees`; PGs with ₹0 operating revenue but 100% occupancy simply have **no paid invoices for the selected billing month** (not occupancy-derived).
- **SSOT chain:** `rent_invoices` / `electricity_invoices` (paid, billing month) → `getPgBusinessMetrics` → `financialMetricsEngine.pgMetricsFromRow` → `revenueCommandCenter.buildByPgRows`; deposits → `deposit_ledger` via `getDepositCollectedByPgFromLedger` only.

<!-- INTEL_2026-07-28T18:16:39Z -->
### 2026-07-28T18:16:39Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 4 files changed, 18 insertions(+), 1 deletion(-)
- **Files:**
- `MEMORY/active_memory.md`
- `MEMORY/changelog.md`
- `MEMORY/tasks.md`
- `foryourhair/README.md`

