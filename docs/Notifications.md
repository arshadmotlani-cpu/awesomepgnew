# Notifications

> Domain hub — operator alerts, resident email, Action Center tasks, and admin notification feed.

Cross-links: [[START_HERE]] · [[WORKFLOWS#Notifications]] · [[Action Center]]

---

## Purpose

Keep operators and residents informed about **actionable events**: rent overdue, KYC pending, move-out stages, payment proofs, billing reminders. Combines email notifications, synced `action_items`, WhatsApp/email execution, and the admin notifications mirror.

**SSOT:** `actionItems.ts`, `actionExecution.ts`, `automationEngine.ts`, `notifyVacatingUpdate()`

---

## Related features

- [[Action Center]] — synced task queue from live DB state
- [[Operations]] overview — surfaces action items + Action Drawer
- Admin notifications — `/admin/notifications`
- Resident notifications tab — `?section=resident&tab=notifications`
- Email: vacating updates, billing reminders (automation cron)
- WhatsApp / payment link execution from action items

See [[FEATURES#Action Center]] · [[WORKFLOWS#Notifications]]

---

## Related workflows

| Workflow | Channel |
|----------|---------|
| [[WORKFLOWS#Notifications]] — Email | Vacating status, billing reminders |
| [[WORKFLOWS#Notifications]] — Action Center | `syncActionItems()` → rent_due, kyc_pending, vacating, etc. |
| [[WORKFLOWS#Notifications]] — Admin feed | Mirror at `/admin/notifications` |
| [[WORKFLOWS#Billing]] | Triggers rent/electricity due items |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/operations` | Action queue + drawer |
| `/admin/notifications` | Admin notification feed |
| `/admin/overview` | Sync action items |
| `/admin/panel?tab=links` | [[Payment Links]] from actions |
| `/account/profile?section=resident&tab=notifications` | Resident feed |
| `app/api/cron/automation/route.ts` | Scheduled reminders |

See [[ROUTES#Operations & Vacating]]

---

## Related database entities

| Table | Role |
|-------|------|
| `action_items` | Synced tasks (`source_key` UNIQUE) |
| `admin_notifications` | Operator alert mirror |
| `automation_rules` | Cron-driven reminders |
| Source tables | rent_invoices, kyc_submissions, vacating_requests, etc. |

See [[DATABASE]] · [[ARCHITECTURE#Operations core]]

---

## Related decisions

- [[DECISIONS#Action Center idempotent sync]]
- [[DECISIONS#Operations as action hub]]
- [[DECISIONS#Payment proof vs Razorpay]] — proof approval action items

---

## Related hubs

[[Operations]] · [[Action Center]] · [[Billing]] · [[KYC]] · [[Vacating]] · [[Payment Links]] · [[Residents]]
