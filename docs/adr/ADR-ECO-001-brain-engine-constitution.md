# ADR-ECO-001: Brain / Engine Constitution

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-08-04 |
| **Owner** | Ecosystem architecture |
| **Consumers** | Every Engine, Brain, dashboard, agent, and future product |
| **Cross-links** | [[ECOSYSTEM_V2]] · [[ECOSYSTEM_V2_BRAIN_REGISTRY]] · [[ECOSYSTEM_V2_INVENTORY]] · [[ECOSYSTEM_V2_EVENTS]] · [[ARCHITECTURE]] · [[ROOM_OS]] · [[STABILITY_PHASE]] |

---

## Purpose

Establish **APG Ecosystem v2** as the permanent architectural constitution: businesses are Engines; domains are Brains; the Owner Brain understands all businesses; Engines execute work.

---

## Decision

1. **Golden Rule** — Classify every change as Engine (actions) or Brain (knowledge). Never mix.
2. **Shared-knowledge rule** — Never hardcode knowledge inside an Engine if another Engine could benefit. Move it into the owning Brain (e.g. customer LTV → Customer Brain).
3. **Finance ownership** — No Engine may calculate ecosystem-wide finance; that belongs to Finance Brain.
4. **Communication** — Brains never query each other directly; they use domain events (+ public Brain read APIs).
5. **Write isolation** — Engines keep separate databases and auth until an event plane exists. Do not merge Neon DBs in the name of this ADR.
6. **Room OS** — Remains the Awesome PG Engine’s strangler/intelligence layer (PG-scoped Brains). It is not Owner Brain or Finance Brain.
7. **Owner Dashboard** — Presentation of Owner Brain (life command center), distinct from PG Overview / Salon / Capital dashboards.

Full text: [[ECOSYSTEM_V2]]. Ownership contracts: [[ECOSYSTEM_V2_BRAIN_REGISTRY]].

---

## Consequences

- Every feature design and PR must declare Engine vs Brain and owning domain.
- Agents must follow `.cursor/rules/ecosystem-brains.mdc` before implementing.
- Cross-engine formulas (identity, LTV, net worth, ecosystem cashflow) must not be duplicated per Engine.
- Existing engine-local money SSOTs stay valid **inside** their Engine until events feed Finance Brain — they must not be relabeled as Finance Brain.
- Stability Phase, settlement freezes, and Room OS forbidden-import rules still apply.

---

## Non-goals (this ADR day-one)

- Implementing Finance Brain / Owner Brain / Personal Finance Brain runtimes
- Shared Finance database
- Conversational AI for Brains
- Renaming `src/roomOs` → `src/brains`
- Redesigning PG Overview into the life Owner Dashboard
- Unifying auth cookies across hosts

---

## Follow-ons

1. Event plane v0 (PG `rent.paid` → Finance Brain stub projection)  
2. Owner Brain read API + Owner life Dashboard shell  
3. Customer Brain identity spine  
4. Health Brain unification of cert / deploy / regression incidents  

See [[ECOSYSTEM_V2_EVENTS]] and [[ECOSYSTEM_V2_INVENTORY]].
