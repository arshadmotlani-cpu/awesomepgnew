# P0-6 — KYC Queue (Admin)

**Routes:** `/admin/residents/kyc`, `/admin/residents/kyc/[submissionId]`  
**Status:** ✅ Presentation redesign complete

---

## Structure

### Identity queue (`/admin/residents/kyc`)

| Section | Contents |
|---------|----------|
| Identity check summary | Needs review · Approved on file · Total · Next step |
| What to do next | ≤5 links (review first pending, queues, residents) |
| Filter tabs | Plain labels without duplicate counts |
| Needs review | Pending table |
| Approved on file | Document cards with photos |
| Advanced tools | Bulk PDF zip + per-resident PDF downloads (collapsed) |

### Review submission (`/admin/residents/kyc/[submissionId]`)

| Section | Contents |
|---------|----------|
| Submission summary | Status · Submitted · Account identity · Decision |
| What to do next | Approve/reject anchor · Back to queue · Resident profile |
| Document photos | Unchanged grid |
| Approve or reject | Primary workflow (pending only) |
| Advanced tools | PDF download · Refresh · Auto-validation report (collapsed) |

---

## Before / after action count

| Surface | Before | After (visible) |
|---------|--------|-----------------|
| Queue page header | Title + tabs with counts + section headers with counts | **Summary once** + primary actions ≤5 |
| Approved section header | Bulk PDF button visible | **Moved to Advanced tools** |
| Approved card row | Open view + PDF (2) | **1 link** (PDF in Advanced) |
| Verify page header | 2 nav links in header actions | **Primary actions section** (≤3) |
| Verify page (decided) | PDF + Refresh inline | **Advanced tools** (collapsed) |
| Validation report | Always-visible `<details>` | **Advanced tools** |

---

## Duplicates removed

- Tab labels no longer repeat `(N)` counts (summary holds counts)
- Section headers no longer repeat `(N)` in title
- Removed duplicate status row on verify page (now in summary)
- Removed header action bar duplicate of primary actions on verify page

---

## Advanced tools moved

- Bulk Aadhaar PDF download (queue)
- Per-resident PDF downloads (queue)
- Aadhaar PDF download (verify — non-pending)
- Refresh page (verify)
- Auto-validation JSON report (verify)

---

## Plain language

| Before | After |
|--------|-------|
| KYC review | Identity checks |
| Pending approval | Needs review |
| Approved documents | Approved on file |
| Verify → | Review documents |
| Verify — {name} | Review — {name} |

---

## Business logic unchanged

- `listPendingKycSubmissions`, `listApprovedKycSubmissions`, `getKycSubmission`
- `approveKycAction`, `rejectKycAction`
- Permissions and KYC status workflow
