# P1-1 — Resident Home

**Route:** `/account/profile?section=resident&tab=home`  
**Status:** ✅ Presentation redesign complete

---

## Structure

| Section | Contents |
|---------|----------|
| Your stay | PG · room · bed · booking link · 4 status cards |
| What to do next | ≤5 actions · one orange primary |
| Upcoming payments | Next bills (max 5) with Pay buttons |
| Pending requests | Only when open requests exist |
| More on home | Roachie briefing · deposit policy · PS4 · tab links (collapsed) |

---

## Before / after action count

| Surface | Before | After (visible) |
|---------|--------|-----------------|
| Home page total | 10+ scattered (pay × N, vacating, PS4, refund form, tables) | **≤5** in What to do next + Pay on upcoming rows |
| Financial summary + 4-card grid + wallet | 3 overlapping stat blocks | **1 stay summary** (4 cards) |
| Invoice tables on home | Always expanded | **Removed** — Payments tab |
| Admin ops status pills | Visible | **Removed** |
| Vacating block + request forms | On home | **Requests / Move-out tabs** |
| Roachie briefing | Auto-open top | **More section** |

---

## Duplicates removed

- Removed 4-card due grid (rent / electricity / late fees / deposit) — totals in stay summary
- Removed `ResidentFinancialSummaryPanel` on home (Required/Paid/Outstanding jargon)
- Removed `DepositWalletSection` on home
- Removed `DepositDueSection` duplicate — shown in Upcoming payments
- Removed admin `labelAdminDuesStatus` / deposit refund ops labels
- Removed open-requests banner duplicate (single pending block)

---

## Plain language & GlossaryTip

| Before | After |
|--------|-------|
| Outstanding | Amount due |
| KYC | Identity check |
| Financial summary / SSOT copy | Your stay summary |
| Refundable balance | GlossaryTip on “Refundable deposit” |

---

## New shared components

- `GlossaryTip` — tap/hover term definitions
- `ResidentMoreSection` — collapsed “More” panel (resident theme)
- `ResidentHomeSummary`, `ResidentHomePrimaryActions`, `ResidentUpcomingPayments`, `ResidentHomePanel`

---

## Business logic unchanged

- All loaders in `ResidentAreaSection` (bookings, invoices, deposits, requests)
- Payment link generation · pay routes · vacating · KYC status reads
