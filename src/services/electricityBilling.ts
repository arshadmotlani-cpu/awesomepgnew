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
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { formatPostgresError } from '@/src/lib/db/postgresError';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  payments,
  roomElectricityPrepaidLedger,
  rooms,
} from '../db/schema';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { composeElectricityBillBreakdown, loadElectricityBillBreakdown, personalizeElectricityBreakdown } from '@/src/lib/billing/buildElectricityBillBreakdown';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import type { NewElectricityInvoice } from '../db/schema/electricityInvoices';
import { diffDays, formatDate, parseDate, type DateLike } from '../lib/dates';
import {
  ELECTRICITY_GRACE_DAYS,
  computeElectricityLateFee,
  electricityDueDate,
  firstOfMonth,
  monthBounds,
} from './billing';
import type { ElectricityInvoice } from '../db/schema';
import type { AnyPaymentProvider } from './bookingLifecycle';
import type { ProviderName } from './payments';
import {
  listCheckoutElectricityLedgerForRoomMonth,
} from './electricitySettlementLedger';
import { logElectricityBillCreate } from '../lib/billing/electricityBillCreateLog';
import { allocateMonthlyElectricityInvoices } from '../lib/billing/roomElectricityMonthlyAllocation';
import { syncRoomElectricityLedgerCycleFromBillInTx, recordMonthlyInvoiceCollectionInTx } from './roomElectricityLedger';
import { findActiveElectricityInvoiceForResidentMonth } from './electricityInvoiceDuplicates';
import { sumManualElectricityCreditsForRoomMonth } from './electricitySettlementLedgerView';
import { loadRoomElectricityContributionsForMonth } from './electricityRoomContributions';
import { getElectricityInvoiceSchemaCaps } from '@/src/lib/db/electricityInvoiceSchemaCaps';
import { fetchElectricityInvoiceById } from '@/src/lib/db/electricityInvoiceSelect';
import { validateContinuousPreviousReading } from '@/src/lib/billing/roomMeterReadingSsot';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';

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
  /** When true, split by active days in billing month (mid-month check-ins). */
  useProRataByActiveDays?: boolean;
  /** June 2026 batch: include fixed_stay occupants who overlap the billing month. */
  includeFixedStayOccupants?: boolean;
  /** Correlates structured logs across action + service. */
  requestId?: string;
  /**
   * Repair / historical backfill only. Production month-end bills must use the
   * continuous previous reading from the last finalized monthly bill.
   */
  allowPreviousReadingOverride?: boolean;
};

export type CreateElectricityBillResult =
      | {
      ok: true;
      billId: string;
      billingMonth: string; // YYYY-MM-01
      unitsConsumed: number;
      totalPaise: number;
      prepaidCreditAppliedPaise: number;
      checkoutCreditAppliedPaise: number;
      netSplittablePaise: number;
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
  effectiveStatus: 'pending' | 'partial' | 'overdue' | 'paid' | 'cancelled';
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
  const outstandingPaise = Math.max(0, invoice.amountPaise + accrued - invoice.paidPaise);
  const hasPartial = outstandingPaise > 0 && invoice.paidPaise > 0;
  const effectiveStatus = hasPartial
    ? 'partial'
    : accrued > 0
      ? 'overdue'
      : 'pending';
  return {
    invoice,
    effectiveStatus,
    accruedLateFeePaise: accrued,
    outstandingPaise,
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
  paidAt?: Date;
  historical?: boolean;
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
type DbExecutor = Pick<typeof db, 'select'>;

export async function nextElectricityInvoiceNumber(
  billingMonth: DateLike,
  attempt = 0,
  executor: DbExecutor = db,
): Promise<string> {
  const label = monthLabel(billingMonth);
  const month = firstOfMonth(billingMonth);
  const [{ maxSeq }] = await executor
    .select({
      maxSeq: sql<number>`coalesce(max(
        nullif(substring(${electricityInvoices.invoiceNumber} from '[0-9]+$'), '')::int
      ), 0)::int`,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.billingMonth, month));
  const seq = (maxSeq ?? 0) + 1 + attempt;
  return `${INVOICE_PREFIX}-${label}-${String(seq).padStart(4, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// createElectricityBill — transactional fan-out
// ───────────────────────────────────────────────────────────────────────────

export async function createElectricityBill(
  input: CreateElectricityBillInput,
): Promise<CreateElectricityBillResult> {
  const requestId = input.requestId ?? crypto.randomUUID();

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

  const baseline = await resolveRoomPreviousMeterReading(input.roomId);
  const continuity = validateContinuousPreviousReading({
    providedPreviousUnits: input.previousReadingUnits,
    expectedPreviousUnits: baseline.previousReadingUnits,
    allowOverride: input.allowPreviousReadingOverride,
  });
  if (!continuity.ok) {
    return { ok: false, kind: 'invalid_input', message: continuity.message };
  }

  const unitsConsumed = roundToHundredth(
    input.currentReadingUnits - input.previousReadingUnits,
  );
  const billingMonth = firstOfMonth(input.billingMonth);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  // 1. Resolve room → pg + pending offline prepaid credit.
  const [room] = await db
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      pgId: sql<string>`(SELECT pg_id FROM floors WHERE id = ${rooms.floorId} LIMIT 1)`,
      prepaidCreditPaise: rooms.electricityPrepaidCreditPaise,
    })
    .from(rooms)
    .where(eq(rooms.id, input.roomId))
    .limit(1);
  if (!room || !room.pgId) return { ok: false, kind: 'no_such_room' };

  logElectricityBillCreate('room_resolved', {
    requestId,
    roomId: input.roomId,
    pgId: room.pgId,
    roomNumber: room.roomNumber,
    prepaidCreditPaise: room.prepaidCreditPaise ?? 0,
  });

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
  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth,
    includeFixedStay: Boolean(input.includeFixedStayOccupants),
    useProRataByActiveDays: Boolean(input.useProRataByActiveDays),
  });

  const totalOccupantsAll = occupantLoad.occupants.reduce((acc, o) => acc + o.bedCount, 0);
  const totalWeight = occupantLoad.totalWeight;
  const checkoutCollectedByCustomerId = occupantLoad.checkoutCollectedByCustomerId;

  if (occupantLoad.excludedCustomerIds.length > 0) {
    logElectricityBillCreate('checkout_settled_excluded', {
      requestId,
      excludedCustomerIds: occupantLoad.excludedCustomerIds,
    });
  }

  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    input.roomId,
    billingMonth,
  );
  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    input.roomId,
    billingMonth,
  );

  const grossTotalPaise = Math.round(unitsConsumed * input.ratePerUnitPaise);
  const activeBedCount = await countActiveBedsInRoom(input.roomId);
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: room.prepaidCreditPaise ?? 0,
    contributionsByCustomerId:
      contributionsLoad.contributions.length > 0 ? contributionsLoad.byCustomerId : undefined,
    manualCreditPaise: contributionsLoad.contributions.length > 0 ? undefined : manualCreditPaise,
    occupants: occupantLoad.occupants,
    checkoutCollectedByCustomerId,
    useProRata: Boolean(input.useProRataByActiveDays && totalWeight > 0),
    activeBedCount,
  });

  const prepaidCreditAppliedPaise = allocation.prepaidCreditAppliedPaise;
  const checkoutCreditAppliedPaise = allocation.checkoutCreditAppliedPaise;
  const manualCreditAppliedPaise = allocation.manualCreditAppliedPaise;
  const netSplittablePaise = allocation.netSplittablePaise;
  const perResidentPaise = allocation.perResidentPaise;
  const remainderPaise = allocation.remainderPaise;
  const billableOccupantCount = allocation.billableOccupantCount;

  logElectricityBillCreate('occupants_loaded', {
    requestId,
    monthlyOccupantCount: totalOccupantsAll,
    billableOccupantCount,
    activeBedCount,
    bookingCount: occupantLoad.occupants.length,
    checkoutPayerCount: checkoutCollectedByCustomerId.size,
  });

  logElectricityBillCreate('bill_calculated', {
    requestId,
    billingMonth,
    unitsConsumed,
    grossTotalPaise,
    prepaidCreditAppliedPaise,
    checkoutCollectedPaise: checkoutCreditAppliedPaise,
    checkoutCreditAppliedPaise,
    manualCreditAppliedPaise,
    netSplittablePaise,
    useProRata: input.useProRataByActiveDays && totalWeight > 0,
    excludedCheckoutResidents: allocation.invoices.filter((i) => i.excludedBecauseCheckoutPaid).length,
  });

  const useProRata = Boolean(input.useProRataByActiveDays && totalWeight > 0);
  const invoiceAllocationByBooking = new Map(
    allocation.invoices
      .filter((line) => !line.excludedBecauseCheckoutPaid && line.amountPaise > 0)
      .map((line) => [line.bookingId, line.amountPaise]),
  );

  // Invoice due date = bill issuance date + 3 days. We pick the date
  // once here (not per-invoice) so every invoice in the fan-out shares
  // the same deadline.
  const issuedAt = new Date();
  const dueDateIso = formatDate(electricityDueDate(issuedAt));

  // 3. Transactional insert.
  type PendingNotify = {
    customerId: string;
    amountPaise: number;
  };
  const pendingNotifications: PendingNotify[] = [];
  let prepaidCreditNote: string | null = null;
  const invoiceSchemaCaps = await getElectricityInvoiceSchemaCaps();

  try {
    logElectricityBillCreate('transaction_started', { requestId });
    const result = await db.transaction(async (tx) => {
      if (prepaidCreditAppliedPaise > 0) {
        const [latestAdded] = await tx
          .select({ paidByNote: roomElectricityPrepaidLedger.paidByNote })
          .from(roomElectricityPrepaidLedger)
          .where(
            and(
              eq(roomElectricityPrepaidLedger.roomId, input.roomId),
              eq(roomElectricityPrepaidLedger.entryKind, 'added'),
            ),
          )
          .orderBy(sql`${roomElectricityPrepaidLedger.createdAt} DESC`)
          .limit(1);
        prepaidCreditNote = latestAdded?.paidByNote ?? 'Previous tenant offline payment';
      }

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
          totalPaise: grossTotalPaise,
          monthlyOccupantCount: totalOccupantsAll,
          perResidentPaise,
          roundingRemainderPaise: remainderPaise,
          prepaidCreditAppliedPaise,
          prepaidCreditNote,
          checkoutCreditAppliedPaise,
          createdByAdminId: input.createdByAdminId ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: electricityBills.id });

      logElectricityBillCreate('bill_inserted', {
        requestId,
        billId: bill.id,
        grossTotalPaise,
      });

      const invoiceIds: string[] = [];
      if (invoiceAllocationByBooking.size > 0 && netSplittablePaise > 0) {
        type CustomerInvoiceDraft = {
          bookingId: string;
          customerId: string;
          bedId: string;
          amountPaise: number;
          unitsShare: number;
          activeDays: number;
        };
        const byCustomer = new Map<string, CustomerInvoiceDraft>();
        for (const bk of occupantLoad.occupants) {
          const amount = invoiceAllocationByBooking.get(bk.bookingId);
          if (amount == null || amount <= 0) continue;

          const unitsShare = useProRata
            ? roundToHundredth((unitsConsumed * bk.weight) / totalWeight)
            : roundToHundredth(
                (unitsConsumed * bk.bedCount) / Math.max(1, activeBedCount),
              );
          const activeDays = useProRata ? bk.weight : occupantLoad.daysInMonth;
          const representativeBed = [...bk.bedIds].sort()[0]!;
          const existing = byCustomer.get(bk.customerId);
          if (existing) {
            existing.amountPaise += amount;
            existing.unitsShare = roundToHundredth(existing.unitsShare + unitsShare);
            existing.activeDays += activeDays;
          } else {
            byCustomer.set(bk.customerId, {
              bookingId: bk.bookingId,
              customerId: bk.customerId,
              bedId: representativeBed,
              amountPaise: amount,
              unitsShare,
              activeDays,
            });
          }
        }

        for (const draft of byCustomer.values()) {
          const existingInvoice = await findActiveElectricityInvoiceForResidentMonth({
            roomId: input.roomId,
            billingMonth,
            customerId: draft.customerId,
            executor: tx,
          });
          if (existingInvoice) {
            invoiceIds.push(existingInvoice.id);
            logElectricityBillCreate('invoice_reused_existing', {
              requestId,
              billId: bill.id,
              invoiceId: existingInvoice.id,
              customerId: draft.customerId,
            });
            continue;
          }

          let inserted: { id: string } | null = null;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const invoiceNumber = await nextElectricityInvoiceNumber(
              billingMonth,
              attempt + invoiceIds.length,
              tx,
            );
            const savepoint = `inv_try_${attempt}`;
            await tx.execute(sql.raw(`SAVEPOINT "${savepoint}"`));
            try {
              const invoiceValues = {
                invoiceNumber,
                electricityBillId: bill.id,
                bookingId: draft.bookingId,
                customerId: draft.customerId,
                bedId: draft.bedId,
                billingMonth,
                dueDate: dueDateIso,
                amountPaise: draft.amountPaise,
                unitsShare: draft.unitsShare.toString(),
                activeDays: draft.activeDays,
                status: 'pending' as const,
                ...(invoiceSchemaCaps.roomId ? { roomId: input.roomId } : {}),
              };
              const [row] = await tx
                .insert(electricityInvoices)
                .values(invoiceValues as NewElectricityInvoice)
                .returning({ id: electricityInvoices.id });
              inserted = row;
              await tx.execute(sql.raw(`RELEASE SAVEPOINT "${savepoint}"`));
              break;
            } catch (err) {
              await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`));
              if (pgErrorCode(err) === '23505') {
                const reused = await findActiveElectricityInvoiceForResidentMonth({
                  roomId: input.roomId,
                  billingMonth,
                  customerId: draft.customerId,
                  executor: tx,
                });
                if (reused) {
                  inserted = { id: reused.id };
                  break;
                }
                continue;
              }
              throw err;
            }
          }
          if (inserted) {
            invoiceIds.push(inserted.id);
            pendingNotifications.push({
              customerId: draft.customerId,
              amountPaise: draft.amountPaise,
            });
          }
        }
      }

      logElectricityBillCreate('invoices_created', {
        requestId,
        billId: bill.id,
        invoiceCount: invoiceIds.length,
      });

      if (prepaidCreditAppliedPaise > 0) {
        await tx
          .update(rooms)
          .set({
            electricityPrepaidCreditPaise: sql`${rooms.electricityPrepaidCreditPaise} - ${prepaidCreditAppliedPaise}`,
            updatedAt: new Date(),
          })
          .where(eq(rooms.id, input.roomId));

        await tx.insert(roomElectricityPrepaidLedger).values({
          roomId: input.roomId,
          entryKind: 'applied',
          amountPaise: prepaidCreditAppliedPaise,
          paidByNote: prepaidCreditNote,
          electricityBillId: bill.id,
          createdByAdminId: input.createdByAdminId ?? null,
        });
      }

      await syncRoomElectricityLedgerCycleFromBillInTx(tx, {
        roomId: input.roomId,
        billingMonth,
        totalBillPaise: grossTotalPaise,
        electricityBillId: bill.id,
      });
      logElectricityBillCreate('ledger_applied', {
        requestId,
        billId: bill.id,
        checkoutCreditAppliedPaise,
      });

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
          grossTotalPaise,
          prepaidCreditAppliedPaise,
          checkoutCreditAppliedPaise,
          netSplittablePaise,
          monthlyOccupantCount: totalOccupantsAll,
          perResidentPaise,
          dueDate: dueDateIso,
          graceDays: ELECTRICITY_GRACE_DAYS,
          invoicesCreated: invoiceIds.length,
        },
      });

      return { billId: bill.id, invoiceIds };
    });

    logElectricityBillCreate('transaction_committed', {
      requestId,
      billId: result.billId,
      invoiceCount: result.invoiceIds.length,
    });

    const calculationBreakdown = await composeElectricityBillBreakdown({
      roomId: input.roomId,
      roomNumber: room.roomNumber,
      billingMonth,
      previousReadingUnits: input.previousReadingUnits,
      currentReadingUnits: input.currentReadingUnits,
      ratePerUnitPaise: input.ratePerUnitPaise,
      grossTotalPaise,
      prepaidCreditPaise: prepaidCreditAppliedPaise,
      prepaidCreditNote,
      manualCreditPaise: manualCreditAppliedPaise,
      checkoutCreditAppliedPaise,
      remainingBillPaise: netSplittablePaise,
      useProRata,
      occupantLoad,
      invoiceAmountByBookingId: invoiceAllocationByBooking,
      previousContributions: contributionsLoad.contributions.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        amountPaise: row.amountPaise,
        kind: row.kind,
        reason: row.reason,
        contributionDate: row.contributionDate,
        occupancyStart: row.occupancyStart,
        occupancyEnd: row.occupancyEnd,
      })),
    });

    await db
      .update(electricityBills)
      .set({ calculationBreakdown, updatedAt: new Date() })
      .where(eq(electricityBills.id, result.billId));

    const { notifyElectricityReminder } = await import('@/src/lib/email/notifications');
    for (const n of pendingNotifications) {
      notifyElectricityReminder({
        customerId: n.customerId,
        billingMonth,
        amountPaise: n.amountPaise,
        dueDate: dueDateIso,
        roomNumber: room.roomNumber,
        grossRoomTotalPaise: grossTotalPaise,
        prepaidCreditAppliedPaise,
        prepaidCreditNote,
      });
    }

    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(result.invoiceIds, 'electricity').catch((syncErr) => {
      logElectricityBillCreate('failed', {
        requestId,
        step: 'unified_sync',
        message: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    });
    logElectricityBillCreate('unified_sync_scheduled', {
      requestId,
      invoiceCount: result.invoiceIds.length,
    });

    const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
    scheduleAdminNotificationSync();

    return {
      ok: true,
      billId: result.billId,
      billingMonth,
      unitsConsumed,
      totalPaise: grossTotalPaise,
      prepaidCreditAppliedPaise,
      checkoutCreditAppliedPaise,
      netSplittablePaise,
      monthlyOccupantCount: totalOccupantsAll,
      perResidentPaise,
      roundingRemainderPaise: remainderPaise,
      invoiceIds: result.invoiceIds,
      dueDate: dueDateIso,
    };
  } catch (err) {
    logElectricityBillCreate('failed', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
      code: pgErrorCode(err),
    });
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
  const invoice = await fetchElectricityInvoiceById(input.invoiceId);
  if (!invoice) return { ok: false, reason: `no electricity invoice ${input.invoiceId}` };
  if (invoice.status === 'cancelled') return { ok: false, reason: 'invoice cancelled' };
  if (invoice.status === 'paid') {
    return { ok: true, paymentId: '', invoiceId: invoice.id, stateChanged: false };
  }

  const projected = projectElectricityInvoice(invoice as ElectricityInvoice);
  if (input.amountPaise <= 0) return { ok: false, reason: 'payment amount must be > 0' };
  if (input.amountPaise > projected.outstandingPaise) {
    return {
      ok: false,
      reason: `payment ${input.amountPaise} exceeds outstanding ${projected.outstandingPaise}`,
    };
  }

  const lockedLateFee = computeElectricityLateFee({
    amountPaise: invoice.amountPaise,
    dueDate: invoice.dueDate,
    today: formatDate(new Date()),
  });
  const newPaidPaise = invoice.paidPaise + input.amountPaise;
  const totalDue = invoice.amountPaise + lockedLateFee;
  const fullyPaid = newPaidPaise >= totalDue;
  const paidAt = input.paidAt ?? new Date();

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

  const [bill] = await db
    .select({
      roomId: electricityBills.roomId,
      totalPaise: electricityBills.totalPaise,
    })
    .from(electricityBills)
    .where(eq(electricityBills.id, invoice.electricityBillId))
    .limit(1);

  let paymentId: string;
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
          paidAt,
        })
        .returning({ id: payments.id });

      await tx
        .update(electricityInvoices)
        .set({
          status: fullyPaid ? 'paid' : 'pending',
          paidPaise: newPaidPaise,
          lateFeeLockedPaise: fullyPaid ? lockedLateFee : invoice.lateFeeLockedPaise,
          paymentId: fullyPaid ? payment.id : undefined,
          paidAt: fullyPaid ? paidAt : undefined,
          paymentProofUrl: fullyPaid ? null : invoice.paymentProofUrl,
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, invoice.id));

      if (bill?.roomId) {
        await recordMonthlyInvoiceCollectionInTx(tx, {
          roomId: bill.roomId,
          billingMonth: String(invoice.billingMonth),
          totalBillPaise: bill.totalPaise,
          customerId: invoice.customerId,
          bookingId: invoice.bookingId,
          amountPaise: input.amountPaise,
          electricityInvoiceId: invoice.id,
        });
      }

      const {
        syncElectricityInvoiceToUnifiedInTx,
        recordBillingSettlementEventInTx,
      } = await import('@/src/lib/billing/syncUnifiedInvoiceInTx');
      const unifiedInvoiceId = await syncElectricityInvoiceToUnifiedInTx(tx, invoice.id);
      await recordBillingSettlementEventInTx(tx, {
        purpose: 'electricity',
        sourceTable: 'electricity_invoices',
        sourceInvoiceId: invoice.id,
        paymentId: payment.id,
        unifiedInvoiceId,
        providerPaymentId: input.providerPaymentId,
        amountPaise: input.amountPaise,
      });

      return { paymentId: payment.id };
    });
    paymentId = result.paymentId;
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
    return { ok: false, reason: formatPostgresError(err) };
  }

  const auditResult = await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    entity: 'electricity_invoice',
    entityId: invoice.id,
    action: fullyPaid ? 'paid' : 'partial_payment',
    diff: {
      provider,
      providerPaymentId: input.providerPaymentId,
      amountPaise: input.amountPaise,
      paidPaise: newPaidPaise,
      outstandingPaise: Math.max(0, totalDue - newPaidPaise),
    },
  });
  if (!auditResult.ok) {
    console.error(
      '[electricity-payment] payment recorded but audit_log insert failed',
      auditResult.error,
    );
  }

  if (!input.historical) {
    try {
      const { notifyPaymentReceipt } = await import('@/src/lib/email/notifications');
      notifyPaymentReceipt({
        customerId: invoice.customerId,
        purpose: 'electricity',
        amountPaise: input.amountPaise,
        reference: invoice.billingMonth,
      });
    } catch (notifyErr) {
      console.error('[electricity-payment] receipt notification failed', notifyErr);
    }
  }

  return { ok: true, paymentId, invoiceId: invoice.id, stateChanged: true };
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

/** Cancel unpaid invoices and delete room electricity bill(s) for a billing month. */
export async function voidRoomElectricityBillsForMonth(
  roomId: string,
  billingMonth: string,
): Promise<{ cancelledInvoiceIds: string[]; deletedBillIds: string[] }> {
  const month = firstOfMonth(billingMonth);
  const bills = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(and(eq(electricityBills.roomId, roomId), eq(electricityBills.billingMonth, month)));

  const cancelledInvoiceIds: string[] = [];
  for (const bill of bills) {
    const cancelled = await db
      .update(electricityInvoices)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(electricityInvoices.electricityBillId, bill.id),
          sql`${electricityInvoices.status} <> 'cancelled'`,
          sql`${electricityInvoices.paidPaise} = 0`,
        ),
      )
      .returning({ id: electricityInvoices.id });
    cancelledInvoiceIds.push(...cancelled.map((r) => r.id));
  }

  if (cancelledInvoiceIds.length > 0) {
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(cancelledInvoiceIds, 'electricity').catch(() => undefined);
  }

  const deletedBillIds: string[] = [];
  for (const bill of bills) {
    const ledgerLinked = await db.execute<{ id: string }>(sql`
      SELECT rel.id
      FROM room_electricity_ledger_entries rel
      INNER JOIN electricity_invoices ei ON ei.id = rel.electricity_invoice_id
      WHERE ei.electricity_bill_id = ${bill.id}::uuid
      LIMIT 1
    `);
    if (Array.isArray(ledgerLinked) && ledgerLinked.length > 0) {
      continue;
    }
    await db.delete(electricityBills).where(eq(electricityBills.id, bill.id));
    deletedBillIds.push(bill.id);
  }

  return { cancelledInvoiceIds, deletedBillIds };
}

/** Cancel all electricity invoices for a booking. Used on vacating-complete. */
export async function cancelElectricityInvoicesForBooking(
  bookingId: string,
): Promise<{ cancelled: number; ids: string[] }> {
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
  if (rows.length > 0) {
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(
      rows.map((r) => r.id),
      'electricity',
    );
  }
  return { cancelled: rows.length, ids: rows.map((r) => r.id) };
}

export type RoomMissingElectricityRow = {
  roomId: string;
  roomNumber: string;
  pgId: string;
  pgName: string;
};

/** Rooms with monthly occupants in the billing month but no electricity bill yet. */
export async function listRoomsMissingElectricityBill(
  billingMonth: DateLike,
): Promise<RoomMissingElectricityRow[]> {
  const month = firstOfMonth(billingMonth);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const rows = await db.execute<{
    room_id: string;
    room_number: string;
    pg_id: string;
    pg_name: string;
  }>(sql`
    SELECT DISTINCT
      r.id::text AS room_id,
      r.room_number,
      p.id::text AS pg_id,
      p.name AS pg_name
    FROM rooms r
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    INNER JOIN beds bd ON bd.room_id = r.id AND bd.archived_at IS NULL AND bd.status != 'maintenance'
    INNER JOIN bed_reservations br ON br.bed_id = bd.id
    INNER JOIN bookings b ON b.id = br.booking_id
    INNER JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.archived_at IS NULL
      AND p.archived_at IS NULL
      AND rt.has_ac = true
      AND br.status = 'active'
      AND b.status = 'confirmed'
      AND b.duration_mode IN ('monthly', 'open_ended')
      AND br.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')
      AND NOT EXISTS (
        SELECT 1 FROM electricity_bills eb
        WHERE eb.room_id = r.id AND eb.billing_month = ${month}::date
      )
    ORDER BY p.name, r.room_number
  `);

  return rows.map((row) => ({
    roomId: row.room_id,
    roomNumber: row.room_number,
    pgId: row.pg_id,
    pgName: row.pg_name,
  }));
}

/** Load transparent calculation breakdown for a resident electricity invoice. */
export async function getElectricityBreakdownForInvoice(
  electricityInvoiceId: string,
): Promise<{
  breakdown: ElectricityBillCalculationBreakdown;
  viewer: ReturnType<typeof personalizeElectricityBreakdown>['viewer'];
} | null> {
  const [row] = await db
    .select({
      customerId: electricityInvoices.customerId,
      electricityBillId: electricityInvoices.electricityBillId,
      amountPaise: electricityInvoices.amountPaise,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, electricityInvoiceId))
    .limit(1);
  if (!row) return null;

  const breakdown = await loadElectricityBillBreakdown(row.electricityBillId);
  if (!breakdown) return null;

  const { viewer } = personalizeElectricityBreakdown(breakdown, row.customerId);
  if (viewer) {
    viewer.amountPayablePaise = row.amountPaise;
  }

  return { breakdown, viewer };
}
