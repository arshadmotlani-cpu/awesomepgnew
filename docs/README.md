# Awesome PG — Second Brain (Obsidian Vault)

> **Open this folder as an Obsidian vault** for graph view of the entire system.  
> **AI entry point:** [[START_HERE]] → [[AI_CONTEXT]] → [[HANDOVER]]

---

## Core documents (maintain with every code change)

| Note | Purpose |
|------|---------|
| [[START_HERE]] | **Single AI entry point** — read first |
| [[AI_CONTEXT]] | Rules, SSOT map, quick reference |
| [[HANDOVER]] | Paste-ready summary for any AI |
| [[CURRENT_STATE]] | Priorities, completed, bugs, debt |
| [[FEATURES]] | Full feature inventory |
| [[WORKFLOWS]] | Business process steps |
| [[DATABASE]] | Tables, relationships, constraints |
| [[ROUTES]] | All app routes by module |
| [[ARCHITECTURE]] | System design & data flow |
| [[DECISIONS]] | ADR log (never delete) |
| [[BUGS]] | Open / resolved / limitations |
| [[CHANGELOG]] | Append-only task history |

---

## Domain hubs (wiki links for graph)

### People
- [[Residents]]
- [[KYC]]
- [[Bookings]]

### Inventory
- [[Rooms]]
- [[Beds]]
- [[Bed Assignment]]

### Money
- [[Billing]]
- [[Deposits]]
- [[Electricity]]
- [[Invoices]]
- [[Payment Links]]

### Move-out
- [[Vacating]]
- [[Checkout Settlements]]

### Operations
- [[Operations]]
- [[Action Center]]
- [[Notifications]]

---

## Graph clusters (how notes connect)

```
AI_CONTEXT ──┬── ARCHITECTURE ── DATABASE
             ├── WORKFLOWS ── FEATURES
             ├── ROUTES
             ├── CURRENT_STATE ── BUGS ── CHANGELOG
             └── DECISIONS

Residents ── KYC ── Bed Assignment
Billing ── Electricity ── Invoices ── Deposits
Vacating ── Checkout Settlements ── Operations
```

---

## Legacy reference (deeper detail, update separately)

| Document | Scope |
|----------|-------|
| [[AWESOME_PG_MASTER_DOCUMENTATION_V2]] | Post-v1 product + technical (Action Center, security, deploy) |
| [[AWESOME_PG_MASTER_DOCUMENTATION]] | Master Guide v1 — Phase 1 baseline |
| `feature-inventory.md` | Phase 1 route audit (2026-06-19) |
| `risk-report.md` | Financial risk inventory |
| `redesign-roadmap.md` | Phase 2 UX roadmap |
| `phase2/` | P0/P1 module completion checklists |

---

## Pre-commit doc sync (automatic)

Staged code changes trigger deterministic updates to [[CHANGELOG]] and [[CURRENT_STATE]] via `.githooks/pre-commit`:

```bash
npm install          # runs prepare → installs hooks (core.hooksPath=.githooks)
npm run docs:check       # CI / dry-run (exit 1 if docs stale)
npm run docs:sync         # manual sync (same as pre-commit)
```

Mapping lives in `scripts/doc-sync-mapping.json` (path patterns → brain docs). No LLM — markers in CHANGELOG/CURRENT_STATE are updated from staged files only.

---

## Documentation rules

1. **Any code change** → update [[CHANGELOG]] + affected domain docs + [[CURRENT_STATE]] if priority shifts (pre-commit helps with 1)
2. **Architectural choice** → append [[DECISIONS]]
3. **Bug fix** → move entry in [[BUGS]]
4. **New route/feature** → [[ROUTES]] + [[FEATURES]]
5. **Schema migration** → [[DATABASE]]
6. Use `[[Wiki Links]]` so Obsidian graph stays connected

---

## Quick paths for common tasks

| I need to… | Open |
|------------|------|
| Onboard a new AI | [[START_HERE]] → [[HANDOVER]] |
| Fix vacating/refund | [[WORKFLOWS#Vacating]] · [[Vacating]] · [[BUGS]] |
| Fix billing | [[Billing]] · `residentFinancialEngine.ts` in [[ARCHITECTURE]] |
| Assign beds | [[Bed Assignment]] · [[ROUTES#/admin/pgs]] |
| Find a route | [[ROUTES]] |
| Understand a table | [[DATABASE]] |
| Know what's shipped | [[CHANGELOG]] · [[CURRENT_STATE]] |

---

## File list (second brain)

```
docs/
├── README.md              ← Obsidian vault index
├── START_HERE.md          ← AI entry point (read first)
├── AI_CONTEXT.md
├── HANDOVER.md
├── CURRENT_STATE.md
├── FEATURES.md
├── WORKFLOWS.md
├── DATABASE.md
├── ROUTES.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── BUGS.md
├── CHANGELOG.md
├── Residents.md … Operations.md  ← domain hubs
└── (Bed Assignment.md, etc.)
```

---

*Last vault sync: 2026-06-21*
