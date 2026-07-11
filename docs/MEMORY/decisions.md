# Memory — Decisions

> **Append-only** log of decisions made (operational + strategic).  
> Formal ADRs with full rationale: [[DECISIONS]] (do not duplicate — cross-link instead).

**Rule:** One bullet per decision. Never delete entries.

---

## 2026-07-11

- **Multi-investor vehicle funding** — Each asset has business layer (purchase/sale/expenses) and investment layer (`ac_asset_investors`). Stakes must sum to purchase price. Business ROI = profit ÷ purchase price. My ROI = my profit ÷ my invested capital. Profit defaults to proportional to capital. SSOT: `src/capital/lib/investors.ts`, migration `0006_asset_investors`.
- **Rotating working-capital pool** — Dashboard models a continuous capital pool, not an accounting ledger. Working Capital = Initial Capital + My Lifetime Profit. Free Cash = Working Capital − Current Investment − Capital in Transit. Selling recycles capital; only profit increases wealth. SSOT: `src/capital/lib/workingCapital.ts`.
- **ROI formulas (Business vs Personal)** — Business ROI = Gross Business Profit ÷ Lifetime Purchase Volume. Personal ROI = My Profit ÷ My Capital Invested. When partner share > 0, Personal is clamped ≤ Business so a 50:50 equal-capital deal shows ~half (e.g. 20% / 10%). Per-vehicle ROIs use total investment (purchase + expenses) as the shared base. SSOT: `src/capital/lib/roi.ts`.
- **Manual profits are first-class ledger credits** — Non-vehicle profits (`ac_manual_profits`) post `manual_profit` ledger credits and roll into Overview KPIs, ROI, monthly profit series, cash-flow exports, and activity — not a side table ignored by totals

## 2026-07-10

- **Automotive Capital architecture** — Host-based routing in same Next.js app; separate Neon DB (`INVEST_DATABASE_URL`); asset-first polymorphic schema; append-only ledger with reversals; custom DB sessions; Vercel Blob; shadcn/ui; code under `src/capital/` → `docs/automotive-capital/DECISIONS.md` (ADR-001–010)

## 2026-07-02

- **Booking Lifecycle SSOT** — Approved plan: 5 public bed states + admin `checkout_pending`; unbounded monthly `stay_range`; deposit policy PG→room→bed inheritance (PG UI only); Phase 1→2→2b→3→4 → `docs/BOOKING_LIFECYCLE_SSOT_PLAN.md`
- **Resident Portal V2** — Consolidated 9 tabs into 5; Profile owns stay + wallet; Payments owns due + paid history; move-out merged into Requests; referral + room-shift backends added. Defaults: `docs/MEMORY/decisions-resident-portal-v2.md`

## 2026-06-22

- Adopted **MEMORY/** folder for auto-structured AI memory (ideas, tasks, insights, mistakes, decisions, active_memory)
- Moved system docs to `SYSTEM/` and project inventory to `PROJECT/features.md` — vault structure enforced
- Docs vault is standalone Git repo at `/Users/aashumotlani/awesomepg/docs` with fswatch auto-sync scripts

## 2026-06-21

- Maintain `/docs` as Obsidian-compatible second brain; update on every code change ([[DECISIONS#Documentation second brain]])
- On vacating submit/approve, auto pro-rate checkout-month rent via `vacatingCheckoutBilling.ts` ([[DECISIONS#Vacating checkout rent sync]])
- Split vacate notice from deposit refund — meter/UPI only after approve + vacate date ([[DECISIONS#Split vacate request from deposit refund]])
- Primary operator actions live in [[Operations]] queue ([[DECISIONS#Operations as action hub]])
- Serialize `Date` → ISO before passing to client components ([[DECISIONS#Client Date serialization]])
- Align bed map and residents list via `occupancySsot.ts` ([[DECISIONS#Bed assignment SSOT alignment]])

---

## How to append

```markdown
## YYYY-MM-DD
- Decided to … (link [[DECISIONS#…]] if formal ADR exists)
```

---

## Related

[[active_memory]] · [[DECISIONS]] · [[insights]] · [[AI_CONTEXT]]

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


## DECISION — Asset create form fields (2026-07-11)
- Registration/VIN/expected sale not collected on create; registration nullable in DB. Ownership capped at third owner. Fuel type enum: petrol/diesel/cng/ev/hybrid.

## DECISION — Overview capital metrics (2026-07-11)
- Current Investment = SUM(total_investment) on active vehicles. Lifetime Purchase Volume = SUM(purchase_price) all non-cancelled. Lifetime Profit = payment profits + manual. Overall ROI = profit / purchase volume. Cash ≈ capital injected − current investment + lifetime profit. Not a multi-investor dealership product.

## DECISION — Profit sharing (2026-07-11)
- Each sale/manual profit stores its own split. Business ROI = gross ÷ purchase volume. My ROI = my share ÷ capital invested. Existing deals backfilled 100% to investor.
