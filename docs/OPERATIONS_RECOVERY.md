# Operations Recovery — Architecture (Frozen)

> **Status:** Architecture freeze — **OR-0** (documentation + read-only planner only).  
> **Module:** Operations Recovery under Property OS.  
> **Cross-links:** [[ARCHITECTURE]] · [[ROOM_OS]] · [[DECISIONS]] · ADR-OR-001 … ADR-OR-005

---

## Freeze scope

| Wave | Scope | Execute path |
|------|-------|--------------|
| **OR-0** | Session CRUD, analyzer pipeline (read-only), plan UI, Integrity integration, Discovery (display-only) | **No execute button.** Plan and approve UI may exist; **execute is disabled.** |
| **OR-1** | Phase A lifecycle primitives (`ROLLBACK_VACATING`, `REACTIVATE_BOOKING`, `REPAIR_OCCUPANCY`) | **Blocked** until OR-1 execute prerequisites satisfied (see § Architecture Freeze Checklist). |
| **OR-2+** | Phase B money, Phase C electricity, remaining scenarios | Gated per migration roadmap below. |

**OR-0 delivers:** documentation alignment, read-only planner, plan digest with snapshot fence — **not** mutations.

---

## Purpose

Generic operational recovery for PG lifecycle mistakes (vacating errors, rent-only onboarding, electricity regeneration, occupancy drift, room transfer). Recovery **orchestrates only** — it never owns billing, payment, electricity, residency, or duplicate rules.

---

## Execution model — phased saga

Single-transaction execute is **rejected**. Ordered phases with independent commit points:

```
Phase 0: PREFLIGHT (read-only)
Phase A: LIFECYCLE (txn — owner primitives)
Phase B: MONEY (Payment module txn)          — OR-2 gate
Phase C: ELECTRICITY (Billing module txn)    — OR-3 gate
Phase D: POST-COMMIT (outbox / invalidation) — OR-1+ execute only
Phase E: VALIDATE + CERTIFY (read-only)       — OR-1+ execute only
```

Partial failure after a committed phase → session `partial_failed`; **no automatic compensation in v1** (manual remediation session).

---

## Rule precedence (normative)

When Integrity, Recovery, Discovery, and Work Queue interact:

```
Integrity Block
     >
Recovery Execute Gate
     >
Discovery Recommendation
     >
Work Queue Ordering
```

| Layer | Behavior |
|-------|----------|
| **Integrity Block** | `blocked: true` → plan may render; **execute forbidden**. Discovery must not suggest bypass. |
| **Recovery Execute Gate** | Approved plan + Phase 0 preflight digest match + session status. |
| **Discovery Recommendation** | Display-only; derived **only** from Integrity `reasonCode` / findings (ADR-OR-005). Never overrides Integrity. |
| **Work Queue Ordering** | Room OS / Decision Engine bucket order; informational only for Recovery. |

---

## Analyzer snapshot fence (OR-0 normative)

All analyzers operate on the **same immutable `asOf` snapshot timestamp** captured once at plan start.

| Rule | Requirement |
|------|-------------|
| **Snapshot capture** | Plan pipeline records `asOf` (ISO timestamp) before any analyzer runs. |
| **Analyzer reads** | Each analyzer calls SSOT **reader services** only, passing `asOf` where supported. |
| **PlanAssembler** | **Must not** perform direct database reads. Merges analyzer outputs only. |
| **Plan digest** | SHA-256 over normalized payload including: `asOf`, `ssotReaderVersions`, `rulePackDigest`, analyzer outputs, scenario list. |

### `ssotReaderVersions`

Stable version strings for each reader invoked at plan time, e.g.:

- `bookingMoneyBalances@1`
- `occupancySsot@1`
- `integrityPreflight@1.0.0`

Stored on `plan_snapshot` at approve time.

### Integrity consumption

`IntegrityAnalyzer` calls `runPreflight(scope)` only. Recovery **never** implements duplicate or invariant rules (ADR-OR-001).

---

## v1 scenario allowlist

### OR-0 plan catalog (6 scenarios)

Available for **read-only planning** in OR-0:

| ID | Scenario | Phases (when execute enabled) |
|----|----------|-------------------------------|
| S1 | `ROLLBACK_VACATING` | A |
| S2 | `REACTIVATE_BOOKING` | A |
| S3 | `RENT_ONLY_ONBOARDING` | A + B (OR-2) |
| S4 | `REGENERATE_ELECTRICITY` | C (OR-3) |
| S5 | `REPAIR_OCCUPANCY` | A |
| S6 | `ROOM_TRANSFER` | A |

**Not in OR-0 plan catalog:**

| ID | Scenario | Gate |
|----|----------|------|
| S7 | `SUPERSEDE_DUPLICATE_INVOICE` | **OR-4 only** — requires Billing `supersedeDuplicateInvoice` ADR (deferred; see ADR-OR-003 v1.1). **Excluded from OR-0 planner scenario picker.** |

Composite plans: max **3 scenarios** from OR-0 catalog only; phases merge A → B → C when execute waves permit.

### Removed / deferred (unchanged)

`CUSTOM`, `BOOKING_RESURRECTION`, `SETTLEMENT_RECOVERY`, `DEPOSIT_ALREADY_HELD` (constraint only), checkout rollback — per prior architecture decisions.

---

## Ownership matrix (summary)

Recovery **plans, gates, invokes, audits** — never owns domain rules.

| Domain | Owner | Recovery |
|--------|-------|----------|
| Duplicate / invariant detection | **Integrity Engine** | Consume `runPreflight` only |
| Payment approval / allocation | **Payment** | Submit `PaymentApprovalIntent` (OR-2+) |
| Electricity regenerate | **Billing** | `regenerateRoomMonthUnpaid` (OR-3+) |
| Residency writes | **Residency SSOT** | `syncFromBooking` (OR-1+) |
| Vacating / booking / occupancy | **Vacating / Lifecycle / Occupancy** | Invoke primitives (OR-1+) |
| Session / plan / audit | **Operations Recovery** | Own |

Full matrix: unchanged from final architecture review.

---

## Module hierarchy

```
Property OS
└── Operations Recovery
    ├── session/
    ├── analyzer/          Scope, Lifecycle, Money, Electricity, Integrity
    ├── plan/              PlanAssembler (no DB reads)
    ├── risk/
    ├── orchestrator/      OR-1+ execute only
    ├── validation/        OR-1+ execute only
    ├── discovery/         Read-only; Integrity-derived (ADR-OR-005)
    └── audit/
```

External owners: Integrity, Billing, Payment, Vacating, Occupancy, Residency, Certification, Property OS / Room OS projectors.

---

## Primitive ownership — OR-0 vs later waves

### OR-0 (plan preview only)

| Primitive | Owner | OR-0 |
|-----------|-------|------|
| `integrity.runPreflight` | Integrity | ✓ read-only |
| Analyzer SSOT previews | Various readers | ✓ read-only |

### OR-1 execute (lifecycle)

| Primitive | Owner |
|-----------|-------|
| `vacating.withdraw` / `vacating.revertCompletion` | Vacating |
| `lifecycle.reactivateBooking` / `stay.restoreOpenEnded` | Booking lifecycle |
| `occupancy.reconcile` | Occupancy SSOT |
| `residency.syncFromBooking` | Residency SSOT |
| `billing.ensureProfile` | Billing profiles |
| `occupancy.transferPrimaryBed` | Occupancy |
| `orchestrator.acquireLocks` / `audit.appendRecoveryEvent` | Operations Recovery |

### OR-2+ (not OR-0)

| Primitive | Owner | Gate |
|-----------|-------|------|
| `payment.submitApprovalIntent` | Payment | OR-2 |
| `billing.regenerateRoomMonthUnpaid` | Billing | OR-3 |

### OR-4 only (not in OR-0 documentation)

| Primitive | Owner | Gate |
|-----------|-------|------|
| `billing.supersedeDuplicateInvoice` | Billing | **OR-4** — **removed from OR-0 primitive tables and planner.** |

---

## Scenario → phase mapping

| Scenario | A | B | C | OR-0 plan | Execute gate |
|----------|---|---|---|-----------|--------------|
| S1 `ROLLBACK_VACATING` | ✓ | — | — | ✓ | OR-1 |
| S2 `REACTIVATE_BOOKING` | ✓ | — | — | ✓ | OR-1 |
| S3 `RENT_ONLY_ONBOARDING` | ✓ | ✓ | — | ✓ | OR-2 |
| S4 `REGENERATE_ELECTRICITY` | — | — | ✓ | ✓ | OR-3 |
| S5 `REPAIR_OCCUPANCY` | ✓ | — | — | ✓ | OR-1 |
| S6 `ROOM_TRANSFER` | ✓ | — | — | ✓ | OR-1 |
| S7 `SUPERSEDE_DUPLICATE_INVOICE` | — | ✓ | opt | **✗ OR-0** | **OR-4** |

---

## Public API — OR-0 minimum

| Method | Path | OR-0 |
|--------|------|------|
| `POST` | `/operations-recovery/v1/sessions` | ✓ |
| `POST` | `/operations-recovery/v1/sessions/:id/plan` | ✓ |
| `GET` | `/operations-recovery/v1/sessions/:id` | ✓ |
| `POST` | `/operations-recovery/v1/sessions/:id/approve` | Optional UI; execute still disabled |
| `POST` | `/operations-recovery/v1/sessions/:id/execute` | **✗ disabled in OR-0** |
| `POST` | `/operations-recovery/v1/discover` | ✓ read-only (ADR-OR-005) |

---

## Integration rules

| System | OR-0 interaction |
|--------|------------------|
| **Integrity Engine** | Mandatory at plan via `IntegrityAnalyzer` |
| **Recovery Discovery** | Integrity-derived recommendations only |
| **Payment Review** | Read-only Discovery banner; never auto-triggers recovery |
| **Property OS / Room OS** | No execute-time outbox in OR-0 |
| **Certification** | Not run in OR-0 (no execute) |

---

## Migration roadmap

| Wave | Deliverable | Execute |
|------|-------------|---------|
| **OR-0** | Schema spec, session CRUD, analyzer pipeline, plan UI, Integrity + Discovery | **Plan-only** |
| **OR-1** | Phase A + S1, S2, S5, S6 | Lifecycle pilot |
| **OR-2** | Payment ApprovalIntent + S3 | Money pilot |
| **OR-3** | Billing regenerate + S4 | Electricity pilot |
| **OR-4** | S7 SUPERSEDE + Billing supersede ADR + outbox Phase D | Full catalog minus settlement |
| **OR-5+** | Projector consume, deferred scenarios | — |

---

## Architecture Freeze Checklist

### OR-0 gate (documentation + read-only planner)

- [x] S7 / `SUPERSEDE_DUPLICATE_INVOICE` excluded from OR-0; marked OR-4 only
- [x] `billing.supersedeDuplicateInvoice` removed from OR-0 primitive documentation
- [x] Integrity Engine canonical duplicate owner; legacy scanners documented (ADR-OR-001)
- [x] Rule precedence documented (§ Rule precedence)
- [x] Analyzer snapshot fence + plan digest fields documented (§ Analyzer snapshot fence)
- [x] Discovery Integrity-derived only (ADR-OR-005)
- [ ] Ownership matrix signed off by Billing, Payment, Vacating leads
- [ ] OR-0 plan-only pilot PG named
- [ ] Payment Review separation reviewed (no auto-trigger)

### OR-1 gate (execute path — remains blocked)

- [ ] Residency SSOT `syncFromBooking` contract + ADR-OR-004 ordering fixed
- [ ] Phase A sequential invocation model (not single outer txn)
- [ ] Event ownership registry; writer-side outbox mandate
- [ ] Session fence + multi-instance locking strategy
- [ ] Phase E certification profile matrix
- [ ] partial_failed remediation matrix + Payment Review hard block during active session
- [ ] Pilot limited to S1, S2, S5 until OR-2/OR-3 gates pass

### Dependency ADRs

- [x] ADR-OR-001 Integrity Preflight
- [x] ADR-OR-002 Payment ApprovalIntent (OR-2 gate)
- [x] ADR-OR-003 Billing Regenerate (OR-3 gate)
- [x] ADR-OR-004 Residency Sync (OR-1 gate)
- [x] ADR-OR-005 Recovery Discovery

---

## Related ADRs

- [ADR-OR-001](adr/ADR-OR-001-integrity-preflight.md) — Integrity Preflight
- [ADR-OR-002](adr/ADR-OR-002-payment-approval-intent.md) — Payment ApprovalIntent
- [ADR-OR-003](adr/ADR-OR-003-billing-regenerate-room-month.md) — Billing Regenerate
- [ADR-OR-004](adr/ADR-OR-004-residency-sync.md) — Residency Sync
- [ADR-OR-005](adr/ADR-OR-005-recovery-discovery.md) — Recovery Discovery
