# Quick Sale UX Redesign — QA & Implementation Notes

## Files changed

| File | Change |
|------|--------|
| `src/hair/components/quick-sale/QuickSaleShell.tsx` | Section cards, session persistence, compact catalog, Cancel/New Sale, keyboard |
| `src/hair/components/quick-sale/QuickSaleBasketTable.tsx` | Column order, GST %, discount sync, staff chips |
| `src/hair/components/quick-sale/QuickSaleStaffFields.tsx` | Chip + search staff picker (no + button) |
| `src/hair/components/quick-sale/QuickSalePaymentPanel.tsx` | Spacing, prominent remaining, equal button heights |
| `src/hair/lib/quickSaleSession.ts` | **New** — localStorage snapshot (`fyh-quick-sale-session-v1`) |
| `src/hair/domain/basket/attribution.ts` | Product multi-staff equal revenue split |
| `src/hair/lib/attributionMath.ts` | Legacy hold path: product multi-staff via `servicedBy` |
| `src/hair/domain/basket/legacyBridge.ts` | Hold/resume: multi-staff products in legacy lines |
| `src/hair/styles/globals.css` | `.qs-section`, catalog rows, staff chips, number spinner removal |
| `tests/hair/unit/attributionPlan.test.ts` | **New** — attribution split tests |
| `tests/hair/unit/quickSaleSession.test.ts` | **New** — session shape test |

## Visual hierarchy (after)

Each major block is a `.qs-section` card:

1. **Customer** — name, code, wallet; Change customer + menu (Hold / New sale / Cancel)
2. **Catalog** — Services / Products / Packages / Memberships tabs (gold active state)
3. **Search** — compact dropdown; price adjacent to name
4. **Basket** — table with Base → GST (%) → Selling → Staff → Qty → Disc % → Final
5. **Totals** — subtotal, GST, discounts, grand total (gold accent)
6. **Payment** — large remaining amount, equal-height controls
7. **Confirm sale** — full-width primary action

Palette shift: charcoal surfaces (`--fyh-bg-surface`), soft borders, gold accents (`--fyh-accent`) instead of all-green panels.

### Screenshots

Before/after captures should be taken manually at `/fyh/quick-sale`:

- **Before**: flat green/glass layout, stretched catalog prices, global staff + button
- **After**: stacked section cards, compact catalog rows, per-line staff chips

> Automated screenshots were not committed; attach PNGs to this doc or a PR when validating in staging.

## Staff allocation workflow

Per basket row (services & products only):

1. Type in **Search staff…**
2. Dropdown shows matches; click or Enter to add
3. Chip appears: `Rahul ×`
4. Input clears → **Search another staff…**
5. Repeat for unlimited staff; packages/memberships show `—`

Shares are normalized to equal splits via `normalizeEqualShares()` whenever staff are added or removed.

Staff display names persist in `staffNames` map (saved with session).

## Revenue split logic

**Services & products** with 2+ staff:

- Base revenue split equally by `shareBps` (sum = 10 000)
- Each attribution row: `attributedBasePaise = attributedNetForShare(line.basePaise, shareBps)`
- Checkout uses `buildAttributionPlan()` in `priceBasket()` → commission uses split base

**Packages & memberships**:

- Unchanged — first staff only, full line base
- Staff UI hidden (`—`)

**Hold bills**: multi-staff products encoded as `servicedBy` in legacy lines; `buildAttributionRows` treats product + multi `servicedBy` as multi `sold_by`.

Example: Service ₹100 base, 2 staff → ₹50 attributed each.

## Refresh persistence

**Storage key**: `localStorage['fyh-quick-sale-session-v1']`

**Saved fields**: customer, appointmentId, tab, catalogQ, lines (incl. staff/qty/discounts), payments, flags, holdInvoiceId, staffNames

**Restore**: on mount (unless appointment prefill); debounced save every 300ms while on sale step

**Clear only on**:

- Successful checkout (`clearQuickSaleSession`)
- **Cancel sale** (menu)
- **New sale** (menu)
- **Hold bill** / success dialog **Done** (full reset)

Refresh mid-sale returns to sale step with basket intact.

## Regression risks

| Area | Risk | Mitigation |
|------|------|------------|
| Product 2+ staff commission | New split behavior | Unit tests in `attributionPlan.test.ts` |
| Hold/resume multi-staff products | Legacy `servicedBy` encoding | Test hold → resume manually |
| localStorage quota / private mode | Save fails silently | Session optional; sale still works |
| Appointment checkout | Prefill overrides stored session | Appointment path skips restore |
| Package/membership staff | Must stay single-seller | Plan test asserts no split |
| Discount % ↔ Final sync | Rounding on small amounts | Existing bps/paise helpers unchanged |
| Browser number spinners | Global CSS hide | Verify on Safari/Chrome |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus customer search (customer step) or catalog search (sale step) |
| `Enter` | Add first catalog match; add staff from dropdown; add payment |
| `ArrowDown` | Focus first catalog result from search |
| `Tab` | Standard field navigation |

## Test plan

```bash
npx tsx --test tests/hair/unit/attributionPlan.test.ts \
  tests/hair/unit/quickSaleSession.test.ts \
  tests/hair/unit/salesAttribution.test.ts
```

Manual:

1. Add service + 2 staff → confirm equal split in staff performance after sale
2. Refresh browser → basket/customer/tab restored
3. Cancel sale → session cleared
4. Product line: edit Disc % and Final — fields stay in sync
5. Package line: staff column shows `—`
