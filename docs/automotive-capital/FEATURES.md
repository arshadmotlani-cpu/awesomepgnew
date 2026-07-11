# Features — Automotive Capital

Feature specifications with acceptance criteria. Each feature is independently testable.

---

## F1 — Authentication

### F1.1 Login

**Description:** Single administrator logs in with email and password.

**Acceptance criteria:**
- [ ] Login page at `/login` on invest host only
- [ ] Email + password form with validation
- [ ] Invalid credentials show generic error (no enumeration)
- [ ] Successful login creates `ac_auth_sessions` row and sets `ac_session` cookie
- [ ] Redirect to `/dashboard` or safe `next` param
- [ ] Failed attempts rate-limited (5 per 15 min per IP)
- [ ] Login logged in `ac_activity_log`
- [ ] No signup, register, or forgot password links

### F1.2 Logout

- [ ] Logout revokes session in DB and clears cookie
- [ ] Redirect to `/login`
- [ ] Logout logged in activity

### F1.3 Session Persistence

- [ ] Session persists 30 days with sliding refresh
- [ ] Expired/revoked session redirects to login
- [ ] PWA reopen restores session if valid

---

## F2 — Dashboard

### F2.1 KPI Cards

**Metrics displayed:**

| Card | Calculation |
|------|-------------|
| Total Capital Invested | SUM(capital investments) − reversals |
| Capital Outstanding | Invested − capital returned |
| Money Received | SUM(all payments) |
| Profit Earned | SUM(profit payments) |
| Pending Profit | Sold asset profit − profit received |
| Assets In Stock | COUNT(status NOT IN sold, settled, cancelled) |
| Assets Sold | COUNT(status IN sold, settled) |
| Average ROI | AVG(roi_bps) across sold assets |
| Average Holding Days | AVG(holding_days) across sold assets |
| Monthly Profit | Profit received in current month |
| Yearly Profit | Profit received in current year |
| Lifetime Profit | All-time profit received |

- [ ] All cards load with skeleton state
- [ ] Numbers animate on load (count-up)
- [ ] Money formatted in Indian numbering
- [ ] Cards clickable → relevant detail page

### F2.2 Charts

| Chart | Type | Data |
|-------|------|------|
| Monthly Profit | Bar | Last 12 months |
| Cash Flow | Area | Inflows vs outflows by month |
| Investments | Bar | Capital invested by month |
| Expenses | Stacked bar | By category, last 6 months |
| Assets Purchased | Line | Count by month |
| Assets Sold | Line | Count by month |
| ROI Trend | Line | Average ROI by month |
| Holding Time | Bar | Average days by month |

- [ ] Charts lazy-loaded (dynamic import)
- [ ] Responsive on mobile
- [ ] Tooltip on hover with formatted values
- [ ] Empty state when no data

### F2.3 Smart Insights

| Insight | Condition |
|---------|-----------|
| Assets older than 90 days | holding_days > 90 AND status NOT sold/settled |
| Pending settlements | status = sold AND settlement_pct < 100% |
| Highest profit asset | MAX(profit_paise) among sold |
| Highest loss asset | MIN(profit_paise) among sold |
| Best manufacturer | MAX avg ROI by manufacturer |
| Worst manufacturer | MIN avg ROI by manufacturer |
| Capital locked | SUM(outstanding) for in-stock assets |
| No movement 30 days | No expense/payment in 30 days |
| Expected returns | SUM(expected sale − received) for listed assets |

- [ ] Insight cards with icon, description, CTA link
- [ ] Dismissible per session (not persisted)

---

## F3 — Asset Management

### F3.1 Asset List

- [ ] Paginated table (50 per page)
- [ ] Columns: registration, manufacturer, model, year, status, investment, profit, ROI, holding days
- [ ] Sort by any column
- [ ] Instant search (debounced 300ms)
- [ ] Filters: status, profit/loss, holding days, month, year, manufacturer
- [ ] Empty state with "Add first asset" CTA
- [ ] Row click → asset detail

### F3.2 Create Asset

**Fields:** manufacturer, model, variant, year, registration number, VIN, engine number, chassis number, color, purchase date, purchase price, expected sale price, status (default: purchased), notes, photos.

- [ ] Form validation with Zod
- [ ] Registration number unique (case-insensitive)
- [ ] Creates asset + automotive details + ledger entry
- [ ] Autosave draft every 2 seconds
- [ ] Optimistic UI with undo snackbar (5s)
- [ ] Activity logged

### F3.3 Asset Detail (Command Center)

Single page with tabs:

| Tab | Content |
|-----|---------|
| Timeline | Chronological events (purchase, expenses, status changes, payments, settlement) |
| Expenses | Filterable expense list with add button |
| Documents | Upload grid with type icons |
| Payments | Payment history for this asset |
| Profit | Investment breakdown, profit calculation, settlement % |
| Ledger | Asset-scoped ledger entries |
| Notes | Editable notes with autosave |

- [ ] Header shows key metrics: investment, profit, ROI, holding days, settlement %
- [ ] Status change via dropdown with confirmation
- [ ] Record sale inline
- [ ] Mobile: tabs as horizontal scroll

### F3.4 Status Workflow

Valid transitions:

```
purchased → repairing → painting → ready → listed → sold → settled
any (except settled) → cancelled
```

- [ ] Invalid transitions rejected with error
- [ ] Status change logged in timeline + activity

### F3.5 Record Sale

- [ ] Set actual sale price + sale date
- [ ] Status auto-changes to `sold`
- [ ] Profit and ROI recalculated
- [ ] Holding days finalized

---

## F4 — Expenses

### F4.1 Create Expense

**Fields:** date, category, vendor, amount, description, payment method, bill upload, notes.

- [ ] Category dropdown from `ac_categories`
- [ ] Amount in rupees → stored as paise
- [ ] Bill upload to blob storage
- [ ] Ledger entry created
- [ ] Asset `total_expense_paise` and `total_investment_paise` recalculated
- [ ] Undo snackbar

### F4.2 Expense List (Cross-Asset)

- [ ] All expenses across assets
- [ ] Filter by category, date range, asset
- [ ] Link to asset detail

### F4.3 Reverse Expense

- [ ] Creates reversal ledger entry
- [ ] Marks expense `is_reversed = true`
- [ ] Recalculates asset totals
- [ ] Original remains visible (strikethrough UI)

---

## F5 — Payments Received

### F5.1 Record Payment

**Fields:** date, amount, payment type, capital returned, profit, adjustment, payment mode, reference number, notes, asset (optional).

- [ ] Split validation: capital + profit + adjustment = amount
- [ ] Payment types: capital_returned, profit, adjustment, refund
- [ ] Payment modes: cash, upi, neft, rtgs, cheque, bank
- [ ] Ledger entry created
- [ ] Asset settlement % recalculated
- [ ] Portfolio outstanding updated

### F5.2 Payment List

- [ ] All payments with filters (type, mode, date, asset)
- [ ] Running totals in header

### F5.3 Reverse Payment

- [ ] Reversal pattern same as expenses

### F5.4 Auto-Calculations

- [ ] Outstanding capital (portfolio level)
- [ ] Outstanding profit (portfolio level)
- [ ] Outstanding total
- [ ] Settlement % per asset

---

## F6 — Capital Investments

### F6.1 Record Capital

**Fields:** date, amount, payment mode, reference number, notes.

- [ ] Portfolio-level (not tied to asset)
- [ ] Ledger entry created
- [ ] Dashboard capital invested updated

### F6.2 Capital History

- [ ] List with totals
- [ ] Reverse capability

---

## F7 — Ledger

### F7.1 Ledger Explorer

- [ ] Chronological list of all entries (newest first)
- [ ] Columns: date, type, description, debit, credit, asset, source
- [ ] Filter by type, asset, date range
- [ ] Reversal entries visually linked to original
- [ ] No delete or edit UI
- [ ] Export to CSV

### F7.2 Integrity

- [ ] Every financial mutation has corresponding ledger entry
- [ ] Reversal pairs balance to zero
- [ ] Integrity check script available

---

## F8 — Documents

### F8.1 Upload

**Types:** purchase_invoice, repair_bill, insurance, rc, photo, sale_invoice, other.

- [ ] Drag-and-drop + file picker
- [ ] Image preview, PDF icon
- [ ] Linked to asset (and optionally expense/payment)
- [ ] Max 10 MB per file

### F8.2 Document Library

- [ ] Grid view with thumbnails
- [ ] Filter by type, asset, date
- [ ] Click to view via authenticated proxy
- [ ] Download button

---

## F9 — Reports

### F9.1 Report Types

| Report | Content |
|--------|---------|
| Monthly | P&L, cash flow, asset activity for month |
| Quarterly | Aggregated quarterly view |
| Yearly | Annual summary |
| Lifetime | All-time portfolio performance |
| Investment | Capital deployed vs returned |
| Outstanding | What's still owed |
| Cash Flow | Inflows/outflows timeline |
| ROI | ROI by asset, manufacturer, period |
| Profit & Loss | Revenue vs costs |

### F9.2 Export

- [ ] Excel (.xlsx) via exceljs
- [ ] CSV
- [ ] PDF via pdf-lib
- [ ] Export logged in activity
- [ ] Filename includes report type and date

---

## F10 — Analytics

Extended analysis beyond dashboard:

- [ ] Manufacturer performance comparison
- [ ] Category expense breakdown
- [ ] Holding time distribution
- [ ] ROI distribution histogram
- [ ] Cash flow forecast (based on expected sale prices)
- [ ] Monthly/quarterly/yearly toggle

---

## F11 — Search

### F11.1 Global Search

- [ ] Cmd+K opens command palette with search
- [ ] Search bar in top nav
- [ ] Searches: registration, model, manufacturer, status, year, notes
- [ ] Results grouped by type (assets, expenses, payments)
- [ ] Keyboard navigable results
- [ ] < 200ms response for typical dataset

---

## F12 — Settings

- [ ] Business name
- [ ] Logo upload
- [ ] Profit sharing ratio (numerator/denominator)
- [ ] Currency (INR default, display only in Phase 1)
- [ ] Theme accent color
- [ ] Category management (add/edit/disable custom categories)
- [ ] Change password (Phase 2 — optional in Phase 1)

---

## F13 — Activity Log

- [ ] Chronological audit trail
- [ ] Filter by action type, date
- [ ] Shows before/after state for edits
- [ ] IP address and user agent
- [ ] Read-only (no delete)

---

## F14 — User Experience

### F14.1 Command Palette

- [ ] Cmd+K / Ctrl+K opens palette
- [ ] Actions: navigate, add asset, add expense, add payment, search
- [ ] Fuzzy matching
- [ ] Recent items

### F14.2 Keyboard Shortcuts

- [ ] `G + letter` for navigation (Linear-style)
- [ ] `N` for new (context-aware)
- [ ] `Esc` to close modals/palette
- [ ] `?` to show shortcut help

### F14.3 Optimistic Updates

- [ ] Create/update shows immediately
- [ ] 5-second undo snackbar
- [ ] Rollback on server error with error toast

### F14.4 Autosave

- [ ] Draft saved to `ac_drafts` on debounce
- [ ] Restored on page revisit
- [ ] Cleared on successful submit

---

## F15 — PWA

- [ ] Installable on iOS and Android
- [ ] Custom app icon and splash screen
- [ ] Offline shell (cached login + dashboard skeleton)
- [ ] `standalone` display mode
- [ ] No PG manifest or icons referenced

---

## F16 — Performance

- [ ] Dashboard loads < 2s on 4G
- [ ] Asset list paginated (no full table load)
- [ ] Charts lazy-loaded
- [ ] Server Components for all read paths
- [ ] Optimized SQL (no N+1)
- [ ] `unstable_cache` for dashboard aggregates (60s)

---

## Out of Scope (Phase 1)

- Multi-user / roles
- Dealer portal
- Bank feed import
- WhatsApp notifications
- GST/tax calculations
- Multi-currency
- Property/gold/other asset classes (schema ready, UI not built)

---

## F17 — Investment OS Overview + Manual Profit (2026-07-11)

### F17.1 Executive Overview dashboard

- [x] Premium dark glass KPI grid with MoM trend % and icons
- [x] Interactive Recharts (profit, investment, ROI, allocation, expenses, status, profit sources, portfolio OHLC)
- [x] Range filters: Today / Week / Month / Quarter / Year / Custom / All
- [x] Auto insights, recent activity timeline, quick actions
- [x] Charts driven from live Capital DB (empty states when no data)

### F17.2 Add Manual Profit

- [x] Table `ac_manual_profits` + ledger entry type `manual_profit`
- [x] Categories: investment_return, adjustment, bonus, settlement, other
- [x] Flows into Total Profit, ROI, monthly profit charts, cash-flow reports, ledger, activity
