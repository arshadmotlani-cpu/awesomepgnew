/**
 * Read-only September 2026 rent reconciliation audit for APG-2026-0021 (Rishik).
 * Production mutation count: 0
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl();

const BOOKING_CODE = 'APG-2026-0021';

function paiseToRupee(p: number): string {
  return `₹${(p / 100).toFixed(2)}`;
}

async function main(): Promise<void> {
  const [booking] = await db.execute<{
    id: string;
    customer_id: string;
    booking_code: string;
    status: string;
    subtotal_paise: number;
    deposit_paise: number;
    deposit_due_paise: number;
  }>(sql`
    SELECT id, customer_id, booking_code, status,
      subtotal_paise::bigint::int, deposit_paise::bigint::int, deposit_due_paise::bigint::int
    FROM bookings WHERE booking_code = ${BOOKING_CODE} LIMIT 1
  `);
  if (!booking) throw new Error('Booking not found');

  const customerId = booking.customer_id;

  const reservations = await db.execute(sql`
    SELECT br.id, br.kind, br.status, br.stay_range::text AS stay_range,
      b.bed_code, r.room_number, rt.name AS room_type, rt.default_capacity
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN room_types rt ON rt.id = r.room_type_id
    WHERE br.booking_id = ${booking.id}
    ORDER BY lower(br.stay_range)
  `);

  const roomChanges = await db.execute(sql`
    SELECT rcr.id, rcr.status, rcr.requested_shift_date::text, rcr.expected_transfer_date::text,
      rcr.transfer_mode, rcr.completed_at::text, rcr.created_at::text,
      fb.bed_code AS from_bed, fr.room_number AS from_room,
      tb.bed_code AS to_bed, tr.room_number AS to_room,
      rcr.quote_snapshot
    FROM room_change_requests rcr
    JOIN beds fb ON fb.id = rcr.from_bed_id
    JOIN rooms fr ON fr.id = fb.room_id
    JOIN beds tb ON tb.id = rcr.to_bed_id
    JOIN rooms tr ON tr.id = tb.room_id
    WHERE rcr.booking_id = ${booking.id}
    ORDER BY rcr.created_at
  `);

  const rentInvoices = await db.execute(sql`
    SELECT id, invoice_number, billing_month::text, status,
      rent_paise::bigint::int, paid_principal_paise::bigint::int,
      cancelled_at::text, created_at::text, notes
    FROM rent_invoices
    WHERE booking_id = ${booking.id}
    ORDER BY billing_month, created_at
  `);

  const financialInvoices = await db.execute(sql`
    SELECT id, invoice_number, source_table, source_id, status, invoice_type,
      amount_paise::bigint::int, due_date::text, notes, created_at::text,
      payment_id IS NOT NULL AS has_payment
    FROM financial_invoices
    WHERE booking_id = ${booking.id}
    ORDER BY created_at
  `);

  const credits = await db.execute(sql`
    SELECT id, entry_kind, amount_paise::bigint::int, reason, created_at::text
    FROM resident_credit_ledger
    WHERE customer_id = ${customerId}
    ORDER BY created_at
  `);

  const depositLedger = await db.execute(sql`
    SELECT entry_kind, amount_paise::bigint::int, reason, created_at::text
    FROM deposit_ledger
    WHERE booking_id = ${booking.id}
    ORDER BY created_at
  `);

  const payments = await db.execute(sql`
    SELECT p.id, p.status, p.amount_paise::bigint::int, p.paid_at::text, p.purpose, p.provider
    FROM payments p
    WHERE p.booking_id = ${booking.id}
    ORDER BY p.created_at DESC
    LIMIT 50
  `);

  const bedPrices = await db.execute(sql`
    SELECT b.bed_code, r.room_number, bp.effective_from::text, bp.monthly_rate_paise::bigint::int
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    LEFT JOIN bed_prices bp ON bp.bed_id = b.id
    WHERE br.booking_id = ${booking.id}
    ORDER BY r.room_number, bp.effective_from
  `);

  const [customerRow] = await db.execute<{ full_name: string; phone: string }>(sql`
    SELECT full_name, phone FROM customers WHERE id = ${customerId} LIMIT 1
  `);

  const [location] = await db.execute<{ pg_id: string; pg_name: string; room_number: string }>(sql`
    SELECT p.id AS pg_id, p.name AS pg_name, r.room_number
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${booking.id} AND br.status = 'active'
    LIMIT 1
  `);

  const { getResidentFinancialAccount } = await import('../src/services/residentFinancialEngine');
  const { listResidentFinancialInvoiceDueRows } = await import(
    '../src/lib/residents/residentFinancialInvoiceDueRows'
  );
  const { resolvePostTransferMonthlyRentPaise } = await import(
    '../src/lib/billing/postTransferRentPricing'
  );
  const {
    occupiedBeforeShiftInBillingMonth,
    remainingInBillingMonth,
    settleRoomShiftRentSides,
  } = await import('../src/services/roomShiftQuote');

  const financialAccount = await getResidentFinancialAccount(customerId);
  const dueRows = await listResidentFinancialInvoiceDueRows(customerId);

  const activeRes = (reservations as Array<{ status: string; bed_code: string; room_number: string }>).find(
    (r) => r.status === 'active',
  );
  const octoberExpected =
    activeRes != null
      ? await resolvePostTransferMonthlyRentPaise(
          (
            await db.execute<{ bed_id: string }>(sql`
              SELECT br.bed_id::text AS bed_id FROM bed_reservations br
              WHERE br.booking_id = ${booking.id} AND br.status = 'active' LIMIT 1
            `)
          )[0]?.bed_id ?? '',
          '2026-09-04',
        )
      : null;

  const septRentRows = (rentInvoices as Array<{
    billing_month: string;
    status: string;
    rent_paise: number;
    paid_principal_paise: number;
    invoice_number: string;
  }>).filter((r) => r.billing_month.startsWith('2026-09'));

  const activeSeptRent = septRentRows.filter((r) => r.status !== 'cancelled');
  const cancelledSeptRent = septRentRows.filter((r) => r.status === 'cancelled');

  const rcRentInvoices = (financialInvoices as Array<{
    source_table: string;
    status: string;
    amount_paise: number;
    invoice_number: string;
    has_payment: boolean;
  }>).filter(
    (r) =>
      ['room_change_old_rent', 'room_change_new_rent'].includes(r.source_table) &&
      r.status !== 'cancelled',
  );
  const rcFee = (financialInvoices as Array<{ source_table: string; amount_paise: number; status: string }>).find(
    (r) => r.source_table === 'room_change_fee',
  );
  const rcDeposit = (financialInvoices as Array<{ source_table: string; amount_paise: number; status: string }>).find(
    (r) => r.source_table === 'room_change_deposit',
  );
  const rcPayAll = (financialInvoices as Array<{ source_table: string; amount_paise: number; status: string }>).find(
    (r) => r.source_table === 'room_change_pay_all',
  );

  const roomChangeRentPaise = rcRentInvoices.reduce((s, r) => s + r.amount_paise, 0);
  const roomChangeRentPaid = rcRentInvoices
    .filter((r) => r.status === 'paid' || r.has_payment)
    .reduce((s, r) => s + r.amount_paise, 0);

  const activeRentPaise = activeSeptRent.reduce((s, r) => s + r.rent_paise, 0);
  const activeRentPaid = activeSeptRent.reduce((s, r) => s + r.paid_principal_paise, 0);

  const latestRc = (roomChanges as Array<{ quote_snapshot: Record<string, unknown>; requested_shift_date: string }>)[
    roomChanges.length - 1
  ];
  const snap = latestRc?.quote_snapshot as Record<string, number> | undefined;
  const shiftDate = (snap?.shiftDate as string) ?? latestRc?.requested_shift_date ?? '2026-09-04';

  let canonicalProration: Record<string, number> | null = null;
  if (snap?.oldMonthlyRentPaise && snap?.newMonthlyRentPaise) {
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: snap.oldMonthlyRentPaise,
      newMonthlyRentPaise: snap.newMonthlyRentPaise,
      shiftDate,
      currentMonthRentIsPaid: Boolean(snap.currentMonthRentIsPaid),
    });
    canonicalProration = {
      oldOccupiedPaise: sides.oldOccupiedPaise,
      newRemainderPaise: sides.newRemainderPaise,
      totalRentPaise: sides.oldOccupiedPaise + sides.newRemainderPaise,
      unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
      oldRentDuePaise: sides.oldRentDuePaise,
    };
  }

  const targetSeptRentPaise = booking.subtotal_paise;
  const economicSeptRentPaise = roomChangeRentPaise + activeRentPaise;
  const economicSeptRentPaid = roomChangeRentPaid + activeRentPaid;

  const report = {
    productionMutationCount: 0,
    booking: {
      code: BOOKING_CODE,
      id: booking.id,
      customerId,
      subtotalPaise: booking.subtotal_paise,
      subtotalRupee: paiseToRupee(booking.subtotal_paise),
      depositPaise: booking.deposit_paise,
      depositDuePaise: booking.deposit_due_paise,
    },
    occupancy: reservations,
    roomChangeRequests: (roomChanges as Array<Record<string, unknown>>).map((rc) => ({
      id: rc.id,
      status: rc.status,
      shiftDate: (rc.quote_snapshot as Record<string, string>)?.shiftDate ?? rc.requested_shift_date,
      from: `${rc.from_room} ${rc.from_bed}`,
      to: `${rc.to_room} ${rc.to_bed}`,
      completedAt: rc.completed_at,
      quoteSummary: {
        oldMonthlyRentPaise: (rc.quote_snapshot as Record<string, number>)?.oldMonthlyRentPaise,
        newMonthlyRentPaise: (rc.quote_snapshot as Record<string, number>)?.newMonthlyRentPaise,
        oldRentDueAfterCreditPaise: (rc.quote_snapshot as Record<string, number>)?.oldRentDueAfterCreditPaise,
        newRentDuePaise: (rc.quote_snapshot as Record<string, number>)?.newRentDuePaise,
        feeDuePaise: (rc.quote_snapshot as Record<string, number>)?.feeDuePaise,
        depositDuePaise: (rc.quote_snapshot as Record<string, number>)?.depositDuePaise,
        totalDuePaise: (rc.quote_snapshot as Record<string, number>)?.totalDuePaise,
        unusedPrepaidCreditPaise: (rc.quote_snapshot as Record<string, number>)?.unusedPrepaidCreditPaise,
      },
    })),
    septemberRent: {
      cancelledInvoices: cancelledSeptRent,
      activeRentInvoices: activeSeptRent,
      roomChangeRentInvoices: rcRentInvoices,
      classification: {
        rentFromRoomChangePaise: roomChangeRentPaise,
        rentFromRoomChangeRupee: paiseToRupee(roomChangeRentPaise),
        rentFromActiveMonthlyPaise: activeRentPaise,
        economicSeptemberRentPaise: economicSeptRentPaise,
        economicSeptemberRentRupee: paiseToRupee(economicSeptRentPaise),
        targetSeptemberRentPaise: targetSeptRentPaise,
        targetSeptemberRentRupee: paiseToRupee(targetSeptRentPaise),
        rentGapPaise: targetSeptRentPaise - economicSeptRentPaise,
        rentPaidPaise: economicSeptRentPaid,
        remainingRentDuePaise: economicSeptRentPaise - economicSeptRentPaid,
        roomChangeFeePaise: rcFee?.amount_paise ?? 0,
        depositDifferencePaise: rcDeposit?.amount_paise ?? 0,
        payAllPaise: rcPayAll?.amount_paise ?? 0,
      },
      canonicalProration,
    },
    credits: credits,
    depositLedger,
    payments: payments.slice(0, 20),
    bedPrices,
    billsDue: financialAccount
      ? {
          outstandingPaise: financialAccount.totals.outstandingPaise,
          rentOutstandingPaise: financialAccount.rent.outstandingPaise,
          depositOutstandingPaise: financialAccount.deposit.outstandingPaise,
          openInvoiceCount: financialAccount.openInvoices?.length,
        }
      : null,
    dueRows: dueRows.filter((r) =>
      String(r.billingMonth ?? r.dueDate ?? '').includes('2026-09') ||
      r.sourceTable?.includes('room_change'),
    ),
    october: {
      expectedMonthlyRentPaise: octoberExpected,
      expectedMonthlyRentRupee: octoberExpected != null ? paiseToRupee(octoberExpected) : null,
      billingMonth: '2026-10-01',
      note: 'Engine preview only — October invoice not generated early',
    },
    rootCauseHints: [] as string[],
  };

  if (economicSeptRentPaise !== targetSeptRentPaise) {
    report.rootCauseHints.push(
      `Economic September rent ${paiseToRupee(economicSeptRentPaise)} ≠ target SSOT ${paiseToRupee(targetSeptRentPaise)} (gap ${paiseToRupee(targetSeptRentPaise - economicSeptRentPaise)})`,
    );
    if (canonicalProration && canonicalProration.totalRentPaise === economicSeptRentPaise) {
      report.rootCauseHints.push(
        'Room-change proration uses old-bed rate for pre-shift days + new-bed rate for post-shift days; sum may differ from new-bed full-month SSOT when rates differ.',
      );
    }
  }
  if (activeSeptRent.length > 0 && roomChangeRentPaise > 0) {
    report.rootCauseHints.push('Potential double billing: active September rent invoice AND room-change rent invoices coexist.');
  }
  if (cancelledSeptRent.length > 0 && roomChangeRentPaise > 0) {
    report.rootCauseHints.push(
      'Cancelled monthly September rent replaced by room-change rent waterfall (expected pattern).',
    );
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
