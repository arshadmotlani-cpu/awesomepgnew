# Automotive Capital

**Private Automotive Investment Operating System**

| | |
|---|---|
| **Application** | Automotive Capital |
| **Domain** | [invest.awesomepg.in](https://invest.awesomepg.in) |
| **Status** | Planning — no implementation code yet |
| **Owner** | Single private administrator |
| **Parent repo** | Awesome PG monorepo (host-isolated product surface) |

---

## What This Is

Automotive Capital is a **financial operating system** for managing private automotive dealer investments. It is not billing software, not a CRM, and not a generic CRUD app. Every rupee is traceable. Every action is auditable. History is immutable.

The software tracks:

1. Capital invested into a dealer partnership
2. Assets purchased (cars first; property, gold, machinery later)
3. Unlimited expenses per asset
4. Sales and profit-sharing settlements
5. Payments received over time (cash, UPI, NEFT, cheque, installments)
6. A sacred append-only ledger
7. Documents, analytics, and reports

---

## What This Is Not

- Not part of Awesome PG (separate branding, auth, DB, UI, PWA)
- Not multi-tenant
- Not public-facing
- Not employee software
- Not a customer portal
- Not registration-enabled

---

## Documentation Index

Read in this order before writing any code:

| # | Document | Purpose |
|---|----------|---------|
| 1 | [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, module boundaries, host routing, tech stack |
| 2 | [DATABASE.md](./DATABASE.md) | Full schema, enums, indexes, ledger rules, future asset types |
| 3 | [ROUTES.md](./ROUTES.md) | URL map, layouts, Server Actions, API surface |
| 4 | [SECURITY.md](./SECURITY.md) | Auth, sessions, CSRF, rate limits, audit |
| 5 | [UI_SYSTEM.md](./UI_SYSTEM.md) | Design tokens, components, motion, glassmorphism |
| 6 | [FEATURES.md](./FEATURES.md) | Feature specifications with acceptance criteria |
| 7 | [WORKFLOWS.md](./WORKFLOWS.md) | End-to-end business flows and state machines |
| 8 | [TASKS.md](./TASKS.md) | Granular implementation checklist |
| 9 | [ROADMAP.md](./ROADMAP.md) | Phased delivery plan |
| 10 | [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs) |
| 11 | [RISKS.md](./RISKS.md) | Risk register and mitigations |
| 12 | [CHANGELOG.md](./CHANGELOG.md) | Documentation and product change history |

---

## Relationship to Awesome PG

```
awesomepg.in          → Awesome PG (untouched)
www.awesomepg.in      → Awesome PG (untouched)
invest.awesomepg.in   → Automotive Capital (new)
```

**Shared (framework layer only):**

- Next.js 16 App Router build system
- Tailwind CSS v4 wiring
- Generic utilities (money formatting, monitoring headers, blob storage patterns)
- CI/CD pipeline shape

**Never shared:**

- Database (`DATABASE_URL` vs `INVEST_DATABASE_URL`)
- Auth cookies, sessions, users
- UI theme, branding, layouts
- Business logic, services, schema
- PWA manifest, icons, service worker

---

## Code Layout (Planned)

```
docs/automotive-capital/          ← You are here (planning only)
src/capital/                      ← All Automotive Capital domain code
  db/schema/                      ← Independent Drizzle schema
  db/migrations/                  ← Independent migrations
  lib/                            ← Auth, money, validation, export
  services/                       ← Business logic SSOT
  actions/                        ← Server Actions (thin)
  components/                     ← UI (design system + features)
app/(capital)/                    ← Routes served on invest host
capital/drizzle.config.ts         ← Separate Drizzle Kit config
middleware.ts                     ← Extended with host routing (PG logic preserved)
```

---

## Environment Variables (Invest)

```bash
INVEST_DATABASE_URL=postgresql://...
INVEST_AUTH_SECRET=...
INVEST_ADMIN_EMAIL=...           # Seed only
INVEST_ADMIN_PASSWORD=...        # Seed only — never used at runtime after hash
INVEST_BLOB_READ_WRITE_TOKEN=... # Optional separate blob store
NEXT_PUBLIC_CAPITAL_URL=https://invest.awesomepg.in
```

---

## Success Criteria

- [ ] Zero regression to Awesome PG on `www.awesomepg.in`
- [ ] `invest.awesomepg.in` feels like a standalone commercial product
- [ ] Every financial event posts to the ledger
- [ ] Corrections use reversals, never deletes
- [ ] Dashboard answers all portfolio questions in <2s
- [ ] PWA installable on mobile with offline shell
- [ ] Schema supports future asset classes without redesign
- [ ] Capable of managing ₹10 crore+ with audit-grade history

---

## Next Step

Complete planning review → approve → begin [Phase 1 in ROADMAP.md](./ROADMAP.md).
