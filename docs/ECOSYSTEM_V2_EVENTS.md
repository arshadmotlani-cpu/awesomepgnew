# Ecosystem v2 — Domain Events

> Spec only (no bus runtime in this slice). Constitution: [[ECOSYSTEM_V2]] · ADR: [[ADR-ECO-001-brain-engine-constitution]]

---

## Law

1. Brains **subscribe** to events; they do **not** import Engine writers.
2. Brains **never** query other Brains’ databases directly.
3. Engines **emit** events after durable writes (transactional outbox preferred — Room OS pattern).
4. Engines **never** import another Engine’s money formulas.
5. Knowledge that multiple Engines need lives in a Brain and is consumed via **Brain APIs** or **events** — not copy-pasted into Engines ([[ECOSYSTEM_V2#Shared-knowledge rule (mandatory)]]).

---

## Envelope

Every ecosystem event should carry:

| Field | Purpose |
|-------|---------|
| `eventId` | Stable UUID (idempotency) |
| `occurredAt` | Business time (ISO-8601) |
| `recordedAt` | Ingest time |
| `engineId` | `awesome_pg` \| `fyh_salon` \| `automotive_capital` \| … |
| `brainTargets` | Intended Brain ids (hint; subscribers own filtering) |
| `eventType` | Catalog name (below) |
| `payload` | Domain body (versioned) |
| `sourceRef` | Writer / service method (e.g. `rentInvoices.recordRentPaymentSuccess`) |
| `correlationId` | Optional chain id (approve → settle → notify) |
| `schemaVersion` | Payload version integer |

Room OS outbox rows (`room_os_outbox`) are the **PG Engine** precedent; ecosystem events may wrap or mirror that pattern per Engine without requiring a shared write DB.

---

## Stub catalog (names only)

### Awesome PG Engine

| eventType | Typical brainTargets |
|-----------|----------------------|
| `rent.paid` | finance, property, resident, owner |
| `rent.proof.submitted` | operations, resident |
| `rent.proof.approved` | finance, operations, resident |
| `deposit.collected` | finance, resident, property |
| `deposit.refunded` | finance, resident, owner |
| `electricity.bill.generated` | electricity, finance, room, resident |
| `booking.created` | bed, room, property, operations |
| `booking.vacated` | bed, room, resident, operations, finance |
| `extension.approved` | resident, operations, finance |

### FYH Salon Engine

| eventType | Typical brainTargets |
|-----------|----------------------|
| `salon.invoice.paid` | finance, salon, customer, owner |
| `salon.appointment.completed` | salon, customer |
| `salon.membership.renewed` | salon, customer, finance |
| `salon.commission.accrued` | salon, finance |

### Automotive Capital Engine

| eventType | Typical brainTargets |
|-----------|----------------------|
| `vehicle.purchased` | vehicle, investment, finance, owner |
| `vehicle.sold` | vehicle, investment, finance, owner |
| `vehicle.cost.recorded` | vehicle, finance |
| `vehicle.roi.updated` | vehicle, investment, owner |

### Cross-cutting (future)

| eventType | Typical brainTargets |
|-----------|----------------------|
| `customer.identity.linked` | customer |
| `customer.ltv.recalculated` | customer, owner |
| `health.incident.opened` | health, operations, owner |
| `deployment.score.recorded` | health |

---

## Example chains

```
Rent Paid
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

---

## Non-goals (this doc)

- Implementing a shared event bus or shared event database
- Migrating all writers to emit ecosystem events on day one
- TypeScript package under `src/ecosystem/` (deferred until first real consumer)
