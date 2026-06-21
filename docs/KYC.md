# KYC

> Domain hub — identity verification (Aadhaar + selfie) before bed assignment.

Cross-links: [[START_HERE]] · [[FEATURES#KYC review]] · [[WORKFLOWS#KYC Approval]]

---

## Purpose

Verify resident identity for **website signups** before admin can assign a bed. Residents upload documents; admins approve or reject in a dedicated queue surfaced on [[Operations]].

**SSOT:** `kyc.ts`, `kyc_submissions` table, `customers.kyc_status`

---

## Related features

- [[KYC]] review queue — `/admin/residents/kyc`, `/admin/residents/kyc/[submissionId]`
- Customer upload — `/account/profile?section=identity`
- [[Operations]] KYC pending action items
- Gate for [[Bed Assignment]] on website bookings

See [[FEATURES#KYC review]]

---

## Related workflows

| Workflow | Steps |
|----------|-------|
| [[WORKFLOWS#Resident Onboarding]] | Step 5–6: upload → admin approve |
| [[WORKFLOWS#KYC Approval]] | pending → review → approved/rejected |
| [[WORKFLOWS#Bed Assignment]] | Requires KYC approved for web signups |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/residents/kyc` | KYC queue list |
| `/admin/residents/kyc/[submissionId]` | Review detail |
| `/account/profile?section=identity` | Resident upload |
| `/account/kyc` | Redirect → identity section |
| `/admin/operations` | KYC items in priority queue |

See [[ROUTES#Residents & KYC]]

---

## Related database entities

| Table / field | Role |
|---------------|------|
| `kyc_submissions` | Document URLs, status, timestamps |
| `customers.kyc_status` | pending / approved / rejected |
| Vercel Blob | Stored document images |

See [[DATABASE#People & auth]] · `kyc_submissions`

---

## Related decisions

- [[DECISIONS#Operations as action hub]] — KYC surfaced in ops queue
- [[DECISIONS#Action Center idempotent sync]] — `kyc_pending` action items

---

## Related hubs

[[Residents]] · [[Bookings]] · [[Bed Assignment]] · [[Operations]] · [[Notifications]] · [[Action Center]]
