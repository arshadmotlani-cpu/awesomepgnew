# Room Operating System (Room OS)

> Principal-reviewed architecture — strangler read/intelligence layer over existing PG ledgers.  
> Status: **Wave 6 complete** — Payment Proof Workflow Engine + Business Metrics rollup (final implementation wave).  
> Cross-links: [[ECOSYSTEM_V2]] · [[ARCHITECTURE]] · [[BILLING_ENGINE]] · [[Electricity]] · [[STABILITY_PHASE]]

**Ecosystem v2:** Room OS is intelligence inside the **Awesome PG Engine** — Property / Bed / Room / Electricity / Operations Brain projections (PG-scoped). It is **not** the Owner Brain or Finance Brain. Cross-engine knowledge (e.g. customer LTV) must not be invented here; that belongs in shared Brains ([[ECOSYSTEM_V2#Shared-knowledge rule (mandatory)]]).

---

## Purpose

Room OS is the **operating platform** for running a PG from one screen. It composes occupancy, electricity, billing projections, and work queues from existing ledger writers — without duplicating financial formulas or rewriting frozen settlement math.

**Goals (10-year):**

- One ask-only API for Operations Centre, portal bridges, and certification
- Explainable, replayable calculations (derivation refs — not cache-dependent)
- Append-only domain events; never mutate history
- Scale to 10,000+ beds via materialized property index

**Non-goals (Wave 0–2):**

- Replacing `rentInvoices`, `checkoutSettlementEngineV2`, or ledger writers
- Full event sourcing of all writes on day one
- Workflow / Business Metrics / Replay engines (Replay conditional; Workflow + Metrics complete in Wave 6)

---

## Platform hierarchy

```
PropertyOS (pgId)
  ├── PropertyIndexSnapshot     hot read model (KPI + room index + queue + elec progress)
  ├── KpiStrip                  only KPI layer on Operations Centre
  └── WorkQueueSnapshot         materialized — not live-composed per request
RoomOS (roomId)                 shared room intelligence only
  └── BedBrain (bedId)          occupancy + BookingContext value object
BookingContext (bookingId)      money/residency contract slice — NOT a fourth aggregate root
```

**Floor** is an optional rule scope node (`floorId`), not a separate aggregate.

---

## Projection dependency chain (Wave 2)

Materialized projectors form a strict one-way chain — WorkQueueProjector never reads engine outputs:

```
Legacy SSOT
    ↓
Engines (Occupancy, Electricity, LedgerProjection)
    ↓
PropertyProjector
    ↓
property_os_index  (PropertyOsIndexSnapshot)
    ↓
WorkQueueProjector
    ↓
work_queue_index  (WorkQueueSnapshot)
    ↓
business_metrics_index  (BusinessMetricsSnapshot)
    ↓
Decision / Metrics APIs
```

- **PropertyProjector** is the only module that orchestrates engines and embeds `workQueueProjection` into `PropertyOsIndexSnapshot`.
- **WorkQueueProjector** reads `PropertyOsIndexSnapshot` only — from `property_os_index` on rebuild, never `BedBrainSnapshot`, `RoomOsSharedSnapshot`, or `BookingLedgerSnapshot`.
- Live fallback (pre-Certification): Decision API may compose via `projectPropertyOsBundle`, but WorkQueue items are still derived from the assembled property index, not engines directly.

---

## Truth ladder

| Level | Source | Role |
|-------|--------|------|
| 1. Write truth | PostgreSQL ledger rows | Authoritative for persisted money |
| 2. Audit truth | Domain events (append-only) | Completeness increases over time |
| 3. Serve truth | Materialized projections | Property index, work queue, room shared state |
| 4. Display truth | Timeline entries | Human-readable; rebuild from events |

- **Replay** (deferred) proves (2)→(3) alignment when event coverage ≥90%
- **Certification** proves (3) vs portal/(1)
- Snapshots are **cache** — disposable, versioned per property

---

## Domain events vs timeline

**Layer A — domain events** (`room_os_outbox`, future `bed_events` / `room_events` streams)

- Append-only; compensating events only (`InvoiceCancelled`, `MeterReadingSuperseded`)
- Envelope: `eventId`, `streamType`, `streamId`, `eventType`, `occurredAt`, `recordedAt`, `rulesEffectivePackId`, `payload`, `sourceRef`
- **Command vs fact:** `property_index.rebuild_requested` triggers PropertyProjector; `property_index.materialized` is reserved as a future post-success fact (not emitted, not subscribed)

**Layer B — timeline entries**

- Derived UX copy; rebuild anytime from Layer A
- Not source of truth
- On-demand aggregation via `timeline/v1/getTimeline` — no materialized timeline table

---

## Runtime modules (Wave 1–2 cap: 8)

| Module | Absorbs | Wave |
|--------|---------|------|
| `Rules` | Rules Engine | 0–1 |
| `Occupancy` | Occupancy + Reservation stub | 1 |
| `Electricity` | Electricity Engine | 1 |
| `LedgerProjection` | Billing Read (booking-scoped) | 1–2 |
| `PropertyProjector` | Property OS index, KPI, elec progress, future summary | 1 |
| `RoomProjector` | Room OS shared | 1 |
| `BedProjector` | Bed Brain + BookingContext | 1 |
| `WorkQueueProjector` | Decision Engine (renamed) | 1 |
| `Integrity` | Integrity + Certification parity | 2 |
| `Explain` | Explainability via derivation refs | 4 |
| `Replay` | Replay Engine | 4 (conditional) |
| `Timeline` | Layer B display truth from outbox | 5 |
| `Workflow` | Payment proof orchestration (approve/reject delegates to Payment SSOT) | 6 |
| `BusinessMetrics` | Materialized rollup from property/work queue + financial bridge | 6 |

Deferred: move-out workflow, generic recovery orchestration.

---

## Rules hierarchy

**Default chain:** Global → Property → Room → Bed → Booking  
**Optional:** Floor override when `floorId` override rows exist

**Conflict resolution:** Most specific scope wins; each rule declares `overrideMode: replace | merge`.

**Performance:** Precompute **effective rule pack** per `(pgId, asOf)` at snapshot materialize time. Runtime uses frozen `rulesEffectivePackId` — not full chain walk per row.

Rule catalog v1 lives in code as bootstrap seed: [`src/roomOs/rules/catalog/v1/`](../src/roomOs/rules/catalog/v1/index.ts).

**Wave 5 — DB-published rules:** `room_os_published_rules` table (migration `0136`); publication pipeline under `src/roomOs/rules/store/`; effective pack merges DB rules with code catalog fallback; digest pinning via `content_digest` + pack id (ADR-OR-001).

---

## Versioned read APIs (external boundaries)

| API | Purpose |
|-----|---------|
| `property-os/v1/loadIndex` | KPI + room index + elec progress + queue summary hash |
| `decision/v1/getWorkQueue` | Paginated buckets from materialized snapshot |
| `decision/v1/getWorkQueuePage` | bucket + cursor |
| `room-os/v1/loadShared` | Room electricity + meter + billing mode |
| `room-os/v1/loadBed` | BedBrain + BookingContext |
| `room-os/v1/loadLedger` | Booking-scoped rent/deposit/electricity ledger projection |
| `rules/v1/effectivePack` | Debug/admin — DB-aware effective pack |
| `rules/v1/listPublished` | List published rule versions |
| `rules/v1/publish` | Publish new rule version (admin) |
| `rules/v1/activate` / `deactivate` | Rule activation window (admin) |
| `timeline/v1/getTimeline` | Layer B human-readable entries from outbox |
| `workflow/v1/getPaymentProofState` | Payment proof workflow instance + derived state |
| `workflow/v1/submitPaymentProofReview` | Transition to under_review (idempotent) |
| `workflow/v1/approvePaymentProof` | Approve via Payment SSOT + outbox fact |
| `workflow/v1/rejectPaymentProof` | Reject via Payment SSOT + outbox fact |
| `metrics/v1/loadPropertyRollup` | Property + financial metrics slice |
| `metrics/v1/loadRoomRollup` | Per-room rollup |
| `metrics/v1/loadBookingRollup` | Per-booking rollup |
| `metrics/v1/loadResidentRollup` | Customer-scoped rollup |
| `metrics/v1/loadPortfolioRollup` | Multi-PG admin aggregate |
| `certification/v1/run` | Release gate |
| `explain/v1/getExplanation` | Derivation narrative from materialized refs (Wave 4) |
| `replay/v1/runSample` | Conditional replay sample parity (Wave 4, ≥90% coverage) |

Implementation: [`src/roomOs/api/v1/`](../src/roomOs/api/v1/).

Internal engines are TypeScript modules — not HTTP microservices.

---

## Transactional outbox

All writes that affect Room OS projections **enqueue outbox rows in the same transaction** as ledger commits (target state). Wave 0 provides:

- `room_os_outbox` table
- `appendRoomOsOutboxEntry()` / `processRoomOsOutboxBatch()`
- Projector registry skeleton

Projectors consume outbox — not ad hoc emits scattered in services.

---

## Explainability (Wave 4)

Projectors record **derivation refs** at materialize time:

```typescript
{ stepId, engine, ruleId?, inputDigest, outputDigest }
```

Explain assembles narrative from refs — **not** full recompute on every hover.

---

## Forbidden dependencies

| Module | Must NOT import |
|--------|-----------------|
| Projectors | React, Next.js, payment writers, settlement V2 compute |
| Rules | DB except rule store |
| WorkQueueProjector | Engines, SSOT services, engine snapshot types; must read `PropertyOsIndexSnapshot` / `property_os_index` only |
| WorkQueueProjector | Live HTTP, approval mutators |
| Operations UI | `rentInvoices`, `occupancySsot`, `roomElectricityOccupants` directly |
| Ledger writers | Room OS projectors (writers enqueue outbox only) |
| Workflow | Projectors, settlement V2 compute, repair writers, React/Next |
| Workflow | **May** import Payment SSOT services (orchestration only) |
| Metrics | Payment writers, projectors, repair writers, React/Next |
| Metrics | **May** import materialized index loaders + `financialMetricsEngine` read bridge |

Enforced by [`tests/unit/roomOsArchitecture.test.ts`](../tests/unit/roomOsArchitecture.test.ts).

---

## Migration waves

| Wave | Deliver | Exit gate |
|------|---------|-----------|
| **0** | Outbox, event schema, Rules catalog v1, effective pack, projector framework | Outbox processes test events; unit tests green |
| **1** | Occupancy, Electricity, LedgerProjection, PropertyIndex + WorkQueue materialization, v1 read APIs | Parity vs legacy Shantinagar; index <500ms @500 rooms |
| **2** | Operations Centre on APIs; Integrity + Certification; feature-flag fallback | Manual ops checklist; cert 12/12 |
| **3** | RFE via Bed Brain; sunset legacy composers (4-week deadline) | Cert + forbidden-import lint |
| **4** | Derivation Explain; conditional Replay (≥90% event coverage) | Replay sample parity |
| **5** | DB-published Rules; Timeline Layer B | Rules DB parity + timeline determinism |
| **6** | Workflow (payment proof); metrics rollup | Workflow parity + metrics rollup parity |

**Wave 1 progress:** `src/roomOs/engines/occupancy/` — Bed Brain live-read (`loadBed`); `src/roomOs/engines/electricity/` — Room shared electricity live-read (`loadRoomShared`); `src/roomOs/engines/ledger/` — booking ledger live-read (`loadLedger`); `src/roomOs/projectors/property/` — PropertyProjector (`loadPropertyIndex`); `src/roomOs/projectors/workQueue/` — WorkQueueProjector (`getWorkQueue`).

**Wave 2 started:** `property_os_index` table (migration `0133`); PropertyProjector registered on outbox; `rebuildPropertyOsIndex` / `enqueuePropertyIndexRebuild`; `loadPropertyIndex` reads materialized row first. Command event: `property_index.rebuild_requested`. Reserved fact (not emitted): `property_index.materialized`.

**Wave 2 — Materialized Work Queue:** `work_queue_index` table (migration `0134`); WorkQueueProjector registered after PropertyProjector on outbox; `rebuildWorkQueueIndex` / `enqueueWorkQueueRebuild`; `getWorkQueue` reads `work_queue_index` first with live fallback. WorkQueueProjector consumes `PropertyOsIndexSnapshot` only (via `workQueueProjection` + `roomIndex` embedded by PropertyProjector). Command event: `work_queue.rebuilt`.

**Wave 2 — Ledger writers → outbox:** `src/roomOs/outbox/writerRebuild.ts`; canonical occupancy, electricity, rent, and deposit writers enqueue `property_index.rebuild_requested` inside the same DB transaction via `enqueuePropertyIndexRebuildFromWriter(tx, …)`.

**Wave 2 — Integrity Engine v1:** Read-only preflight under `src/roomOs/integrity/`; public API `integrity/v1/runPreflight` (`src/roomOs/api/v1/integrity.ts`). Contract: [[ADR-OR-001]] — duplicate and invariant checks scoped by `pgId` and OR-0 scenario (S1–S6); returns `IntegrityPreflightReport` with `blocked` aggregation. **No repair, no recovery orchestration, no outbox emission** (`integrity.flag_raised` reserved).

**Wave 2 — Certification Engine v1:** Read-only release gate under `src/roomOs/certification/`; public API `certification/v1/run` (`src/roomOs/api/v1/certification.ts`). Compares Room OS projections (materialized + live PropertyProjector / WorkQueueProjector, Occupancy Engine, LedgerProjection, Electricity Engine) against legacy SSOT services for Shantinagar (`shantinagar-v1` suite). Returns `CertificationReport` with per-check `pass` / `warning` / `fail` findings and aggregate status. Wraps `shantinagarPhase1PortalCertification.ts` for resident portal parity (12/12 gate). **No repair, no recovery, no outbox emission, no production writes.** Missing materialized rows emit `warning` (live fallback acceptable pre-cutover); materialized vs live drift emits `fail`. Shantinagar runner: `runShantinagarParity()` in `src/roomOs/certification/shantinagar/runShantinagarParity.ts`.

**Wave 2 — Operations Centre migration:** Feature flag `ROOM_OS_OPERATIONS_QUEUE` (`src/lib/operations/featureFlag.ts`, default **off**). When on, `loadUnifiedOperationsQueue` sources rent/electricity from Room OS read APIs (`getWorkQueue`, `loadPropertyIndex`, `loadLedger`, `loadBed`, `loadRoomShared`) via `src/lib/operations/roomOsOperationsQueueAdapter.ts`; KYC/refund supplementary rows via `supplementaryOperationsQueue.ts` without `residentOperationsDashboard` / `buildCollectionsQueue`. Legacy path unchanged when flag off. UI and queue shape (`UnifiedOperationsQueue`) preserved.

**Wave 3 — RFE via Bed Brain:** `loadBookingContext` (`room-os/v1`) resolves `bookingId` → primary bed → `buildBedBrainSnapshot` + `buildBookingLedgerSnapshot`; enriches `BookingContextSlice` pointers (`rentInvoicePointer`, `depositPointer`, `moveOutPointer`). `residentFinancialEngine.getBookingFinancialSummary` routes category totals through Bed Brain → LedgerProjection via `src/roomOs/bridges/rfeBedBrainBridge.ts`; line items remain RFE SSOT (`computeBookingFinancialSummaryCore`). Certification check `RFE_BED_BRAIN_BRIDGE` in shantinagar-v1 suite. `npm run cert:room-os-wave3`.

**Wave 3 — Legacy composer sunset:** `@deprecated` markers on `buildCollectionsQueue`, `billingCentreDashboard`, `loadResidentOperationsDashboard` (4-week cutover deadline). Billing Centre Room OS path: `ROOM_OS_BILLING_CENTRE=1` → `buildRoomOsCollectionsQueue` via `getWorkQueue` + `loadLedger`. Forbidden-import lint: Operations Centre UI must not import `rentInvoices`, `occupancySsot`, `roomElectricityOccupants` (`tests/unit/roomOsWave3ForbiddenImports.test.ts`).

**Wave 4 — Derivation Explain:** `src/roomOs/explain/` assembles narrative from `DerivationRef` records embedded at materialize time (`collectPropertyDerivationRefs` on PropertyProjector; `work_queue.project` on WorkQueueProjector). Public API `explain/v1/getExplanation` — read-only, no recompute on hover.

**Wave 4 — Conditional Replay:** `src/roomOs/replay/` measures outbox event coverage (`measureEventCoverage`); gates replay at `REPLAY_MIN_EVENT_COVERAGE` (90%) via `isReplayEligible`. Dry-run `projectPropertyOsBundle` compares KPI + work queue hash vs materialized rows — never upserts. Public API `replay/v1/runSample`. Certification check `REPLAY_SAMPLE_PARITY`; `npm run cert:room-os-wave4`.

**Wave 5 — DB-published Rules:** `room_os_published_rules` table (migration `0136`); `src/roomOs/rules/store/` loads, publishes, activates, and deactivates rule versions with audit metadata (`publishedBy`, `content_digest`, version chain). Effective pack resolves via `resolveEffectiveRulePack` — DB rules override code catalog per `factKey`; empty DB falls back to `RULES_CATALOG_V1`. Outbox enqueue paths pin `rulesEffectivePackId` at materialize time. Certification check `RULES_DB_PARITY`; `npm run cert:room-os-wave5`.

**Wave 5 — Timeline Layer B:** `src/roomOs/timeline/` rebuilds human-readable entries from `room_os_outbox` (Layer A) on demand — not materialized, not SSOT. Public API `timeline/v1/getTimeline`. Certification check `TIMELINE_LAYER_B`.

**Wave 6 — Payment Proof Workflow Engine:** `room_os_workflow_instances` table (migration `0137`); `src/roomOs/workflow/` state machine + orchestration store; approve/reject delegates to Payment SSOT (`paymentProofAllocationApproval`, `paymentProofRejectionService`); outbox facts `workflow.payment_proof.*`; public API `workflow/v1/*`. Ledger proof parity expanded to all proof kinds (qr, rent, elec, extension, deposit_link). Certification check `WORKFLOW_PAYMENT_PROOF_PARITY`; `npm run cert:room-os-wave6`.

**Wave 6 — Business Metrics Engine:** `business_metrics_index` table (migration `0138`); `src/roomOs/metrics/` pure aggregators from `property_os_index` + `work_queue_index` + outbox counts + `financialMetricsEngine` read bridge; chained rebuild after `rebuildWorkQueueIndex`; public API `metrics/v1/*`. Certification check `BUSINESS_METRICS_ROLLUP_PARITY`.

**Room OS is functionally complete through Wave 6** — remaining work is operational (migrations deploy, certification against staging/production, feature-flag cutover validation).

**Prerequisites before Wave 1 UI:**

1. This document approved
2. Operations Centre UX wireframes approved
3. Wave 0 outbox + projector skeleton complete

---

## Relationship to existing SSOT

| Existing | Room OS role |
|----------|--------------|
| `occupancySsot.ts` | Occupancy Engine implementation detail |
| `residentFinancialEngine.ts` | Bridges to LedgerProjection via Bed Brain (Wave 3) |
| `checkoutSettlementEngineV2` | **Frozen** — inputs from projections only |
| `billingCentreDashboard.ts` | Sunset in favor of `decision/v1/getWorkQueue` (Wave 2–3) |
| `shantinagarPhase1PortalCertification.ts` | Certification Engine wrapper (Wave 2) |

---

## Principal review corrections (incorporated)

1. **Truth ladder** — explicit four levels (fixes dual-truth ambiguity)
2. **BookingContext** — value object inside Bed Brain (fixes money-scoped under-modelling)
3. **WorkQueueProjector** — materialized projection, not god orchestrator on each HTTP request
4. **Transactional outbox** — mandatory before reliable Replay
5. **Derivation refs** — explain without full recompute at scale
6. **Single hot snapshot** — `property_os_index` includes KPI + queue + elec progress
7. **Engine consolidation** — max 8 runtime modules in Wave 1–2
8. **Replay deferred** until ≥90% event coverage gate

---

## Code layout

```
src/roomOs/
  types/           snapshots, events, derivation refs
  rules/           catalog v1, effective pack, evaluate, store (DB)
  timeline/        Layer B format + aggregate from outbox
  events/          event type catalog
  outbox/          append, process, schema
  projectors/      registry, property/workQueue projectors, runner
  engines/         occupancy, electricity, ledger live-read
  integrity/       read-only preflight (ADR-OR-001)
  certification/   read-only Shantinagar parity release gate
  bridges/         RFE ↔ Bed Brain ↔ LedgerProjection (Wave 3)
  explain/         Derivation Explain Engine (Wave 4)
  replay/          Conditional Replay Engine (Wave 4)
  workflow/        Payment proof orchestration (Wave 6)
  metrics/         Business metrics rollup (Wave 6)
  acceptance/      ops parity + materialization freshness audits (Wave 2)
  api/v1/          property-os, room-os, decision, rules, integrity, certification, explain, replay, timeline, workflow, metrics
```
