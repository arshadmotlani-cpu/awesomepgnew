/**
 * Phase 5.5 — electricity billing.
 *
 *   createElectricityBill()           — single transactional bill + per-resident fan-out
 *   recordElectricityPaymentSuccess() — webhook fork: electricity purpose
 *   recordElectricityPaymentFailure() — webhook fork: electricity purpose
 *
 * Per spec: an operator enters (units consumed, rate per unit, billing
 * month) for a room. The system splits the resulting total EQUALLY
 * across that room's monthly residents (`bookings.duration_mode IN
 * ('monthly','open_ended')`, status='confirmed', active reservation
 * overlapping the billing month). Daily/weekly residents are excluded.
 *
 * Idempotency:
 *   - UNIQUE(room_id, billing_month) at the storage layer means a
 *     duplicate submission for the same room+month fails fast with
 *     SQLSTATE 23505. We catch that and return a structured
 *     {ok: false, kind: 'already_exists'} so the admin UI can show the
 *     existing bill instead.
 *   - The bill row + N invoice rows are written in ONE transaction
 *     (`db.transaction(...)`) so a crash in the middle can't leave a
 *     "bill with no invoices" / "invoices with no bill" split state.
 *
 * Rounding policy:
 *   - `per_resident_paise = floor(total_paise / monthly_occupant_count)`.
 *   - `rounding_remainder_paise = total - per * count` is recorded on
 *     the bill so the operator absorbs the leftover paise (e.g. ₹1,501
 *     split 3 ways = ₹500 each + ₹1 remainder).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  beds,
  bookings,
  electricityBills,
  electricityInvoices,
  payments,
  rooms,
} from '../db/schema';
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import {
  ELECTRICITY_GRACE_DAYS,
  computeElectricityLateFee,
  electricityDueDate,
  firstOfMonth,
  monthBounds,
  splitElectricity,
} from './billing';
import type { ElectricityInvoice } from '../db/schema';
import type { AnyPaymentProvider } from './bookingLifecycle';
import type { ProviderName } from './payments';

const INVOICE_PREFIX = 'ELE';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type CreateElectricityBillInput = {
  roomId: string;
  billingMonth: DateLike;
  /**
   * Meter readings — the admin's actual inputs. Units consumed is
   * DERIVED as `current - previous`. We persist all three so the audit
   * trail captures what the operator typed.
   */
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number; // paise (e.g. ₹10 = 1000 paise)
  createdByAdminId?: string | null;
  notes?: string | null;
};

export type CreateElectricityBillResult =
  | {
      ok: true;
      billId: string;
      billingMonth: string; // YYYY-MM-01
      unitsConsumed: number;
      totalPaise: number;
      monthlyOccupantCount: number;
      perResidentPaise: number;
      roundingRemainderPaise: number;
      invoiceIds: string[];
      /** YYYY-MM-DD — when the per-resident invoices become overdue. */
      dueDate: string;
    }
  | { ok: false; kind: 'already_exists'; existingBillId: string }
  | { ok: false; kind: 'invalid_input'; message: string }
  | { ok: false; kind: 'no_such_room' };

/**
 * Read-side projection of an electricity invoice with the dynamic
 * late-fee math applied as of `today`. Paid invoices report the FROZEN
 * late fee (no re-derivation); pending/cancelled invoices project live.
 */
export type ElectricityInvoiceView = {
  invoice: ElectricityInvoice;
  /**
   * `pending` → before due date, no penalty
   * `overdue` → past due date, penalty accruing
   * `paid`    → late fee locked
   * `cancelled` → no penalty, no outstanding
   */
  effectiveStatus: 'pending' | 'overdue' | 'paid' | 'cancelled';
  accruedLateFeePaise: number;
  outstandingPaise: number;
  daysOverdue: number;
};

/**
 * Apply live late-fee math to an electricity invoice as of `today`. Pure;
 * mirrors `projectInvoice` in `rentInvoices.ts` but keyed off `due_date`.
 */
export function projectElectricityInvoice(
  invoice: ElectricityInvoice,
  today: DateLike = formatDate(new Date()),
): ElectricityInvoiceView {
  if (invoice.status === 'paid') {
    return {
      invoice,
      effectiveStatus: 'paid',
      accruedLateFeePaise: invoice.lateFeeLockedPaise ?? 0,
      outstandingPaise: 0,
      daysOverdue: 0,
    };
  }
  if (invoice.status === 'cancelled') {
    return {
      invoice,
      effectiveStatus: 'cancelled',
      accruedLateFeePaise: 0,
      outstandingPaise: 0,
      daysOverdue: 0,
    };
  }
  const accrued = computeElectricityLateFee({
    amountPaise: invoice.amountPaise,
    dueDate: invoice.dueDate,
    today,
  });
  const overdueDays =
    accrued > 0
      ? Math.max(0, Math.floor((parseDate(today).getTime() - parseDate(invoice.dueDate).getTime()) / 86_400_000))
      : 0;
  return {
    invoice,
    effectiveStatus: accrued > 0 ? 'overdue' : 'pending',
    accruedLateFeePaise: accrued,
    outstandingPaise: invoice.amountPaise + accrued - invoice.paidPaise,
    daysOverdue: overdueDays,
  };
}

export type RecordElectricityPaymentSuccessInput = {
  provider: ProviderName;
  providerPaymentId: string;
  providerOrderId?: string | null;
  amountPaise: number;
  invoiceId: string;
  rawPayload?: unknown;
  offlineProvider?: AnyPaymentProvider;
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  // Drizzle wraps the original `postgres-js` PostgresError under `cause`,
  // so we have to unwrap before reading the SQLSTATE code.
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') return causeCode;
  }
  return null;
}

/** Numeric(10,2) precision: keep readings + units to 2 decimals. */
function roundToHundredth(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthLabel(billingMonth: DateLike): string {
  const d = parseDate(billingMonth);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Compute the next per-resident electricity invoice number.
 * Sequence is per-month across the whole system.
 */
async function nextElectricityInvoiceNumber(
  billingMonth: DateLike,
  attempt = 0,
): Promise<string> {
  const label = monthLabel(billingMonth);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.billingMonth, firstOfMonth(billingMonth)));
  const seq = (count ?? 0) + 1 + attempt;
  return `${INVOICE_PREFIX}-${label}-${String(seq).padStart(4, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// createElectricityBill — transactional fan-out
// ───────────────────────────────────────────────────────────────────────────

export async function createElectricityBill(
  input: CreateElectricityBillInput,
): Promise<CreateElectricityBillResult> {
  if (
    !Number.isFinite(input.previousReadingUnits) ||
    !Number.isFinite(input.currentReadingUnits)
  ) {
    return {
      ok: false,
      kind: 'invalid_input',
      message: 'previous + current readings must be numbers',
    };
  }
  if (input.previousReadingUnits < 0 || input.currentReadingUnits < 0) {
    return { ok: false, kind: 'invalid_input', message: 'readings must be ≥ 0' };
  }
  if (input.currentReadingUnits < input.previousReadingUnits) {
    return {
      ok: false,
      kind: 'invalid_input',
      message: 'current reading must be ≥ previous reading',
    };
  }
  if (input.ratePerUnitPaise < 0) {
    return { ok: false, kind: 'invalid_input', message: 'ratePerUnitPaise must be ≥ 0' };
  }
  const unitsConsumed = roundToHundredth(
    input.currentReadingUnits - input.previousReadingUnits,
  );
  const billingMonth = firstOfMonth(input.billingMonth);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  // 1. Resolve room → pg.
  const [room] = await db
    .select({
      id: rooms.id,
      pgId: sql<string>`(SELECT pg_id FROM floors WHERE id = ${rooms.floorId} LIMIT 1)`,
    })
    .from(rooms)
    .where(eq(rooms.id, input.roomId))
    .limit(1);
  if (!room || !room.pgId) return { ok: false, kind: 'no_such_room' };

  // 2. Find monthly residents currently occupying any bed in the room
  //    during the billing month.
  //
  //    Eligibility:
  //      bookings.status = 'confirmed'
  //      bookings.duration_mode IN ('monthly', 'open_ended')
  //      bed_reservations.status = 'active'
  //      bed_reservations.stay_range && [monthStart, monthEnd)
  //      bed belongs to this room
  //
  //    De-duplicate by booking_id (a resident with 2 beds in the same
  //    room pays for both as separate splits? per spec they are 2
  //    monthly residents → 2 splits. So we de-dupe by (booking,bed) not
  //    booking — the simpler reading is "monthly residents in the room"
  //    counted per bed they hold).
  //
  //    Actually re-reading the spec example: "Bed 1 Monthly, Bed 2
  //    Monthly, Bed 3 Daily, Bed 4 Weekly → Monthly Occupants: 2".
  //    Each monthly bed counts once. So we count distinct (booking,bed)
  //    pairs but emit one invoice per UNIQUE booking. The amount per
  //    invoice is multiplied by the booking's bed count in the room.
  //
  //    For v1 simplicity: count and bill PER booking, with each
  //    booking's share = (per_resident_paise * beds_in_room_for_that_booking).
  //    This matches the spec example exactly (4 beds in 4 separate
  //    bookings → 2 monthly bookings → 2 invoices of ₹750).
  //
  //    Edge case: one booking has both Bed 1 + Bed 2 monthly in the
  //    same room → bedsInRoom = 2 → that booking pays
  //    2 × per_resident_paise. This is the only fair reading: the
  //    booking is "using 2 beds worth of electricity share".
  const occupantRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      bedId: beds.id,
    })
    .from(bookings)
    .innerJoin(
      sql`bed_reservations`,
      sql`bed_reservations.booking_id = ${bookings.id}`,
    )
    .innerJoin(beds, sql`${beds.id} = bed_reservations.bed_id`)
    .where(
      and(
        eq(beds.roomId, input.roomId),
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        sql`bed_reservations.status = 'active'`,
        sql`bed_reservations.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  // Group: bookingId → { customerId, bedIds[] }
  const byBooking = new Map<
    string,
    { bookingId: string; customerId: string; bedIds: Set<string> }
  >();
  for (const row of occupantRows) {
    const cur = byBooking.get(row.bookingId);
    if (cur) {
      cur.bedIds.add(row.bedId);
    } else {
      byBooking.set(row.bookingId, {
        bookingId: row.bookingId,
        customerId: row.customerId,
        bedIds: new Set([row.bedId]),
      });
    }
  }
  const totalMonthlyBedShares = [...byBooking.values()].reduce(
    (acc, b) => acc + b.bedIds.size,
    0,
  );

  // Total bill in paise. Units is numeric, rate is paise. Float -> round
  // to int paise. Operator should round at entry time if they want
  // pristine numbers.
  const totalPaise = Math.round(unitsConsumed * input.ratePerUnitPaise);
  const { perResidentPaise, remainderPaise } = splitElectricity({
    totalPaise,
    occupantCount: totalMonthlyBedShares,
  });

  // Invoice due date = bill issuance date + 3 days. We pick the date
  // once here (not per-invoice) so every invoice in the fan-out shares
  // the same deadline.
  const issuedAt = new Date();
  const dueDateIso = formatDate(electricityDueDate(issuedAt));

  // 3. Transactional insert.
  try {
    const result = await db.transaction(async (tx) => {
      const [bill] = await tx
        .insert(electricityBills)
        .values({
          pgId: room.pgId,
          roomId: input.roomId,
          billingMonth,
          previousReadingUnits: input.previousReadingUnits.toString(),
          currentReadingUnits: input.currentReadingUnits.toString(),
          unitsConsumed: unitsConsumed.toString(),
          ratePerUnitPaise: input.ratePerUnitPaise,
          totalPaise,
          monthlyOccupantCount: totalMonthlyBedShares,
          perResidentPaise,
          roundingRemainderPaise: remainderPaise,
          createdByAdminId: input.createdByAdminId ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: electricityBills.id });

      const invoiceIds: string[] = [];
      if (totalMonthlyBedShares > 0 && perResidentPaise > 0) {
        for (const bk of byBooking.values()) {
          // Each booking pays (bedsInRoom * perResidentPaise).
          const amount = perResidentPaise * bk.bedIds.size;
          // Representative bed = the smallest-UUID bed for determinism.
          const representativeBed = [...bk.bedIds].sort()[0];

          let inserted: { id: string } | null = null;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const invoiceNumber = await nextElectricityInvoiceNumber(
              billingMonth,
              attempt + invoiceIds.length,
            );
            try {
              const [row] = await tx
                .insert(electricityInvoices)
                .values({
                  invoiceNumber,
                  electricityBillId: bill.id,
                  bookingId: bk.bookingId,
                  customerId: bk.customerId,
                  bedId: representativeBed,
                  billingMonth,
                  dueDate: dueDateIso,
                  amountPaise: amount,
                  status: 'pending',
                })
                .returning({ id: electricityInvoices.id });
              inserted = row;
              break;
            } catch (err) {
              if (pgErrorCode(err) === '23505') continue;
              throw err;
            }
          }
          if (inserted) {
            invoiceIds.push(inserted.id);
            const { notifyElectricityReminder } = await import('@/src/lib/email/notifications');
            notifyElectricityReminder({
              customerId: bk.customerId,
              billingMonth,
              amountPaise: amount,
              dueDate: dueDateIso,
            });
          }
        }
      }

      await tx.insert(auditLog).values({
        actorType: input.createdByAdminId ? 'admin' : 'system',
        actorId: input.createdByAdminId ?? null,
        entity: 'electricity_bill',
        entityId: bill.id,
        action: 'created',
        diff: {
          roomId: input.roomId,
          billingMonth,
          previousReadingUnits: input.previousReadingUnits,
          currentReadingUnits: input.currentReadingUnits,
          unitsConsumed,
          ratePerUnitPaise: input.ratePerUnitPaise,
          totalPaise,
          monthlyOccupantCount: totalMonthlyBedShares,
          perResidentPaise,
          dueDate: dueDateIso,
          graceDays: ELECTRICITY_GRACE_DAYS,
          invoicesCreated: invoiceIds.length,
        },
      });

      return { billId: bill.id, invoiceIds };
    });

    return {
      ok: true,
      billId: result.billId,
      billingMonth,
      unitsConsumed,
      totalPaise,
      monthlyOccupantCount: totalMonthlyBedShares,
      perResidentPaise,
      roundingRemainderPaise: remainderPaise,
      invoiceIds: result.invoiceIds,
      dueDate: dueDateIso,
    };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      // Duplicate on (room_id, billing_month) → already-exists.
      const [existing] = await db
        .select({ id: electricityBills.id })
        .from(electricityBills)
        .where(
          and(
            eq(electricityBills.roomId, input.roomId),
            eq(electricityBills.billingMonth, billingMonth),
          ),
        )
        .limit(1);
      if (existing) {
        return { ok: false, kind: 'already_exists', existingBillId: existing.id };
      }
    }
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// recordElectricityPaymentSuccess — webhook entry point (idempotent)
// ───────────────────────────────────────────────────────────────────────────

export async function recordElectricityPaymentSuccess(
  input: RecordElectricityPaymentSuccessInput,
): Promise<
  | { ok: true; paymentId: string; invoiceId: string; stateChanged: boolean }
  | { ok: false; reason: string }
> {
  const [invoice] = await db
    .select({
      id: electricityInvoices.id,
      bookingId: electricityInvoices.bookingId,
      customerId: electricityInvoices.customerId,
      billingMonth: electricityInvoices.billingMonth,
      status: electricityInvoices.status,
      amountPaise: electricityInvoices.amountPaise,
      dueDate: electricityInvoices.dueDate,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, input.invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, reason: `no electricity invoice ${input.invoiceId}` };
  if (invoice.status === 'cancelled') return { ok: false, reason: 'invoice cancelled' };

  // Snapshot the accrued late fee NOW so future renders don't keep
  // ticking up. `today` is "the moment of payment".
  const lockedLateFee = computeElectricityLateFee({
    amountPaise: invoice.amountPaise,
    dueDate: invoice.dueDate,
    today: formatDate(new Date()),
  });

  const provider = (input.offlineProvider ?? input.provider) as AnyPaymentProvider;

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, paymentId: existing.id, invoiceId: invoice.id, stateChanged: false };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: invoice.bookingId,
          purpose: 'electricity',
          provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: input.amountPaise,
          status: 'succeeded',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
          paidAt: new Date(),
        })
        .returning({ id: payments.id });

      await tx
        .update(electricityInvoices)
        .set({
          status: 'paid',
          paidPaise: invoice.amountPaise + lockedLateFee,
          lateFeeLockedPaise: lockedLateFee,
          paymentId: payment.id,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, invoice.id));

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'electricity_invoice',
        entityId: invoice.id,
        action: 'paid',
        diff: {
          provider,
          providerPaymentId: input.providerPaymentId,
          amountPaise: input.amountPaise,
          principalPaise: invoice.amountPaise,
          lateFeeLockedPaise: lockedLateFee,
        },
      });

      return { paymentId: payment.id };
    });

    const { notifyPaymentReceipt } = await import('@/src/lib/email/notifications');
    notifyPaymentReceipt({
      customerId: invoice.customerId,
      purpose: 'electricity',
      amountPaise: input.amountPaise,
      reference: invoice.billingMonth,
    });

    return { ok: true, paymentId: result.paymentId, invoiceId: invoice.id, stateChanged: true };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const [reread] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.provider, provider),
            eq(payments.providerPaymentId, input.providerPaymentId),
          ),
        )
        .limit(1);
      if (reread) return { ok: true, paymentId: reread.id, invoiceId: invoice.id, stateChanged: false };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

export async function recordElectricityPaymentFailure(input: {
  provider: ProviderName;
  providerPaymentId: string;
  providerOrderId?: string | null;
  invoiceId: string;
  reason: string;
  rawPayload?: unknown;
}): Promise<{ ok: boolean; paymentId?: string; stateChanged?: boolean; reason?: string }> {
  const [invoice] = await db
    .select({ id: electricityInvoices.id, bookingId: electricityInvoices.bookingId })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, input.invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, reason: `no electricity invoice ${input.invoiceId}` };

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, input.provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, paymentId: existing.id, stateChanged: false };
  }

  try {
    const [payment] = await db
      .insert(payments)
      .values({
        bookingId: invoice.bookingId,
        purpose: 'electricity',
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId ?? null,
        amountPaise: 0,
        status: 'failed',
        rawPayload: (input.rawPayload as object | undefined) ?? null,
      })
      .returning({ id: payments.id });

    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'electricity_invoice',
      entityId: invoice.id,
      action: 'payment_failed',
      diff: { provider: input.provider, reason: input.reason },
    });
    return { ok: true, paymentId: payment.id, stateChanged: true };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const [reread] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.provider, input.provider),
            eq(payments.providerPaymentId, input.providerPaymentId),
          ),
        )
        .limit(1);
      if (reread) return { ok: true, paymentId: reread.id, stateChanged: false };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

/** Cancel all electricity invoices for a booking. Used on vacating-complete. */
export async function cancelElectricityInvoicesForBooking(
  bookingId: string,
): Promise<{ cancelled: number }> {
  const rows = await db
    .update(electricityInvoices)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .returning({ id: electricityInvoices.id });
  return { cancelled: rows.length };
}
