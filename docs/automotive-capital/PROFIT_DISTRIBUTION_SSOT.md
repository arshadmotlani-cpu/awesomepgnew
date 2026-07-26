# Profit Distribution SSOT — Automotive Capital

> **Architecture status: FROZEN (ADR-018)**  
> Permanent accounting foundation for vehicle deal profits.

---

## Freeze rule

**No page is allowed to calculate profit independently. All vehicle profit values originate from `dealEconomics.ts` and the stored asset columns it writes.**

If a future feature needs profit data, it must **consume stored values** produced by the engine — not recreate the math.

| Allowed | Forbidden |
|---------|-----------|
| Read `profit_paise`, `my_share_paise`, `operating_partner_profit_paise`, `my_roi_bps` | `gross / 2` on a page |
| Call `distributeDealProfits` / `computeGrossDealProfit` / `splitGrossDealProfit` | Settings % on vehicle sales |
| Aggregate `SUM(my_share_paise)` for dashboards | Page-specific Sufii formulas |

**Exception:** Manual profits (non-vehicle) use [`profitShare.ts`](../../src/capital/lib/profitShare.ts) + Settings numerator/denominator. That path must never be used for vehicle deals.

---

## Two modes only

| Mode | Meaning |
|------|---------|
| `SELF` | You funded the deal. Sufii has **no profit share**. Any money he earned is broker / transport / repair (purchase activities = expenses). |
| `PARTNERSHIP_50_50` | Profit split 50–50 with Sufii. No custom percentages. |

Create defaults to **SELF**. Migration `0010` backfilled existing vehicles to **PARTNERSHIP_50_50**.

---

## Definitions

```
Gross Deal Profit  = Sale Price − Total Vehicle Investment (TVI)
                   = computeGrossDealProfit(sale, tvi)

SELF:
  My Profit     = Gross Deal Profit
  Sufii Profit  = 0

PARTNERSHIP_50_50:
  My Profit     = round(Gross / 2)
  Sufii Profit  = Gross − My Profit   (exact remainder)
```

TVI is unchanged (ADR-016): Purchase + investment-cost activities − refunds.

**My ROI** = My Profit ÷ My capital stake (funding layer).  
**Business ROI** = Gross Deal Profit ÷ TVI.

Capital co-investors (`investor_2`) remain for **funding** only — they receive **0** deal profit from this engine.

---

## Engine + writers

SSOT module: [`src/capital/lib/dealEconomics.ts`](../../src/capital/lib/dealEconomics.ts)

| Function | Role |
|----------|------|
| `computeGrossDealProfit` | Sale − TVI |
| `splitGrossDealProfit` | Mode → My / Sufii |
| `distributeDealProfits` | Full deal + ROI fields |

Persisted only by:

- `recordSale` → `distributeDealProfits` → columns  
- `recalculateAsset` → same (whenever sale price exists)  
- `updateProfitDistributionMode` → mode column + `recalculateAsset` if sold  

Stored columns (readers only):

- `profit_paise` — Gross Deal Profit  
- `my_share_paise` — My Profit  
- `operating_partner_profit_paise` / `partner_share_paise` — Sufii Profit  
- `business_roi_bps` / `my_roi_bps`  

---

## Surfaces (all readers)

Dashboard, Vehicles, Profit tab, Recent Sales, Manufacturer summaries, Reports, Exports, Analytics KPIs — all display or `SUM`/`AVG` stored columns. No redistribution.

Changing mode after sale recalculates stored values and revalidates `/dashboard`, `/reports`, `/assets`, `/analytics` (redirect), and `capital-dashboard` cache tag.

---

## Ops after migrate

```bash
# Apply 0010_profit_distribution_mode.sql, then:
npx tsx scripts/capital-recalc-deal-profits.ts
```

Flip true self deals from Partnership → Self on the vehicle Profit tab.

---

## Related

- ADR-018 (accepted) · ADR-011 superseded for vehicle sales  
- ADR-016 Total Vehicle Investment  
- [`WORKFLOWS.md`](./WORKFLOWS.md) §8.2 · [`DATABASE.md`](./DATABASE.md) §5.1  
