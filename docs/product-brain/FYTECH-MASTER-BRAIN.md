# FYTECH — Master Brain (index)

> **Purpose:** Ecosystem-level map. Product-specific intelligence lives in dedicated brains — not duplicated here.  
> Constitution: [`docs/ECOSYSTEM_V2.md`](../ECOSYSTEM_V2.md) · Inventory: [`docs/ECOSYSTEM_V2_INVENTORY.md`](../ECOSYSTEM_V2_INVENTORY.md)

---

## Product tree

```text
For Your Technologies (company — FYTECH ecosystem / monorepo label)
└── Salon Software (product — Hair Neon + Workforce co-located)
    ├── Platform Administration (operator — `/platform/admin/*`, Platform DB)
    └── Organizations / salons (tenant isolation target)
        ├── FYHAIR — Reference Salon / Current Implementation
        └── Future tenants (e.g. Salon B, Salon C, 100+)
├── Awesome PG Engine (PG Neon) — separate product line in monorepo
├── Automotive Capital Engine (Capital Neon)
└── Owner / Finance / Customer Brains — **Gap** (see inventory)
```

**Terminology:** [`TERMINOLOGY.md`](./TERMINOLOGY.md)

---

## Detailed product brains

| Product | Brain document | Scope |
|---------|----------------|--------|
| **Salon Software** (product brain) | [`FYHAIR-SALON-BRAIN.md`](./FYHAIR-SALON-BRAIN.md) | Product architecture; FYHAIR org is reference tenant — customers, appointments, billing, workforce, inventory, loyalty, reports, configuration |
| Salon Software System Map (internal UI) | `/system-map` on Hair host | Interactive architecture — not public marketing |
| Salon Software — Platform Admin | [`../foryourhair/PHASE_0A_SAAS_AUDIT.md`](../foryourhair/PHASE_0A_SAAS_AUDIT.md), [`../SAAS_READINESS.md`](../SAAS_READINESS.md) | Org provisioning, plans, Stripe, onboarding — **not** day-to-day salon ops |
| Awesome PG | [`../ROOM_OS.md`](../ROOM_OS.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | PG residency, billing, Room OS |
| Automotive Capital | [`../automotive-capital/ARCHITECTURE.md`](../automotive-capital/ARCHITECTURE.md) | Vehicles, deals, ledger |

**Rule:** Salon operational workflows, billing SSOT, inventory, and tenant RBAC are authoritative in **FYHAIR-SALON-BRAIN** — not in this file.

---

## Vault / dev intelligence (not product brains)

| Path | Role |
|------|------|
| `docs/MEMORY/*` | IDE activity vault |
| `docs/scripts/brain-*.sh` | Doc sync automation |

Do not confuse with runtime Salon Brain or Ecosystem v2 Brains.
