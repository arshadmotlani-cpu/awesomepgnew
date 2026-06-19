# P1-2 — Requests Center

**Route:** `/account/profile?section=resident&tab=requests`  
**Status:** ✅ Presentation redesign complete

---

## Structure

| Section | Contents |
|---------|----------|
| Requests summary | Open count · in-app vs WhatsApp |
| What to do next | **Create move-out request** (primary) + back / history links |
| Open requests | History list with status chips |
| Move-out & deposit | Vacating · refund · stay longer |
| Room & stay | Top 2 visible · rest in More |
| Help & repairs | Top 2 visible · rest in More |
| More | Deposit refund form (after move-out approved) |

---

## Before / after

| Surface | Before | After |
|---------|--------|-------|
| Request type cards | 10 equal cards | **Grouped by type** · ≤2 visible per group + More |
| Create entry | Scattered “Open request →” | **One primary:** Create move-out request |
| Deposit refund form | Duplicated on Home + Requests | **Requests More only** |
| Booking header block | Duplicated below requests | **Removed** from requests tab |
| Status | Per-card only | **Summary + open history** section |

---

## Plain language

| Before | After |
|--------|-------|
| Vacating | Give move-out notice |
| Via support | Message on WhatsApp |
| Open request → | Open request |
| Stay extension disabled copy | Stay longer (WhatsApp) |

---

## Business logic unchanged

- Request routes · WhatsApp URLs · `ResidentRequestForms` / vacating flow
- `listOpenRequestsForCustomer` data
