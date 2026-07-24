# Settlement business policy spot-checks

Generated: 2026-07-24T12:09:50.752Z

## APG-2026-0048 — Krishna

Tags: pending_request, short_notice, tail_preview

- Engine validation: PASS
- Refund total (paise): 412080

## APG-2026-0045 — Approved tail regression

Tags: waiting_vacating_date, approved, tail_case_b

- Engine validation: PASS
- Refund total (paise): 151096

## APG-REGRESSION-C — Synthetic Case C (unit fixture)

Tags: no_tail, inside_paid_period

- Engine validation: PASS
- Policy objective: FAIL — expected tail 0 got 348300; expected no invoice suppression

### Explanation summary

- **Rent paid:** ₹4,121 — RULE_RENT_PAID_TOTAL
  - Formula: Total rent received = ₹4,121
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Rent used:** ₹3,612 — RULE_RENT_CONSUMED_CAP
  - Formula: min(rent paid ₹4,121, stayDays 28 × daily ₹129 = ₹3,612) = ₹3,612
  - Reason: Stay: 2026-07-07 → 2026-08-03 (28 days) Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03
- **Unused rent:** ₹509 — RULE_UNUSED_RENT
  - Formula: ₹4,121 − ₹3,612 = ₹509
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Notice charge:** ₹0 — RULE_NOTICE_CHARGE
  - Formula: Notice satisfied — charge ₹0
  - Reason: Notice given: 33 days Required: 14 days Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 Notice period satisfied — no notice charge.
- **Notice covered by unused rent:** ₹0 — RULE_NOTICE_FROM_UNUSED_FIRST
  - Formula: min(unused rent ₹509, notice charge ₹0) = ₹0
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Deposit deduction (notice):** ₹0 — RULE_NOTICE_FROM_DEPOSIT
  - Formula: max(0, notice ₹0 − from unused rent ₹0) = ₹0
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Tail rent:** ₹3,483 — RULE_TAIL_FROM_FINAL_PERIOD
  - Formula: tailDays 27 × daily ₹129 = ₹3,483 (final invoice suppressed: true)
  - Reason: Tail period: 2026-07-08 → 2026-08-03 Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction.
- **Electricity (deposit):** ₹0 — RULE_ELECTRICITY_DEDUCTION
  - Formula: Electricity deduction ₹0 at this stage
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Other deductions:** ₹0 — RULE_OTHER_DEDUCTIONS
  - Formula: Other deductions ₹0
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Deposit remaining:** ₹638 — RULE_DEPOSIT_REFUNDABLE
  - Formula: ₹4,121 − notice deposit ₹0 − tail ₹3,483 − electricity ₹0 − other ₹0 = ₹638
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Refund:** ₹1,147 — RULE_REFUND_TOTAL
  - Formula: ₹638 (deposit remaining) + ₹509 (unused rent after notice) = ₹1,147
  - Reason: Billing period: 2026-07-07 → 2026-08-07 Vacating: 2026-08-03 No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.

## APG-REGRESSION-B — Synthetic Case B (unit fixture)

Tags: tail_case_b, one_tail_day

- Engine validation: PASS
- Policy objective: PASS

### Explanation summary

- **Rent paid:** ₹4,121 — RULE_RENT_PAID_TOTAL
  - Formula: Total rent received = ₹4,121
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Rent used:** ₹4,121 — RULE_RENT_CONSUMED_CAP
  - Formula: min(rent paid ₹4,121, stayDays 33 × daily ₹129 = ₹4,257) = ₹4,121
  - Reason: Stay: 2026-07-07 → 2026-08-08 (33 days) Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08
- **Unused rent:** ₹0 — RULE_UNUSED_RENT
  - Formula: ₹4,121 − ₹4,121 = ₹0
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Notice charge:** ₹0 — RULE_NOTICE_CHARGE
  - Formula: Notice satisfied — charge ₹0
  - Reason: Notice given: 38 days Required: 14 days Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. Notice period satisfied — no notice charge.
- **Notice covered by unused rent:** ₹0 — RULE_NOTICE_FROM_UNUSED_FIRST
  - Formula: min(unused rent ₹0, notice charge ₹0) = ₹0
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Deposit deduction (notice):** ₹0 — RULE_NOTICE_FROM_DEPOSIT
  - Formula: max(0, notice ₹0 − from unused rent ₹0) = ₹0
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Tail rent:** ₹258 — RULE_TAIL_FROM_FINAL_PERIOD
  - Formula: tailDays 2 × daily ₹129 = ₹258 (final invoice suppressed: true)
  - Reason: Tail period: 2026-08-07 → 2026-08-08 Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction.
- **Electricity (deposit):** ₹0 — RULE_ELECTRICITY_DEDUCTION
  - Formula: Electricity deduction ₹0 at this stage
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Other deductions:** ₹0 — RULE_OTHER_DEDUCTIONS
  - Formula: Other deductions ₹0
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Deposit remaining:** ₹3,863 — RULE_DEPOSIT_REFUNDABLE
  - Formula: ₹4,121 − notice deposit ₹0 − tail ₹258 − electricity ₹0 − other ₹0 = ₹3,863
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.
- **Refund:** ₹3,863 — RULE_REFUND_TOTAL
  - Formula: ₹3,863 (deposit remaining) + ₹0 (unused rent after notice) = ₹3,863
  - Reason: Billing period: 2026-08-07 → 2026-09-07 Vacating: 2026-08-08 Stay consumption equals or exceeds rent paid — no unused rent credit. No notice charge to apply from unused rent. Notice fully covered by unused rent — no deposit notice deduction. Pending final meter — not deducted in estimate until finalized. Pending — no damage/cleaning entered yet.

## Owner review

Subjective policy (notice prepaid display vs charge) — confirm in UI matches BR-NOTICE-PREPAID.
