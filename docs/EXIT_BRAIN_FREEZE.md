# Exit Brain freeze (architecture complete)

**Effective:** 2026-08-06  
**Status:** Exit Brain is **frozen** as the move-out lifecycle SSOT for Awesome PG.

Full consistency audit (2026-08-06) confirmed no remaining behavior-controlling move-out checks bypass Exit Brain lifecycle or capability flags outside the frozen Vacating write pipeline and checkout settlement boundary.

## Frozen platform modules (separate SSOTs)

| Module | Role | Frozen scope |
|--------|------|--------------|
| **Exit Brain** (`src/lib/exit/`) | Read SSOT: lifecycle state machine, capability flags, timeline, checklist, refund estimate, room exit queue | This document |
| **Vacating Engine** (`src/services/vacating.ts`, `vacatingDateChange.ts`, vacating write hooks) | Write SSOT: notice submit, approve, reject, cancel, checkout handoff | Vacating write pipeline — do not add lifecycle intelligence here |
| **CheckoutSettlementEngineV2** (`src/lib/checkout/checkoutSettlementEngineV2.ts`) | Settlement math SSOT | [[SETTLEMENT_ENGINE_FREEZE]] |

Exit Brain **reads** checkout settlement outputs. It does **not** compute settlement formulas.

## Do not extend Exit Brain with

- Housekeeping tasks
- Cleaning workflows
- Maintenance tickets
- Room turnover / bed prep / inspection logic
- Post-checkout physical room state

Those belong in **Room Turnover Brain** (planned). Room Turnover Brain must **consume Exit Brain via public APIs** — never duplicate lifecycle state or capability rules.

## Public API (frozen contract)

Consumers must use these entry points from `@/src/lib/exit` or `src/lib/exit/`:

- `loadResidentExitBrainSnapshot(bookingId)` — full snapshot (timeline, checklist, refund estimate, lifecycle)
- `loadExitBrainLifecycleForBooking(bookingId)` — lightweight lifecycle + capabilities for guards
- `buildExitBrainLifecycle(...)` — pure lifecycle resolver (tests, bed map hints)
- `loadRoomExitQueueForRoom(roomId)` · `loadRoomExitQueuesForPg(pgId)` — leaving-soon queue
- `assertExitCapabilityAllowed` · `assertBookingExitOperationsAllowed` — service guards
- `isBookingInExitMode` — deprecated; prefer `loadExitBrainLifecycleForBooking().isExitMode`

UI and services gate move-out behavior on `lifecycle.state` and `lifecycle.capabilities` — not raw `vacating.status` strings.

## Allowed changes without reopening Exit Brain

- Presentation copy, layout, collapsible sections in Exit Brain UI components
- New **read** surfaces that consume existing public APIs (no parallel lifecycle logic)
- Docs, regression tests asserting existing lifecycle transitions
- Bug fixes that correct projection bugs **without** changing lifecycle states or capability matrix

## When Exit Brain changes ARE allowed

1. **Lifecycle invariant failure** — `tests/unit/exitBrainStateMachine.test.ts` or `exitBrainProjections.test.ts` fails
2. **Capability bypass discovered** — new move-out gate found using raw vacating status for behavior (regression test required)
3. **Explicit architecture amendment** — ADR + registry update + stability report

## Room Turnover Brain (successor for post-exit ops)

**Owner:** Awesome PG / Room OS (planned)  
**Owns (future):** Turnover checklist, cleaning, maintenance handoff, bed prep, inspection, room-ready signal  
**Reads:** Exit Brain public APIs (`loadResidentExitBrainSnapshot`, room exit queue) — never Exit Brain DB directly  
**Does not own:** Notice approval, settlement math, refund lifecycle, exit capability flags

Registry: [[ECOSYSTEM_V2_BRAIN_REGISTRY#Exit Brain]] · Vacating domain: [[Vacating]]
