# Phase 3 — Resident Payment UX — Decision & Findings

**Status:** Decision made — **remove misleading Pay All CTA**  
**Date:** 2026-07-02

---

## 1. Current architecture

- **Entry:** `/account/profile?section=resident&tab=payments`
- **UI:** `ResidentPaymentsV2Hub.tsx` — Bills Due + per-bill Pay buttons
- **Data:** `ResidentAreaSection.tsx` → `buildBillRowsFromDetail()`

---

## 2. Problem statement

**"Pay all ₹X"** displayed when 2+ bills due, but `payAllHref = payableHrefs[0]` — navigates to **first bill only**, not a batch payment.

Residents with July Rent + Electricity each see individual Pay buttons **and** a Pay All that implies combined settlement.

---

## 3. Evaluation

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Remove Pay All** | Eliminates confusion; per-bill flow is clear | Loses shortcut to first bill | **Selected** |
| Rename ("Pay next bill") | Honest about behavior | Still arbitrary which bill is "next" | Rejected |
| True batch checkout | Best UX long-term | 1–2 weeks eng; new payment orchestration | Deferred P3 |

**Duplicate paths:** No duplicate settlement — Pay All only links to one invoice. Risk is **user belief** they paid everything.

**Deposit:** Excluded from Bills Due and Pay All (payment link only) — correct.

---

## 4. Implementation (this phase)

- Remove `payAllEnabled` / `payAllHref` from `ResidentPaymentsV2Hub`
- Remove computation from `ResidentAreaSection`
- Add copy when 2+ bills: *"Pay each bill separately using the buttons below."*
- Leave `getPayAllHrefAction` in `room-change-actions.ts` for future batch work (unused)

---

## 5. Files changed

- `src/components/customer/account/resident/ResidentPaymentsV2Hub.tsx`
- `src/components/customer/account/ResidentAreaSection.tsx`

---

## 6. Testing strategy

- Manual: resident with rent + electricity — no Pay All button; both per-bill CTAs work
- E2E: extend resident payments smoke when staging DB available

---

## 7. Rollback

- Revert UI commit — no data impact

---

## Sign-off

| Role | Status |
|------|--------|
| UX decision | **Remove Pay All** |
| Implementation | In progress with stabilization batch |
