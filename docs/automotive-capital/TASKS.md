# Tasks — Automotive Capital

Granular implementation checklist. Mark items complete as work progresses.

**Legend:** `[ ]` pending · `[~]` in progress · `[x]` done

---

## Phase 0 — Planning (Current)

### Documentation
- [x] README.md
- [x] ARCHITECTURE.md
- [x] DATABASE.md
- [x] ROUTES.md
- [x] SECURITY.md
- [x] UI_SYSTEM.md
- [x] FEATURES.md
- [x] WORKFLOWS.md
- [x] TASKS.md
- [x] ROADMAP.md
- [x] CHANGELOG.md
- [x] DECISIONS.md
- [x] RISKS.md

### Audit
- [x] Audit existing Awesome PG architecture
- [x] Identify reusable infrastructure (DB client, auth crypto, blob, monitoring)
- [x] Identify isolation boundaries
- [ ] Planning review and approval

---

## Phase 1 — Foundation

### 1.1 Project Scaffolding
- [ ] Create `src/capital/` directory structure
- [ ] Create `app/(capital)/` route group
- [ ] Create `capital/drizzle.config.ts`
- [ ] Add npm scripts: `capital:db:generate`, `capital:db:migrate`, `capital:db:seed`, `capital:db:studio`
- [ ] Add ESLint `no-restricted-imports` rule for Capital → PG isolation
- [ ] Add `.env.example` entries for Capital env vars

### 1.2 Dependencies
- [ ] Install zod, react-hook-form, @hookform/resolvers
- [ ] Install recharts
- [ ] Install shadcn/ui dependencies (radix, cva, clsx, tailwind-merge, lucide-react, cmdk)
- [ ] Install exceljs
- [ ] Initialize shadcn in `src/capital/components/ui/`

### 1.3 Database
- [ ] Define enums in `src/capital/db/schema/enums.ts`
- [ ] Define all tables per DATABASE.md
- [ ] Generate initial migration `0001_initial.sql`
- [ ] Implement `src/capital/db/client.ts` (INVEST_DATABASE_URL)
- [ ] Implement `src/capital/lib/db/env.ts`
- [ ] Implement `src/capital/db/migrate.ts`
- [ ] Implement `src/capital/db/seed.ts` (settings, categories, admin from env)
- [ ] Verify migration runs against Neon dev branch

### 1.4 Host Routing
- [ ] Implement `isCapitalHost()` helper
- [ ] Implement `capitalMiddleware()` function
- [ ] Extend `middleware.ts` with host guard (PG logic untouched)
- [ ] Add Capital middleware matcher paths
- [ ] Test: invest host blocks PG routes
- [ ] Test: www host blocks Capital routes

### 1.5 Authentication
- [ ] Copy/adapt `crypto.ts`, `password.ts` to `src/capital/lib/auth/`
- [ ] Implement `src/capital/lib/auth/session.ts`
- [ ] Implement `src/capital/lib/auth/guards.ts` (`requireCapitalAuth`)
- [ ] Implement `src/capital/lib/auth/constants.ts` (`ac_session` cookie)
- [ ] Implement login Server Action
- [ ] Implement logout Server Action
- [ ] Build login page UI (glass design)
- [ ] Implement login rate limiting
- [ ] Activity log on login/logout/failure

### 1.6 Design System
- [ ] Create `src/capital/styles/tokens.css`
- [ ] Create `src/capital/styles/globals.css`
- [ ] Install core shadcn components (button, input, card, dialog, etc.)
- [ ] Build Capital root layout (metadata, favicon, fonts)
- [ ] Build app shell layout (sidebar, topbar)
- [ ] Build mobile bottom tab nav

### 1.7 Dashboard (Shell)
- [ ] Dashboard page with KPI card skeletons
- [ ] `AnalyticsService.getDashboardKpis()` — basic queries
- [ ] `KpiCard` component
- [ ] `MoneyDisplay` component
- [ ] Wire real data to KPI cards

---

## Phase 2 — Core Domain

### 2.1 Ledger Engine
- [ ] Implement `LedgerService.post()`
- [ ] Implement `LedgerService.reverse()`
- [ ] Implement ledger integrity check function
- [ ] Unit tests: posting, reversal, balance

### 2.2 Asset Management
- [ ] Zod schemas for asset forms
- [ ] `AssetService.create()`
- [ ] `AssetService.update()`
- [ ] `AssetService.updateStatus()`
- [ ] `AssetService.recordSale()`
- [ ] `AssetService.cancel()`
- [ ] `AssetService.recalculate()` (cached fields)
- [ ] Server Actions for all asset operations
- [ ] Asset list page with pagination
- [ ] Asset create page with autosave
- [ ] Asset detail page (shell + tabs)
- [ ] Status badge component
- [ ] Unit tests: ROI, holding days, profit calculation

### 2.3 Expenses
- [ ] `ExpenseService.create()`
- [ ] `ExpenseService.reverse()`
- [ ] Server Actions
- [ ] Expense form component
- [ ] Expense list on asset detail tab
- [ ] Cross-asset expense list page
- [ ] Unit tests: expense recalculation

### 2.4 Payments
- [ ] `PaymentService.create()`
- [ ] `PaymentService.reverse()`
- [ ] Split validation (capital + profit + adjustment = amount)
- [ ] Server Actions
- [ ] Payment form component
- [ ] Payment list page
- [ ] Payment tab on asset detail
- [ ] Outstanding calculations
- [ ] Settlement % calculation
- [ ] Unit tests: payment splits, outstanding

### 2.5 Capital Investments
- [ ] `CapitalService.create()`
- [ ] `CapitalService.reverse()`
- [ ] Server Actions
- [ ] Capital list page
- [ ] Capital create form

### 2.6 Settlements
- [ ] `SettlementService.create()`
- [ ] Profit sharing calculation
- [ ] Settlement UI on sold assets
- [ ] Status transition to settled

### 2.7 Activity Log
- [ ] `ActivityService.log()`
- [ ] Hook into all services
- [ ] Activity log page with filters

---

## Phase 3 — Reports, Analytics, Documents

### 3.1 Documents
- [ ] Copy/adapt blob storage to `src/capital/lib/storage/`
- [ ] `DocumentService.upload()`
- [ ] `DocumentService.delete()` (metadata only)
- [ ] Authenticated file proxy route
- [ ] Document upload component (drag-drop)
- [ ] Document grid component
- [ ] Documents page
- [ ] Documents tab on asset detail

### 3.2 Reports
- [ ] `ReportService` for each report type
- [ ] CSV export builder
- [ ] Excel export builder (exceljs)
- [ ] PDF export builder (pdf-lib)
- [ ] Reports hub page
- [ ] Individual report pages
- [ ] Export activity logging

### 3.3 Analytics
- [ ] `AnalyticsService` chart data methods
- [ ] 8 chart components (Recharts, lazy-loaded)
- [ ] Analytics page
- [ ] Dashboard chart integration
- [ ] Smart insight cards
- [ ] `unstable_cache` for dashboard data

### 3.4 Ledger UI
- [ ] Ledger explorer page
- [ ] Ledger tab on asset detail
- [ ] Ledger row component
- [ ] Reversal visual linking
- [ ] CSV export

---

## Phase 4 — Search, PWA, Polish

### 4.1 Search
- [ ] `SearchService.search()`
- [ ] Full-text indexes verified
- [ ] Global search bar in top nav
- [ ] Search results page
- [ ] Typeahead API endpoint

### 4.2 Command Palette
- [ ] Command palette component (cmdk)
- [ ] Cmd+K keyboard shortcut
- [ ] Navigation commands
- [ ] Action commands (add asset, expense, payment)
- [ ] Search integration
- [ ] Shortcut help dialog (`?`)

### 4.3 UX Polish
- [ ] Optimistic updates on create actions
- [ ] Undo snackbar (5s window)
- [ ] Autosave drafts (`ac_drafts`)
- [ ] Loading skeletons on all pages
- [ ] Empty states on all lists
- [ ] Error boundaries (Capital-branded)
- [ ] 404 page (Capital-branded)
- [ ] Framer Motion page transitions
- [ ] KPI count-up animation

### 4.4 Settings
- [ ] Settings page
- [ ] Business name, logo, profit ratio
- [ ] Category management
- [ ] Theme accent customization

### 4.5 PWA
- [ ] `public/capital/manifest.webmanifest`
- [ ] `public/capital/sw.js` (offline shell)
- [ ] App icons (192, 512)
- [ ] Apple touch icon
- [ ] Splash screens
- [ ] Capital layout manifest link
- [ ] Test install on iOS + Android

---

## Phase 5 — Testing & Production

### 5.1 Unit Tests
- [ ] `tests/capital/unit/ledger.test.ts`
- [ ] `tests/capital/unit/money.test.ts`
- [ ] `tests/capital/unit/roi.test.ts`
- [ ] `tests/capital/unit/paymentSplit.test.ts`
- [ ] `tests/capital/unit/reversal.test.ts`
- [ ] `tests/capital/unit/auth.test.ts`

### 5.2 Integration Tests
- [ ] `tests/capital/integration/assetLifecycle.test.ts`
- [ ] `tests/capital/integration/paymentSettlement.test.ts`

### 5.3 E2E Tests
- [ ] `tests/capital/e2e/login.spec.ts`
- [ ] `tests/capital/e2e/dashboard.spec.ts`
- [ ] `tests/capital/e2e/assetFlow.spec.ts`

### 5.4 Production Readiness
- [ ] Extend `scripts/vercel-build.sh` for Capital migrations
- [ ] Add Capital vars to `scripts/check-env.ts`
- [ ] Add `invest.awesomepg.in` domain to Vercel
- [ ] Configure `INVEST_DATABASE_URL` on Vercel
- [ ] Security header verification
- [ ] PG regression test suite still green
- [ ] Deployment checklist document
- [ ] Run seed on production (admin account)

---

## Ongoing

- [ ] Update CHANGELOG.md on each phase completion
- [ ] Append DECISIONS.md for new architectural choices
- [ ] Review RISKS.md after each phase
