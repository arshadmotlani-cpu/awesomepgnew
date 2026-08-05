# Ecosystem v2 — As-is Inventory

> Maps **current code** onto Engines / Brains. No renames in this slice.  
> Constitution: [[ECOSYSTEM_V2]] · Registry: [[ECOSYSTEM_V2_BRAIN_REGISTRY]] · Events: [[ECOSYSTEM_V2_EVENTS]]

**Legend:** Live · Partial · Gap · Dev-only (not a product Brain)

---

## Engines

| Engine | Current home | Status |
|--------|--------------|--------|
| Awesome PG Engine | `src/services/*`, `src/lib/*`, `app/(admin)`, `app/(customer)`, PG Neon | Live |
| FYH Salon Engine | `src/hair/*`, `app/(hair)`, FYH DB | Live (host-isolated) |
| Automotive Capital Engine | `src/capital/*`, `app/(capital)`, Capital Neon | Live (host-isolated) |
| Workforce Engine | `src/workforce/*` (Phase 1 tables in FYH DB) | Partial |

Host routing: `middleware.ts` (Hair → Capital → PG).

---

## Brains (product intelligence)

| Brain | Current home (examples) | Status | Notes |
|-------|-------------------------|--------|-------|
| Employee Brain | `src/workforce/brains/employeeBrain.ts` | Partial | Workforce Phase 1 |
| Bed Brain | `src/roomOs/engines/occupancy/buildBedBrain.ts`, `room-os/v1/loadBed` | Live (PG) | Occupancy + BookingContext |
| Property Brain | `src/roomOs/projectors/property/`, `property-os/v1/*` | Partial (PG) | Property OS index — not ecosystem property ROI |
| Room Brain | Composed via property index / room electricity engines | Partial (PG) | No first-class Room Brain module yet |
| Electricity Brain | `src/roomOs/engines/electricity/`, `meterElectricity` / `electricityBilling` writers | Partial (PG) | Writers = Engine; projections = Brain path |
| Operations Brain | WorkQueue projector, Ops Centre adapters, `ROOM_OS_OPERATIONS_QUEUE` | Partial (PG) | Flag-gated; not cross-engine ops |
| Resident Brain | `residentFinancialEngine`, resident hub UI, KYC services | Partial (PG) | Engine-local money; not Customer Brain |
| Finance Brain | — | **Gap** | PG `financialMetricsEngine` / RFE / Capital TVI are **engine-local**, not Finance Brain |
| Owner Brain | — | **Gap** | PG Owner Dashboard / Overview ≠ Owner Brain |
| Customer Brain | — | **Gap** | Separate customer tables per Engine; LTV must not be duplicated |
| Salon Brain | FYH reports / Quick Sale ledgers (engine-local) | **Gap** as Brain | Intelligence still inside Salon Engine |
| Vehicle Brain | Capital vehicle services (engine-local) | **Gap** as Brain | Same |
| Investment Brain | — | **Gap** | Capital ROI is Engine-local |
| Personal Finance Brain | — | **Gap** | Future |
| Health Brain | Cert scripts, stability report, system health UI, Room OS integrity | Partial | Not unified Guardian Brain yet |

---

## Shared-knowledge debt (move to Brains)

| Knowledge | Today | Belongs in |
|-----------|-------|------------|
| Customer lifetime value / retention across businesses | Not unified; risk of per-Engine formulas | Customer Brain |
| Ecosystem net worth / cashflow / business contribution | PG overview + Capital KPIs + Salon revenue separate | Finance Brain → Owner Brain |
| Universal person identity | `customers` (PG) vs FYH customers vs Capital counterparties | Customer Brain |
| Cross-product “what needs my attention” | Per-product ops queues | Operations Brain + Owner Brain |
| Deployment / regression score | Scripts + Stability Phase | Health Brain |

**Rule reminder:** If a fourth Engine would copy-paste the formula, it is Brain knowledge — do not ship it inside an Engine.

---

## Not product Brains

| Thing | Path | Note |
|-------|------|------|
| Docs / MEMORY “second brain” | `docs/MEMORY/*`, `docs/scripts/brain-*.sh` | Dev vault only |
| Room OS outbox | `src/roomOs/outbox/` | PG Engine event mechanism; precedent for ecosystem events |

---

## Owner Dashboard vs Engine dashboards

| Surface | Path | Classification |
|---------|------|----------------|
| PG Overview / Owner trends | `src/services/ownerDashboard*.ts`, `/admin/overview` | **PG Engine** dashboard |
| Capital Dashboard | `app/(capital)/…` | **Capital Engine** dashboard |
| Salon reports | FYH app | **Salon Engine** dashboard |
| Life Owner Dashboard | — | **Gap** — Owner Brain presentation |

---

## Gaps to close (ordered follow-ons)

1. Event plane v0 — emit `rent.paid` (and peers) toward Finance Brain stub  
2. Finance Brain projection + explain  
3. Owner Brain read API + life Owner Dashboard shell  
4. Customer Brain identity + LTV API  
5. Health Brain unification  
6. Salon / Vehicle / Investment Brains extracted from Engine-local intelligence  

Until then: Engines may keep **engine-local** SSOTs; they must not claim to be ecosystem Brains, and must not hardcode cross-engine knowledge.
