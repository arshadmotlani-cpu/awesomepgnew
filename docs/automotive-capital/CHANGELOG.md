# Changelog — Automotive Capital

All notable changes to Automotive Capital planning and implementation.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Planning
- Created complete planning documentation suite (13 documents)
- Defined asset-first domain architecture
- Designed independent Neon database schema with 14 tables
- Specified host-based routing for `invest.awesomepg.in`
- Documented security model for single-admin private application
- Designed premium dark glassmorphism UI system
- Defined 16 feature areas with acceptance criteria
- Documented 18 business workflows including end-to-end example
- Created phased roadmap (6 weeks estimated)
- Recorded 10 architecture decisions
- Identified 12 risks with mitigations

---

## [0.1.0] — 2026-07-10

### Added — Full Implementation
- Complete Automotive Capital application at `invest.awesomepg.in`
- Host-based routing with PG isolation (middleware)
- Independent Drizzle schema (14 tables) + migrations
- Single-admin auth (DB sessions, rate limiting)
- Dashboard with KPIs, charts, smart insights
- Asset lifecycle (create, status, sale, settle)
- Expenses, payments, capital investments with ledger
- Append-only ledger with reversals
- Reports with CSV/Excel/PDF export
- Document upload + authenticated proxy
- Command palette (Cmd+K), PWA manifest + service worker
- Analytics page with Recharts
- Activity log, global search, settings
- Unit tests (`tests/capital/unit/`)
- Deployment checklist

### Changed
- Extended `middleware.ts` with Capital host guard
- Extended `vercel-build.sh` for Capital migrations
- Login at `/login` (rewrites to `/auth/login` on invest host)

## [0.0.0-planning] — 2026-07-10

### Added
- `docs/automotive-capital/README.md` — project index
- `docs/automotive-capital/ARCHITECTURE.md` — system design
- `docs/automotive-capital/DATABASE.md` — schema specification
- `docs/automotive-capital/ROUTES.md` — URL map and Server Actions
- `docs/automotive-capital/SECURITY.md` — security model
- `docs/automotive-capital/UI_SYSTEM.md` — design system
- `docs/automotive-capital/FEATURES.md` — feature specifications
- `docs/automotive-capital/WORKFLOWS.md` — business flows
- `docs/automotive-capital/TASKS.md` — implementation checklist
- `docs/automotive-capital/ROADMAP.md` — phased delivery plan
- `docs/automotive-capital/DECISIONS.md` — architecture decisions
- `docs/automotive-capital/RISKS.md` — risk register
- `docs/automotive-capital/CHANGELOG.md` — this file

### Decisions
- Application named **Automotive Capital** (not Automotive Investment OS)
- Host routing in same Next.js app (not separate repo)
- Separate Neon database via `INVEST_DATABASE_URL`
- Asset-first polymorphic schema (cars = first asset class)
- Custom DB sessions (not NextAuth) — adapted from PG patterns
- Vercel Blob for documents (not UploadThing)
- shadcn/ui for component library
- Money in paise (bigint) throughout

---

## Version Scheme

| Version | Meaning |
|---------|---------|
| `0.0.x-planning` | Documentation only |
| `0.1.x` | Phase 1 — Foundation |
| `0.2.x` | Phase 2 — Core domain |
| `0.3.x` | Phase 3 — Reports & analytics |
| `0.4.x` | Phase 4 — Polish & PWA |
| `1.0.0` | Production launch |
