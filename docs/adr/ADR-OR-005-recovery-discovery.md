# ADR-OR-005: Recovery Discovery

| Field | Value |
|-------|-------|
| **Status** | Accepted (OR-0 gate — architecture freeze) |
| **Date** | 2026-08-01 |
| **Owner module** | Operations Recovery (Discovery sub-module) |
| **Consumers** | Operations Centre UI, Payment Review UI (read-only banners) |
| **Cross-links** | ADR-OR-001 Integrity Preflight · [[OPERATIONS_RECOVERY]] |

---

## Purpose

Provide a **read-only recommendation layer** that surfaces Operations Recovery guidance to operators. Discovery **never** detects recovery situations independently, **never** creates sessions, **never** executes recovery, and **never** alters Payment Review approval behavior.

**OR-0 rule:** All recommendations derive **only** from Integrity Preflight `reasonCode` and findings.

---

## Scope

### In scope

- Map Integrity `reasonCode` / findings → allowed scenario suggestions (OR-0 catalog only).
- Human-readable rationale copied or composed from Integrity finding `description`.
- Links to start Recovery session (pre-filled inputs from `DiscoveryContext`).
- Operations Centre queue badges and Payment Review informational banners.

### Out of scope

- Independent pattern detection or SSOT reads for recovery logic.
- Auto-creating recovery sessions.
- Auto-triggering recovery on Approve click.
- Replacing Integrity Preflight (Discovery **must call** `runPreflight` or consume cached `IntegrityPreflightReport`).
- `SUPERSEDE_DUPLICATE_INVOICE` recommendations in OR-0 (OR-4 gate only).
- Resident-facing notifications.
- ML / predictive models in v1.

---

## Ownership

| Artifact | Owner |
|----------|-------|
| Duplicate / invariant detection | **Integrity Engine** (ADR-OR-001) |
| `reasonCode` → scenario mapping | **Recovery Discovery** (display mapping only — no detection) |
| Session creation | Operator via Recovery UI only |
| Payment Review approve logic | **Payment module** (unchanged) |

---

## Responsibilities

1. Expose `discover(context): RecoveryRecommendationReport`.
2. Call `IntegrityEngine.runPreflight(scope)` (or use cached report with same `scopeDigest`).
3. Map each Integrity finding `reasonCode` to zero or one OR-0 scenario suggestions via **Reason code mapping table** (§ below).
4. Rate-limit and cache per `(surface, entityId, integrity report digest)` — TTL 60s.
5. Label output **recommendation only** — not authorization to execute.
6. Respect rule precedence: Integrity Block > Recovery Execute Gate > Discovery Recommendation (see [[OPERATIONS_RECOVERY#Rule precedence (normative)]]).

---

## Explicit non-responsibilities

- Running recovery plan or execute phases.
- Modifying database state.
- Reading booking, vacating, balances, or billing state **except via Integrity preflight report**.
- Changing expected payment amounts in Payment Review.
- Bypassing Integrity `blocked` flag.
- Defining recovery detection heuristics (e.g. `deposit_outstanding_zero AND booking_completed`).

---

## Rule precedence

```
Integrity Block  >  Recovery Execute Gate  >  Discovery Recommendation  >  Work Queue Ordering
```

Discovery output is **subordinate** to Integrity. If `blocked: true`, recommendations include `blockingIssues` and are informational only.

---

## Public interface / contract

**Service:** `RecoveryDiscoveryService`  
**Method:** `discover(context): RecoveryRecommendationReport`  
**API (future):** `POST /operations-recovery/v1/discover`  
**Version:** `X-Recovery-Discovery-Version: 1`

### `DiscoveryContext`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pgId` | uuid | yes | |
| `surface` | enum | yes | `operations_centre` \| `payment_review` \| `admin_booking_detail` |
| `bookingId` | uuid | conditional | Required for booking-scoped preflight |
| `customerId` | uuid | conditional | |
| `paymentReview` | object | no | `{ kind, entityId }` when surface = payment_review |
| `roomId` | uuid | no | |
| `billingMonth` | date | no | |
| `scenarioHint` | enum | no | Passed to Integrity `runPreflight` scope only — not independent detection |

### `RecoveryRecommendationReport`

| Field | Type | Description |
|-------|------|-------------|
| `reportId` | uuid | |
| `computedAt` | timestamp | |
| `integrityReportId` | uuid | Source Integrity report |
| `rulePackDigest` | string | From Integrity report |
| `recommendations` | `RecoveryRecommendation[]` | Ordered by priority desc |
| `integrityBlocked` | boolean | Echo Integrity `blocked` |

### `RecoveryRecommendation`

| Field | Type | Description |
|-------|------|-------------|
| `recommendationId` | uuid | Stable for UI key |
| `sourceReasonCode` | string | **Required** — Integrity `reasonCode` that produced this row |
| `priority` | enum | `high` \| `medium` \| `low` — derived from Integrity severity |
| `confidence` | number | Fixed `1.0` when mapped from Integrity finding in OR-0 (heuristic scoring deferred OR-2) |
| `suggestedScenarios` | enum[] | Subset of **OR-0 plan catalog** only |
| `prefilledSessionInput` | object | From `DiscoveryContext` + finding `context` |
| `title` | string | Operator-facing |
| `rationale` | string | From Integrity finding `description` |
| `blockingIssues` | string[] | Populated when Integrity `blocked` or severity `block` |
| `action` | object | `{ type: 'open_recovery_ui', path: '/admin/operations/recovery/new?...' }` |

**Removed in OR-0 freeze:** `patternCode` independent detection table; heuristic pattern catalog.

---

## Reason code mapping (OR-0 normative)

Discovery **only** emits recommendations when Integrity returns a finding with a mapped `reasonCode`.

| Integrity `reasonCode` | Integrity severity | Suggested scenario(s) | OR-0 | Notes |
|--------------------------|-------------------|----------------------|------|-------|
| `DUP_ELEC_INVOICE_ACTIVE` | block | `REGENERATE_ELECTRICITY` | ✓ | SUPERSEDE mapping **OR-4 only** — not emitted in OR-0 |
| `DUP_RENT_INVOICE_ACTIVE` | block | — | ✓ | Informational; no OR-0 execute scenario — operator manual review |
| `DUP_PRIMARY_RESERVATION` | block | `REPAIR_OCCUPANCY` | ✓ | |
| `DUP_RESIDENCY_OPEN` | warn | `REACTIVATE_BOOKING`, `RENT_ONLY_ONBOARDING` | ✓ | Informational if warn-only |
| `DUP_CHECKOUT_SETTLEMENT_OPEN` | warn | `ROLLBACK_VACATING` | ✓ | Informational; settlement rollback out of scope v1 |
| `INV_DEPOSIT_NOT_FULLY_HELD` | block | — | ✓ | **No recommendation** — blocks S3; display blocker only |
| `INV_ELEC_PAID_REGEN_RISK` | block | — | ✓ | **No recommendation** — blocks S4 |
| `INV_BOOKING_PG_MISMATCH` | block | — | ✓ | No recommendation |
| `INV_BED_DOUBLE_OCCUPIED` | block | `ROOM_TRANSFER`, `REPAIR_OCCUPANCY` | ✓ | |

**OR-4 only (not in OR-0 Discovery output):**

| Integrity `reasonCode` | Suggested scenario | Gate |
|--------------------------|-------------------|------|
| `DUP_ELEC_INVOICE_ACTIVE` | `SUPERSEDE_DUPLICATE_INVOICE` | OR-4 after Billing supersede ADR |

**Deferred until Integrity adds reason codes:** vacating-mistake heuristics, rent-proof-with-deposit-held heuristics, missing-occupant-without-invoice heuristics. Discovery must **not** implement these as independent patterns in OR-0.

---

## State transitions

Discovery is **stateless**.

```
UI load → discover(context)
       → IntegrityEngine.runPreflight(scope)
       → map reasonCode → recommendations
       → render (display only)
```

**Forbidden:**

```
Payment Review Approve → discover → execute   ❌ NEVER
Discovery → independent SSOT scan → recommendation   ❌ NEVER (OR-0)
```

---

## Error handling

| Condition | Result |
|-----------|--------|
| Insufficient context for preflight | Empty recommendations array |
| Integrity unavailable | `blockingIssues: ['Integrity preflight unavailable']`; empty recommendations |
| PG access denied | `403` |
| Unknown surface | `400` |
| Unmapped `reasonCode` | Omit recommendation; log metric only |

Discovery failures **never** block Payment Review or Operations Centre core functions.

---

## Idempotency rules

- `discover` is read-only and idempotent relative to Integrity report + DB state.
- Cache key: `(surface, entityId, integrity.scopeDigest)` — TTL 60s.
- Session create / plan must re-run Integrity — must not trust Discovery cache alone.

---

## Concurrency rules

- No locks.
- Stale cache acceptable for display badges only.

---

## Versioning strategy

| Item | Strategy |
|------|----------|
| Reason code mapping table | Append-only rows; new codes require Integrity ADR update first |
| Removed mappings | Deprecate; keep recognized in old reports |
| `confidence` | Fixed 1.0 for Integrity-mapped rows in OR-0 |

---

## Event emission

| Event | When |
|-------|------|
| `recovery.discovery.impression` | Optional metrics — surface, sourceReasonCode, count |
| No outbox events | Discovery is read-only |

---

## Interaction with Property OS, Room OS, Operations Recovery

| System | Interaction |
|--------|-------------|
| **Operations Centre** | Calls discover on queue item expand; shows badge when Integrity findings present. |
| **Payment Review** | Optional banner from Integrity-derived recommendation; **Approve unchanged**. |
| **Operations Recovery** | Session create UI may call discover to pre-fill; operator confirms; plan re-runs Integrity. |
| **Integrity Preflight** | **Mandatory source** — Discovery calls `runPreflight` every time (or cached digest). |
| **Property OS / Room OS** | No direct interaction in v1. |

---

## Sequence diagram

```mermaid
sequenceDiagram
  participant OC as Operations Centre UI
  participant PR as Payment Review UI
  participant Disc as Recovery Discovery
  participant IE as Integrity Engine
  participant RUI as Recovery UI

  OC->>Disc: discover({ surface, bookingId, pgId })
  Disc->>IE: runPreflight(scope)
  IE-->>Disc: IntegrityPreflightReport
  Disc->>Disc: map reasonCode → scenarios (OR-0 table)
  Disc-->>OC: RecoveryRecommendationReport

  PR->>Disc: discover({ surface: payment_review, ... })
  Disc->>IE: runPreflight(scope)
  IE-->>Disc: report
  Disc-->>PR: recommendation (display only)
  Note over PR: Approve uses normal Payment path

  OC->>RUI: operator clicks Start Recovery
  RUI->>RUI: create session; plan runs Integrity again
```

---

## UI requirements (normative)

| Surface | Allowed UI | Forbidden |
|---------|------------|-----------|
| Operations Centre | Badge, tooltip, link to Recovery UI | Auto-open execute |
| Payment Review | Collapsed info panel, link | Change Expected amount; hijack Approve |
| Booking detail | Sidebar card | One-click fix |

Copy must include: **"Suggestion only — start Operations Recovery to plan and approve changes."**

---

## Future evolution

- **OR-2:** Heuristic `confidence` scoring (optional; still Integrity-sourced).
- **OR-4:** Add `SUPERSEDE_DUPLICATE_INVOICE` row to reason code mapping when Billing ADR published.
- **Integrity v1.1:** New reason codes (vacating mistake, rent-proof deposit held) → append mapping rows only.

---

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Independent pattern detection | **Removed for OR-0.** Discovery is Integrity-derived only. |
| `patternCode` catalog | **Removed.** Use `sourceReasonCode` instead. |
| Payment Review expected amount | Link to Recovery plan only — no corrected amount in Discovery (unchanged). |

---

**Decision:** Recovery Discovery is read-only, Integrity-derived, and never auto-triggers recovery. No independent recovery detection logic in OR-0.
