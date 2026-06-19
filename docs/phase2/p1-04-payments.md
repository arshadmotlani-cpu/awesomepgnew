# P1-4 — Payments

**Route:** `/account/profile?section=resident&tab=payments`  
**Status:** ✅ Presentation redesign complete

---

## Structure

| Section | Contents |
|---------|----------|
| Payments summary | Amount due · Bills waiting · Next due date |
| What to do next | Pay now (primary) · Payment history · Wallet |
| Your bills | Simple list with Pay buttons (mobile-first) |
| Security deposit due | When outstanding |
| More — Full bill tables | Detailed rent + electricity tables (collapsed) |

---

## Before / after

| Surface | Before | After |
|---------|--------|-------|
| Entry | Jumped to `<details>` invoice tables | **Summary + bill list first** |
| Pay actions | Per-row in wide tables only | **List + primary Pay now** |
| Payment history | Small link above tables | **Primary action row** |
| Tables | Expanded by default | **More section** |

---

## Plain language

| Before | After |
|--------|-------|
| Pay → | Pay |
| Rent invoices (N) | Your bills / Rent · month |
| Outstanding | Amount due |

---

## Business logic unchanged

- Invoice projection, pay-rent / pay-electricity routes
- `DepositDueSection` on payments tab when deposit due
