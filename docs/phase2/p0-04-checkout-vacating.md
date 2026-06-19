# P0-4 — Checkout / Vacating (Admin)

**Routes:** `/admin/vacating`, `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]`  
**Status:** ✅ Presentation redesign complete

---

## Structure

### Move-out requests (`/admin/vacating`)

| Section | Contents |
|---------|----------|
| Move-out summary | Waiting · Ready for checkout · Done · Notice too short |
| What to do next | ≤5 links (review, open checkout, settlements) |
| All requests | Filterable table |

**Row actions:** 1 primary (Approve / Open checkout) + “More actions” details (reject, cancel, undo).

### Checkout settlements list

| Section | Contents |
|---------|----------|
| Checkout summary | Current queue · count · next step |
| What to do next | ≤5 tab/queue links |
| Settlement queue | Plain-language tabs |

### Checkout settlement detail

| Section | Contents |
|---------|----------|
| Checkout summary | Deposit held · Final refund · Status · Notice fee |
| What to do next | Approve / Mark sent + profile links |
| Details | Collapsible resident, notice fee, electricity, UPI |
| Refund breakdown | Single calculation block |
| Primary forms | Approve refund · Mark refund sent |
| Advanced tools | Rebuild · Archive · Delete (collapsed) |

---

## Before / after action count

| Screen | Before | After (visible) |
|--------|--------|-----------------|
| Vacating table row (pending) | 3 buttons | 1 primary + More actions |
| Vacating table row (approved) | 3 buttons | 1 primary + More actions |
| Checkout detail | Deposit wallet + preview duplicate + Actions panel open | Summary once + breakdown once + Advanced collapsed |
| Checkout list | Raw status enums | Plain-language tabs |

---

## Duplicates removed

- Removed separate `BillingCycleOperationsPanel`-style duplicate on vacating (N/A)
- Removed full “Deposit wallet” section from checkout detail (kept in summary + breakdown only)
- Removed always-expanded “Actions” panel → Advanced tools collapsed by default
- Fixed vacating page light-theme styling → admin dark shell

---

## Advanced tools moved

- Reject / cancel / undo vacating → row “More actions”
- Rebuild / archive / delete settlement → Advanced tools section

---

## Business logic unchanged

- All vacating and checkout server actions
- `getCheckoutSettlementIdForVacating` pre-fetch on server (existing service)
- Permissions (`deposits:write`, vacating actions)
- Settlement state machine and ledger writes
