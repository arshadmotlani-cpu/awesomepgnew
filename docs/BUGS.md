# Bugs & Known Limitations

> Open issues, resolved history, workarounds. Update when fixing or discovering bugs.  
> Cross-links: [[CURRENT_STATE]] · [[CHANGELOG]] · [[DECISIONS]]

---

## Open bugs

| ID | Severity | Summary | Workaround |
|----|----------|---------|------------|
| OPS-UX-01 | Medium | Duplicate vacating/deposit/refund actions across profile, bed map, overview | Use [[Operations]] + `/admin/vacating` + checkout settlements only ([[DECISIONS#Operations as action hub]]) |
| OPS-UX-02 | Low | Legacy routes (`/admin/requests`, `/admin/collections`) still linked in old bookmarks | Use canonical routes in [[ROUTES]] |
| RES-LIST-01 | Low | `listResidentsForAdmin` LIMIT 200 may omit older vacated residents in ops timeline | Open resident profile directly by ID |
| VAC-SAME-01 | Low | Same-day vacating approve shortens `[start,today)` excluding today — completion must not shorten before move-out day | See `vacatingCheckout.test.ts`; use complete flow same day |

*No critical production bugs open after `d4c01c6` deploy.*

---

## Resolved bugs

### VAC-CRASH-01 — `/admin/vacating` page crash

| | |
|---|---|
| **Severity** | Critical |
| **Symptom** | "Overview could not load" / digest error when opening `/admin/vacating`, Operations "Continue move-out", or after deposit cancel revalidation |
| **Root cause** | `MoveOutPipelineQueue` (client) received `MoveOutPipelineItem` with `Date` objects and `stageTimestamps` — not JSON-serializable |
| **Fix** | `d4c01c6` — `toClientMoveOutPipelineItem()` serializes dates to ISO strings |
| **See** | [[DECISIONS#Client Date serialization]] |

---

### BED-SSOT-01 — Bed map vs residents list mismatch

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | Bed map shows resident assigned; residents list / profile still shows "Assign bed" |
| **Root cause** | `occupancySsot.ts` filtered `duration_mode` differently than bed map lateral; missing `revalidateOccupancyViews()` after mutations |
| **Fix** | `88a16e8` — aligned SQL + revalidation on assign/move |
| **See** | [[DECISIONS#Bed assignment SSOT alignment]] |

---

### OPS-TIMELINE-01 — Lifecycle timeline not showing on Operations

| | |
|---|---|
| **Severity** | Medium |
| **Symptom** | "View lifecycle timeline" appeared to do nothing |
| **Root cause** | (1) Relative URL `?resident=` without path (2) vacating rows had empty `customerId` (3) no scroll to `#timeline` |
| **Fix** | `d4c01c6` — absolute URLs, `customerId` from vacating query, `ScrollToHash` |
| **See** | [[Operations]] |

---

### VAC-RENT-01 — No checkout-month rent on vacating notice

| | |
|---|---|
| **Severity** | High (business) |
| **Symptom** | Resident vacating 5 July — no pro-rated 1–5 July rent invoice before refund |
| **Root cause** | Vacating submit/approve did not sync checkout-month billing |
| **Fix** | `369bddb` — `vacatingCheckoutBilling.ts` |
| **See** | [[DECISIONS#Vacating checkout rent sync]] |

---

### REV-CRASH-01 — Revenue page SQL alias error

| | |
|---|---|
| **Severity** | High |
| **Fix** | `a9ae005` |
| **Symptom** | Revenue page crash from invalid occupancy SQL alias in deposit query |

---

### DEP-LINK-01 — Deposit payment links forbidden for admins

| | |
|---|---|
| **Severity** | Medium |
| **Fix** | `783d25e` |

---

### DEP-DUP-01 — Duplicate deposit ledger display

| | |
|---|---|
| **Severity** | Medium |
| **Fix** | `49cf712` — ledger reconcile tool |

---

## Operational scenarios (not code bugs)

### Mohd Aatif — pending approval

| | |
|---|---|
| **Status** | Expected — not a bug |
| **Situation** | Move-out notice filed; Operations shows "Approve move-out notice" |
| **Cause** | Admin clicked Continue before `d4c01c6` fix — vacating page crashed, approval never completed |
| **Action** | After deploy: `/admin/vacating` → Continue → confirm approve |

---

### Harish — checkout in progress

| | |
|---|---|
| **Status** | Workflow in progress |
| **Situation** | Vacating approved; checkout settlement open; refund may be marked paid elsewhere |
| **Action** | `/admin/checkout-settlements/[id]` — verify status `refund_paid` / `completed`; align deposit ledger |

---

## Known limitations

| Area | Limitation |
|------|------------|
| **Half-open ranges** | Vacating date stored as inclusive move-out day but `stay_range` upper bound is exclusive — document carefully when debugging days |
| **Single vacating request** | UNIQUE on `booking_id` — must complete/reject before new notice |
| **Resident list cap** | 200 residents in admin list query |
| **Manual UPI** | Proof approval required — no auto-reconciliation with bank statements |
| **Electricity at checkout** | Final bill amount unknown until meter reading or average — placeholder shown before generation ([[WORKFLOWS#Billing]]) |
| **Legacy `/admin/requests`** | Deprecated — do not build new features there |

---

## Reporting new bugs

1. Add row to **Open bugs** above
2. Append fix to **Resolved** when shipped
3. Update [[CHANGELOG]] and [[CURRENT_STATE]]
4. Add ADR in [[DECISIONS]] if architectural

---

## Related

[[CURRENT_STATE]] · [[CHANGELOG]] · [[DECISIONS]] · [[WORKFLOWS]]
