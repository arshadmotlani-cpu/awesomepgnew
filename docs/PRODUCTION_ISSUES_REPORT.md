# Production Issues Report

> **Generated:** 2026-06-25  
> **Status:** Fixes implemented locally — **do not deploy until production verification passes**

---

## 1. Why Operations badge showed 20

The sidebar badge counted **OPEN `unresolved_actions`** in the **operations bucket**. Before this fix, `invoice_review` was mapped to operations.

**Root cause:** The daily financial reconciliation job (`financialReconciliation.ts`) created ~20 `action_items` with type `deposit_collection_due` for `MISSING_RENT_INVOICE` audit findings. `unresolvedActionSync` mapped `deposit_collection_due` → `invoice_review` → **operations badge**.

These are **billing audit tasks**, not actionable Operations queue items (KYC, payment proof, checkout, bed assignment, etc.). The Operations **page** builds its queue from live domain data via `loadResidentOperationsResidentsPage()` and correctly showed ~1 resident.

| Layer | What it counted | Result |
|-------|-----------------|--------|
| Sidebar badge (before) | `unresolved_actions` OPEN + `invoice_review` | **20** |
| Operations queue UI | Live actionable residents | **1** |

---

## 2. Every record contributing to the badge

On production, each inflated count is an OPEN row like:

```
action_type = 'invoice_review'
source_key  = 'unresolved:action_item:financial_audit:MISSING_RENT_INVOICE:{bookingId|customerId}'
label       = 'Financial audit · MISSING RENT INVOICE · {resident name}'
```

These correspond to `action_items` where:

```
type       = 'deposit_collection_due'  (legacy — now financial_audit_review)
source_key = 'financial_audit:MISSING_RENT_INVOICE:{id}'
```

**To list every row on production** (Neon SQL or after deploy):

```sql
SELECT id, action_type, source_key, label, resident_id, created_at
FROM unresolved_actions
WHERE status = 'OPEN' AND action_type = 'invoice_review'
ORDER BY created_at;
```

Expected count before fix: **~20** (matches `MISSING_RENT_INVOICE` audit findings from cron).

---

## 3. Fix / delete actions

| Action | Mechanism |
|--------|-----------|
| Stop syncing billing types to Operations | `unresolvedActionSync`: `rent_due`, `electricity_due`, `deposit_collection_due`, `financial_audit_review` → `null` |
| Remove `invoice_review` from badge bucket | `unresolvedActions.ts`: excluded from `UNRESOLVED_ACTION_BADGE_BUCKET` |
| Auto-close stale rows on admin sync | `resolveStaleInvoiceReviewUnresolvedActions()` in sync pipeline |
| One-time DB cleanup | Migration `0079_close_stale_invoice_review_ops.sql` |
| Reclassify audit action items | Same migration: `deposit_collection_due` → `financial_audit_review` where `source_key LIKE 'financial_audit:%'` |
| Badge = queue (Operations) | `adminNavBadges.ts`: operations count from `loadResidentOperationsResidentsPage().allQueueCount` |
| New financial audit type | Migration `0077`: enum `financial_audit_review`; `financialReconciliation.ts` uses it |

**Manual verification after deploy:**

```bash
npx tsx scripts/audit-open-unresolved-actions.ts --fix
npx tsx scripts/production-issues-audit-report.ts
```

Badge and queue must match (`Match: YES` in report).

---

## 4. Room 201 billing configuration

Implemented via **room pricing configuration** (no resident name hardcoding):

| Setting | Value |
|---------|-------|
| `rooms.billing_mode` | `private_room` |
| `rooms.private_room_monthly_rent_paise` | `714000` (₹7,140/month) |
| Invoice rule | One invoice per room per billing month |
| Inventory bed | `manual_occupied = true` beds skipped (`shouldSkipPrivateRoomDuplicate`) |
| Duplicate guard | `privateRoomInvoiceExists()` blocks second invoice for same room+month |

**Migrations:** `0076_room_billing_mode.sql`, `0078_room_201_private_billing.sql`  
**Code:** `src/lib/billing/roomBilling.ts`, `generateRentInvoicesForMonth()` in `rentInvoices.ts`

Never generates ₹5,100 + ₹5,100 — private room uses configured ₹7,140 on the resident's primary (non-inventory) bed only.

---

## 5. Dhariya KYC status (Room 201)

**Production DB is not accessible from local dev** (Neon secrets injected at Vercel runtime only). Run on production:

```bash
npx tsx scripts/audit-kyc-visibility.ts Dhairya
npx tsx scripts/production-issues-audit-report.ts
```

Or query Room 201 resident directly:

```sql
SELECT c.full_name, c.kyc_status, b.bed_code, b.manual_occupied,
       ks.id AS submission_id, ks.status AS submission_status, ks.created_at
FROM rooms r
JOIN beds b ON b.room_id = r.id
LEFT JOIN bed_reservations br ON br.bed_id = b.id AND br.status = 'active' AND CURRENT_DATE <@ br.stay_range
LEFT JOIN bookings bk ON bk.id = br.booking_id
LEFT JOIN customers c ON c.id = bk.customer_id
LEFT JOIN LATERAL (
  SELECT * FROM kyc_submissions WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1
) ks ON true
WHERE r.room_number = '201' AND r.archived_at IS NULL
ORDER BY b.bed_code;
```

**Verdict matrix:**

| State | Condition | Admin UI |
|-------|-----------|----------|
| **UPLOADED** | Pending submission exists + in KYC queue | Documents in `/admin/residents/kyc/{id}` |
| **MISSING** | No submissions + `kyc_status = pending` | Resident profile: "Complete KYC"; admin: reminder / copy link / WhatsApp |
| **BROKEN_RETRIEVAL** | Submissions exist but not in queue / docs not loading | Fix `getKycSubmission` / blob URLs |

Prior audit note: name may be **"Dhairya Zinzuvadiya"** (spelling variant). Search both `Dhairya` and room 201 occupant — do not hardcode names in code.

---

## 6. July invoices that will be generated

**Preview only** — no generation until you approve:

```bash
npx tsx scripts/preview-july-rent-generation.ts --month 2026-07
```

After review, generate with explicit approval:

```bash
npx tsx scripts/preview-july-rent-generation.ts --month 2026-07 --approve
```

Preview columns: **Resident | Room | Billing date | Amount | Status**

- Only residents whose **billing anniversary falls in July 2026** (anniversary scheduler logic)
- Room 201: **one row at ₹7,140**; inventory/block bed rows show `SKIP (manual_occupied_inventory_bed)` or `SKIP (private_room_invoice_exists)`

---

## Verification checklist (before deploy)

- [ ] Migrations 0076–0079 applied on production
- [ ] `SELECT count(*) FROM unresolved_actions WHERE status='OPEN' AND action_type='invoice_review'` → **0**
- [ ] Operations sidebar badge = Operations queue count
- [ ] Room 201: `billing_mode = private_room`, `714000` paise
- [ ] Room 201 resident KYC verdict documented (UPLOADED / MISSING / BROKEN)
- [ ] July preview reviewed and approved by admin before `--approve`

---

## Files changed

- `src/services/unresolvedActionSync.ts`
- `src/services/unresolvedActions.ts`
- `src/services/adminNavBadges.ts`
- `src/services/financialReconciliation.ts`
- `src/services/rentInvoices.ts`
- `src/lib/billing/roomBilling.ts`
- `src/db/schema/rooms.ts`, `enums.ts`
- `src/lib/actionCenter/constants.ts`
- `src/db/migrations/0076` – `0079`
- `scripts/preview-july-rent-generation.ts`
- `scripts/production-issues-audit-report.ts`
- `scripts/audit-open-unresolved-actions.ts`
