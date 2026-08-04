# APG Ecosystem v2 — Brain Architecture Constitution

> **Permanent architectural law.** Before implementing any feature, verify it follows this document.  
> If a design violates this constitution, **stop and redesign** before writing code.  
> ADR: [[ADR-ECO-001-brain-engine-constitution]] · Registry: [[ECOSYSTEM_V2_BRAIN_REGISTRY]] · Inventory: [[ECOSYSTEM_V2_INVENTORY]] · Events: [[ECOSYSTEM_V2_EVENTS]]

Cross-links: [[ARCHITECTURE]] · [[ROOM_OS]] · [[STABILITY_PHASE]] · [[DECISIONS]]

---

## Mission

We are **not** building separate PG / Salon / Automotive products.

We are building **one ecosystem**.

| Concept | Role |
|---------|------|
| **Engine** | Executes work (actions, writes, workflows) |
| **Brain** | Owns intelligence (knowledge, projections, explain, forecasts) |
| **Owner Brain** | Understands all businesses; owns none |
| **Owner Dashboard** | Presentation of Owner Brain — life command center, not a product UI |

This architecture is permanent. Every future product must integrate into it.

---

## The Golden Rule

Before writing any code always ask:

**Is this an Engine?** or **Is this a Brain?**

| If it… | Then it is… |
|--------|-------------|
| Performs actions / mutations / workflows | **Engine** |
| Understands knowledge / projections / explain / forecasts | **Brain** |

**Never mix the two.**

---

## Shared-knowledge rule (mandatory)

**Never hardcode knowledge inside an Engine if that knowledge could later benefit another Engine.**

Move such logic into the appropriate Brain.

| Bad | Good |
|-----|------|
| PG Engine and Salon Engine each compute customer lifetime value | **Customer Brain** owns LTV; both Engines consume its API / events |
| Each Engine invents its own “net worth contribution” | **Finance Brain** owns ecosystem finance; Engines emit money events only |
| Salon duplicates identity fields already modeled for residents | **Customer Brain** owns universal identity |

This keeps the ecosystem modular as new businesses are added.

**Test:** *“If we added a fourth Engine tomorrow, would we copy-paste this formula?”* → If yes, it belongs in a Brain now.

---

## Current Engines

### 1. Awesome PG Engine

Bookings · Rent · Electricity · Deposits · Vacating · Extensions · Operations · Billing · Collections · Notifications · Room OS (engine-local strangler / projections)

### 2. FYH Salon Engine

Appointments · Quick Sale · Billing · Inventory · Memberships · Packages · Commission · CRM · Customers · Staff

### 3. Automotive Capital Engine

Vehicle inventory · Purchase · Repairs · Expenses · Sales · Investment · ROI · Documents

### Future Engines

Personal Finance · Household · Loans · Insurance · Real Estate · Stocks · Crypto · Payroll · Manufacturing · Tax

**Write isolation (current):** Engines keep separate databases and auth cookies. Cross-engine intelligence flows through **domain events** and Brain APIs — not shared write tables (see [[ECOSYSTEM_V2_EVENTS]]).

---

## Brains

Every Brain owns **one** domain. No duplicated intelligence. Brains **never query each other directly** — they communicate via domain events (and expose public read APIs for Engines / dashboards to consume).

### Owner Brain

The CEO. Owns **no** business. Understands **all** businesses.

Answers: How much richer am I today? Net worth? Where am I losing money? What deserves attention? What is growing fastest? What happens in 90 days?

### Finance Brain

Universal financial intelligence. Consumes events from every Engine.

Owns: Income · Expenses · Profit · Loss · Cashflow · Margins · Assets · Liabilities · Net Worth · Taxes · Loans · ROI · Forecasts · Recurring Revenue · Business Contribution · Investment Performance · Financial Health

**No Engine may calculate ecosystem-wide finance independently.**

Engine-local money SSOTs (e.g. PG `residentFinancialEngine`, Capital TVI) remain valid **inside** that Engine until migrated behind Finance Brain projections — they are **not** the Finance Brain.

### Property Brain

One property: occupancy · revenue · expenses · electricity · maintenance · bookings · forecast · ROI · health

### Room Brain

One room: residents · revenue · electricity · deposits · maintenance · timeline · cleaning · profitability · predicted vacancy

### Bed Brain

One bed: availability · current resident · future booking · notice · revenue · cleaning · utilisation

*(Live today inside Room OS — PG-scoped.)*

### Resident Brain

One resident (PG stay context): payments · invoices · electricity · extensions · complaints · KYC · behaviour · communication · history · LTV · risk

### Customer Brain

**Universal identity.** One human across every business (resident · salon customer · vehicle buyer · future investor). Same identity spine. Cross-engine attributes (LTV, retention, risk) live here — not in each Engine.

### Salon Brain

Salon intelligence: retention · commission · stylist performance · revenue · inventory · membership health · appointment trends

### Vehicle Brain

Vehicle intelligence: purchase · repair · holding cost · expected profit · ROI · timeline · investment

### Investment Brain

Every investment: property · cars · stocks · crypto · funds · gold · businesses · returns · diversification · risk

### Electricity Brain

Meter continuity · predictions · usage · abnormality · shared bills · forecasts

### Operations Brain

Pending approvals · refunds · move-outs · extensions · collections · KYC · tasks · SLA · escalations

### Health Brain

Production Guardian: login · signup · uploads · booking · payments · electricity · notifications · performance · database · storage · APIs · desktop · mobile · regression · deployment health. Creates incidents automatically.

### Personal Finance Brain

Owner’s financial intelligence across every Engine: income sources · expenses · assets · liabilities · net worth · emergency fund · liquidity · financial freedom. Updates automatically from Finance Brain + Investment Brain events.

---

## Communication

```
Rent Paid (PG Engine)
  → Finance Brain
  → Property Brain / Resident Brain
  → Owner Brain
  → Owner Dashboard

Salon Invoice Paid
  → Finance Brain
  → Salon Brain / Customer Brain
  → Owner Brain

Vehicle Sold
  → Finance Brain
  → Investment Brain / Vehicle Brain
  → Owner Brain
```

Every event is auditable. Every calculation is explainable. Every dashboard value traces to a source.

---

## Owner Dashboard

**My life dashboard** — not PG Overview, not Salon, not Vehicles.

Shows: Net Worth · Today’s income/expenses/profit · Cash · Assets · Liabilities · Passive / recurring revenue · Business ranking · Profit by business · ROI · Debt · Investment growth · Cashflow · Emergency fund · Financial / Business / Software health · Projected wealth & cash · Tax estimate

Fed by **Owner Brain** (and Finance / Health Brains) — not by Engine-local KPI hacks.

---

## AI

Every Brain must eventually become conversational (e.g. “How much richer am I today?” → Owner Brain). Explainability and derivation refs are prerequisites (Room OS Wave 4 pattern).

---

## System Health

Health Brain continuously validates critical paths. Every deployment runs health verification. Regressions create: Operations notification · Health incident · Audit record · Regression report · Deployment score.

Stacks with [[STABILITY_PHASE]] — does not replace it.

---

## Rules (every Brain)

1. Owns one domain  
2. Has one source of truth  
3. Publishes events  
4. Exposes APIs  
5. Never duplicates logic  
6. Never embeds knowledge that another Engine will need (→ shared-knowledge rule)  
7. Has unit tests · health checks · performance metrics  
8. Has explainable calculations · complete audit history  

---

## Final goal

One question: **“How is my life doing?”**

The ecosystem answers instantly using every Brain together — businesses, assets, liabilities, investments, customers, residents, stylists, vehicles — continuous financial position, operational health, and projections.

---

## Relationship to existing systems

| Existing | Under Ecosystem v2 |
|----------|-------------------|
| Room OS / Property OS / Bed Brain | **Awesome PG Engine** intelligence layer (PG-scoped Brains) — not Owner Brain |
| `residentFinancialEngine` / Capital TVI | Engine-local money SSOT until Finance Brain consumes their events |
| PG Owner / Overview dashboard | Engine dashboard — not Owner Dashboard |
| Docs MEMORY / `brain-*.sh` | Dev vault intelligence — **not** product Brains |
| Host-isolated DBs (PG / Hair / Capital) | Engines’ write isolation — Brains converge via events |

See [[ECOSYSTEM_V2_INVENTORY]] for as-is code mapping and [[ECOSYSTEM_V2_BRAIN_REGISTRY]] for ownership / API / event contracts per Brain.
