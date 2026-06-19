# P1-3 — Wallet

**Route:** `/account/profile?section=resident&tab=wallet`  
**Status:** ✅ Presentation redesign complete

---

## Structure

| Section | Contents |
|---------|----------|
| Balance summary | Amount due · Deposit held · Available credit · Refund status |
| What to do next | Pay due (→ Payments) or back to home |
| Security deposit due | Existing `DepositDueSection` when applicable |
| Security deposit balance | 4 plain-language wallet stats |
| More — Deposit activity | Full ledger table (collapsed) |

---

## Before / after

| Surface | Before | After |
|---------|--------|-------|
| Financial summary panel | Required/Paid/Outstanding jargon | **Balance summary** plain cards |
| Deposit wallet | 5 stats + “wallet/credit” jargon | **4 stats** + plain labels |
| Ledger table | Always visible | **More** (collapsed) |
| Actions | Pay + extension scattered | **≤3** in What to do next |

---

## Plain language

| Before | After |
|--------|-------|
| Outstanding | Amount due |
| Deposit wallet / credit | Security deposit balance |
| Currently held | Held for you |
| Available credit | Credit you can use |
| Refunded | Sent back to you |

---

## Business logic unchanged

- `getCustomerDepositCredit`, `getDepositSummaryForBooking`, deposit ledger entries
- `DepositDueSection` payment links and extension request action
