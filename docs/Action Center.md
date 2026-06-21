# Action Center

> Domain hub — idempotent synced task items with WhatsApp, email, and payment link execution.

Cross-links: [[START_HERE]] · [[Operations]] · [[Notifications]]

---

## Purpose

Derive **actionable tasks** from live database state (`syncActionItems()`), deduplicated by `source_key`. Operators execute via WhatsApp URL, email, or [[Payment Links]] from the Action Drawer on [[Operations]].

**SSOT:** `actionItems.ts`, `actionExecution.ts`, `action_items` table

---

## Related features

- Sync on overview + cron
- Types: rent_due, electricity_due, kyc_pending, vacating, payment_proof, etc.
- Action Drawer on `/admin/operations`

See [[FEATURES#Action Center]]

---

## Related workflows

[[WORKFLOWS#Notifications]] — Action Center section

---

## Related routes

`/admin/operations` · `/admin/overview` (sync) · `/admin/panel?tab=links`

---

## Related database entities

`action_items` (`source_key` UNIQUE), source tables per item type

---

## Related decisions

- [[DECISIONS#Action Center idempotent sync]]
- [[DECISIONS#Operations as action hub]]

---

## Related hubs

[[Operations]] · [[Notifications]] · [[Payment Links]] · [[Billing]] · [[KYC]]
