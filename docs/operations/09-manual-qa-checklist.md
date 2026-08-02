# Room OS Manual QA Checklist

Complete on **staging** before production flag cutover, and on **production** within 1 hour of each flag change.

## Prerequisites

- [ ] Logged in as super_admin (or pg-scoped admin for single-PG test)
- [ ] Know which flags are enabled (`ROOM_OS_OPERATIONS_QUEUE`, `ROOM_OS_BILLING_CENTRE`)
- [ ] At least one PG with active bookings and rent/electricity activity (Shantinagar recommended)

---

## Operations Centre (`ROOM_OS_OPERATIONS_QUEUE=1`)

### Shared tabs (parity-critical)

- [ ] **Rent due today** — items load; resident name, room, bed, PG correct
- [ ] **Overdue rent** — items load; overdue amounts match invoice/ledger expectations
- [ ] **Electricity** — incomplete rooms appear; room labels correct
- [ ] Item counts roughly match legacy path (or ops parity audit PASS)

### Item detail correctness

- [ ] Open a rent item — outstanding amount matches resident ledger
- [ ] Bed code and room number match resident's **primary** reservation (not extension bed)
- [ ] PG name matches booking's primary PG

### Unaffected tabs (still legacy path)

These tabs are **not** migrated to Room OS in Wave 2–3; verify they still work:

- [ ] Payment proof reviews
- [ ] KYC / refund supplementary items load
- [ ] Move-out / checkout items load

### Regression

- [ ] No JavaScript errors in browser console on Operations Centre
- [ ] Tab switching is responsive (< 3s load)
- [ ] Empty states display correctly when no items

---

## Billing Centre (`ROOM_OS_BILLING_CENTRE=1`)

- [ ] Collections queue loads
- [ ] Overdue / due today / due soon filters work
- [ ] Customer name, phone, room, bed, amount correct
- [ ] Invoice labels and billing month correct
- [ ] Sort order: overdue first, then by amount

### Regression with flag off

When `ROOM_OS_BILLING_CENTRE=0`:

- [ ] Collections queue still loads via legacy path
- [ ] No duplicate rows for same booking

---

## Payment proof (unchanged — Payment SSOT)

Workflow API is **not** wired to admin UI. Verify existing flow still works:

- [ ] Approve payment proof from admin — succeeds; ledger updated
- [ ] Reject payment proof — succeeds; resident notified if WhatsApp enabled
- [ ] No new errors in server logs referencing workflow transition

---

## Materialization status (optional spot-check)

If API access available (developer tools / internal scripts):

- [ ] Property index returns `ready` (not sustained `live_fallback`) after outbox drain
- [ ] Work queue returns `ready` for active billing month

---

## Rollback verification (after test on staging)

- [ ] Set flags to `0`; Operations Centre matches pre-flag behavior
- [ ] Billing Centre matches pre-flag behavior
- [ ] No orphaned or duplicate queue items

---

## Sign-off

| Role | Name | Date | Flags tested | Result |
|------|------|------|--------------|--------|
| QA | | | OPS / BILLING | PASS / FAIL |
| Engineering | | | | |
| Ops | | | | |

If FAIL: execute [05-rollback-procedure.md](./05-rollback-procedure.md) and file incident per [11-production-runbook.md](./11-production-runbook.md).
