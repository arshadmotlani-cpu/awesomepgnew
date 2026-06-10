# Phase 5 — Stay extensions, operational notes

Companion to [`PHASE4_OPERATIONS.md`](./PHASE4_OPERATIONS.md). Phase 5 adds
the ability for customers (or admins on their behalf) to **extend an
existing confirmed booking** without cancelling and rebooking. Open-ended
monthly auto-invoicing was scoped OUT of Phase 5 and lives in a future
phase.

> **Scope reminder.** Phase 5 covers extensions on bookings whose
> `duration_mode` is `daily`, `weekly`, or `monthly` — i.e. anything with
> a finite `expected_checkout_date`. Open-ended bookings do not surface
> the "Extend" CTA on either the customer or admin side.

---

## 1. Data shape — what changed in Phase 5

### Schema

Phase 1 already laid down the heavy lifting:

| Table / column                     | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `stay_extensions`                  | One row per extension request, with quote + payment link   |
| `bed_reservations.kind`            | `'primary'` for the original; `'extension'` for extensions |
| `bed_reservations.parent_reservation_id` | Self-FK from extension rows back to their primary    |
| `reservation_kind` enum            | Already includes `'extension'`                             |
| `payment_purpose` enum             | Already includes `'extension'`                             |
| GiST EXCLUDE constraint on `stay_range` | Authoritative overlap protection (covers extensions) |

The only schema delta in Phase 5 (migration `0003_phase5_extension_indexes.sql`):

```sql
CREATE INDEX IF NOT EXISTS bed_reservations_parent_idx
  ON bed_reservations (parent_reservation_id)
  WHERE parent_reservation_id IS NOT NULL;
```

A partial index — extension rows are a small minority — that makes
`/admin/bookings/[id]` joins and the extension service's parent walk
cheap as booking volume grows.

### TypeScript schema additions

`src/db/schema/bookings.ts → PricingSnapshot` gained an optional
`extensions?: Array<{...}>` field. `recordExtensionPaymentSuccess()`
appends one entry per successfully-paid extension; the field is **never
mutated in place** so each extension stamp is a permanent receipt.

### No new environment variables

Phase 5 reuses every Phase-4 knob — `PAYMENT_PROVIDER`,
`BOOKING_HOLD_MINUTES`, `CRON_SECRET`, the Razorpay key triplet, etc.
The hold-expiry cron at `/api/cron/release-holds` already cancels
extension reservations automatically (and the lifecycle service flips
the matching `stay_extensions` rows pending → cancelled in the same
sweep). No `vercel.json` change required.

---

## 2. Extension lifecycle

```
                              quoteExtension()  (read-only)
                                      │
                                      ▼
   confirmed booking  ──requestExtension(ok)──►  pending
                                      │              │
                          conflict / ownership_failed / …  (rolled back, nothing held)
                                                     │
                                       recordExtensionPaymentSuccess()
                                                     │
                                                     ▼
                                                   paid
                                                     │
                            ◄── recordExtensionPaymentFailure() ◄──┘ (alt)
                                       cancelled
                                                     ▲
                                          releaseExpiredHolds()
                                          (hold_expires_at past)
```

State invariants enforced by the service layer:

- `requestExtension` is transactional. If any bed conflicts (GiST
  EXCLUDE fires, `23P01`), the entire transaction rolls back. **No
  partial holds.** Pre-flight conflict scan additionally surfaces ALL
  conflicting beds at once (not just the first one Postgres reports).
- `recordExtensionPaymentSuccess` is idempotent via the partial unique
  index on `payments(provider, provider_payment_id)`. Re-runs return
  `stateChanged: false`.
- The handler scopes its reservation flip to the specific
  `new_reservation_ids` on this extension. A duplicate **primary**
  payment cannot accidentally activate an extension's holds, and vice
  versa (`recordPaymentSuccess` / `recordPaymentFailure` /
  `recordOfflinePaymentAction` were narrowed to `kind='primary'`
  alongside this work).
- `bookings.expected_checkout_date` only ever moves **forward**.
  Defensive against out-of-order webhook delivery.
- `pricing_snapshot.extensions[]` is append-only — the customer's
  ledger never loses a paid extension.

---

## 3. Webhook routing — `notes.kind = 'extension'`

Both `/api/webhooks/razorpay` and `/api/webhooks/mock` fork on a tag
that the order-creation code attaches:

- **Razorpay**: when `app/(customer)/booking/[bookingCode]/extend/[extensionId]/pay/actions.ts → startRazorpayExtensionOrder`
  creates the order, it passes
  `notes: { booking_code, kind: 'extension', extension_id }`. The
  webhook parser pulls `kind` + `extension_id` off `payment.notes` for
  both `payment.captured` and `payment.failed`.
- **Mock**: the body carries top-level `purpose: 'extension'` +
  `extensionId`. Symmetric shape, same dispatch.

If `notes.kind === 'extension'` is set but `notes.extension_id` is
missing/empty, the parser returns a structured error and the webhook
responds 401/200 (Razorpay won't retry forever). This prevents
mis-tagged payments from silently writing to the wrong table.

Existing primary-booking webhook flows are unchanged — `notes.kind`
defaults to `'booking'` when absent, so any payment created before
Phase 5 (or by code paths that don't set notes) is routed to
`recordPaymentSuccess` exactly like before.

---

## 4. Customer surfaces

| Route                                                          | Purpose                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `/booking/[bookingCode]/extend`                                | Phone-gated request form; redirects to the pay page        |
| `/booking/[bookingCode]/extend/[extensionId]/pay`              | Pay (Razorpay / mock) OR cancel a pending extension        |
| `/booking/[bookingCode]` (existing)                            | Shows "Extend stay →" CTA + a "Stay extensions" history    |
| `/account/bookings` (existing)                                 | Unchanged — extensions roll up under their booking         |

The extension request action `requestExtensionAction` reuses the
Phase-4 `normalisePhone` + constant-time comparison pattern from the
cancel-booking action: the booking code in the URL is the bearer
credential, and the typed-in phone is the proof. A mismatch returns a
generic ownership-failed message; no information about the booking is
leaked.

Cancelling a still-pending extension uses the same phone-gate, calls
`cancelPendingExtension`, releases the held beds, and bounces to the
parent booking page.

---

## 5. Admin surfaces

| Route                                | Capabilities                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `/admin/bookings/[bookingId]`        | Reservations table now shows `Kind` (primary/extension)            |
| ↳ "Stay extensions" card             | Inline "Mark paid (offline)" + "Cancel ext." actions on `pending`  |
| ↳ "Request extension" sidebar widget | Admin-driven extension request (no phone gate)                     |
| `/admin/extensions`                  | Site-wide index with `All / Pending / Paid / Cancelled` filters    |

The admin "Mark paid (offline)" form routes through
`recordExtensionPaymentSuccess` with `provider` set to one of
`cash | upi_manual | bank_transfer`. The lifecycle path is identical
to a Razorpay capture: payment row inserted, extension flipped to
`paid`, reservations flipped `hold → active`, booking
`expected_checkout_date` rolled forward, and the snapshot stamp
appended.

Admin actions are NOT phone-gated (admins are implicitly trusted until
full RBAC arrives in Phase 6). Every admin extension action writes an
`audit_log` row with `actor_type='admin'`.

---

## 6. Cron + hold expiry

The existing `/api/cron/release-holds` route (Phase 4) handles
extension hold expiry **automatically** — the underlying
`releaseExpiredHolds()` walks every reservation in `hold` regardless of
`kind`. Phase 5 adds a fold-in step at the end of every sweep:

1. Cancel expired reservations (existing behaviour).
2. For each booking whose remaining `hold|active` reservation count is
   0, cancel the booking (existing behaviour — primary holds).
3. **New**: call `markExpiredExtensions()` to flip any
   `stay_extensions` row whose `new_reservation_ids` are now all
   `cancelled` from `pending` → `cancelled`. Idempotent.

There's no new cron schedule, no new `vercel.json` entry, and the
`CRON_SECRET` gating is unchanged.

Manual invocation:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/release-holds | jq
# → { bookingsCancelled, reservationsReleased, cancelledCodes, expiredExtensions }
```

---

## 7. Verification scripts

| Script                                | What it asserts                                                  |
| ------------------------------------- | ---------------------------------------------------------------- |
| `scripts/verify-extension-flow.ts`    | Happy path: request → quote → pay → idempotent replay → snapshot |
| `scripts/verify-extension-conflict.ts`| Conflicting extension is rejected w/ `kind='conflict'` payload   |
| `scripts/verify-extension-hold-expiry.ts` | Expired extension reservations + row both flip to `cancelled` |
| `scripts/verify-queries.ts`           | Extended to cover `listStayExtensions` + `listExtensionsForBooking` |

All Phase 4 verification scripts continue to pass against the modified
lifecycle (the `kind='primary'` scoping fix in `recordPaymentSuccess` /
`recordPaymentFailure` is the only behavioural change to existing
flows — primary-only bookings still flip exactly as before).

---

## 8. Incident playbooks

### "Customer says they paid for an extension but their checkout didn't move"

1. Find the extension: admin `/admin/extensions?status=pending` filter,
   or query directly:
   ```sql
   SELECT id, booking_id, status, payment_id
   FROM stay_extensions WHERE id = $1;
   ```
2. If `status='paid'` but the booking's `expected_checkout_date`
   doesn't match `requested_until_date`, check the audit log:
   ```sql
   SELECT diff FROM audit_log
   WHERE entity='stay_extension' AND entity_id=$1
   ORDER BY created_at DESC;
   ```
   The `previousExpectedCheckoutDate` field in the diff tells you what
   the lifecycle handler saw — if it was already > `requested_until_date`,
   the defensive "only roll forward" guard suppressed the update.
3. If `status='pending'` after the customer says they paid, look for
   the webhook in `payments`:
   ```sql
   SELECT * FROM payments
   WHERE purpose='extension'
   ORDER BY created_at DESC LIMIT 10;
   ```
   If the row is missing, the webhook never landed — check Razorpay
   dashboard → Webhooks → Recent deliveries.

### "Extension held beds but the customer never paid"

The hold-expiry cron handles this automatically every 5 minutes. To
force it immediately:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/release-holds
```

Manual one-off via SQL is also safe:

```sql
UPDATE bed_reservations
SET status='cancelled', updated_at=now()
WHERE id = ANY((SELECT new_reservation_ids FROM stay_extensions WHERE id=$1))
  AND status='hold';

UPDATE stay_extensions
SET status='cancelled', updated_at=now()
WHERE id=$1 AND status='pending';
```

### "Webhook signature failed for an extension payment"

Identical to the Phase-4 playbook in `PHASE4_OPERATIONS.md` — same
secret, same rotation procedure. Extensions don't get a separate
webhook secret.
