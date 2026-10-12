/* eslint-disable no-console */
/** Read-only PG Overview revenue audit — production DB via .env.prod.live */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-overview-revenue');

const BILLING_MONTH = process.env.BILLING_MONTH ?? '2026-10-01';
const AS_OF = process.env.AS_OF ?? '2026-10-05';

async function main() {
  const { getFinancialMetrics } = await import('../src/services/financialMetricsEngine');
  const { getExecutiveMetrics } = await import('../src/services/executiveMetrics');
  const { loadEstimatedRevenueSnapshot } = await import('../src/services/estimatedRevenueService');
  const {
    loadInvoiceOutstandingSnapshot,
    computeOutstandingMoneyFromInvoices,
  } = await import('../src/services/financialSummaryService');
  const { resolveMonthlyRentPaiseForBooking } = await import('../src/services/rentInvoices');
  const { fetchBedOccupancyRows } = await import('../src/services/bedOccupancyBatch');
  const { isBedStatusRentableForEstimatedRevenue } = await import('../src/lib/inventory/estimatedRevenue');
  const { sql, eq, and, inArray, ne } = await import('drizzle-orm');
  const { db, closeDb } = await import('../src/db/client');
  const { bookings, bedReservations, beds, customers, pgs, rentInvoices, floors, rooms } = await import(
    '../src/db/schema',
  );

  const session = {
    kind: 'admin' as const,
    sessionId: 'audit',
    adminId: 'audit',
    email: 'audit@local',
    fullName: 'Audit',
    role: 'super_admin' as const,
    pgScope: [] as string[],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86400000),
  };

  console.log('=== OVERVIEW METRIC RECONCILIATION ===');
  console.log('billingMonth', BILLING_MONTH, 'asOf', AS_OF);

  let estimatedErr: string | null = null;
  let estimated: Awaited<ReturnType<typeof loadEstimatedRevenueSnapshot>> | null = null;
  try {
    estimated = await loadEstimatedRevenueSnapshot({ asOfDate: AS_OF });
  } catch (e) {
    estimatedErr = e instanceof Error ? e.message : String(e);
  }

  const [fin, exec, invSnap] = await Promise.all([
    getFinancialMetrics(BILLING_MONTH),
    getExecutiveMetrics(BILLING_MONTH),
    loadInvoiceOutstandingSnapshot(session),
  ]);
  const outstanding = computeOutstandingMoneyFromInvoices(invSnap);
  const mtdOperating = fin.operating.operatingRevenuePaise;
  const collectionRateDenom = mtdOperating + outstanding.totalOutstandingPaise;
  const collectionRate =
    collectionRateDenom > 0 ? Math.round((mtdOperating / collectionRateDenom) * 1000) / 10 : 0;

  console.log('\n--- UI-aligned numbers ---');
  console.log('Operating Revenue MTD paise:', mtdOperating, 'INR', mtdOperating / 100);
  console.log('  rentPrincipal:', fin.operating.rentPrincipalPaise);
  console.log('  lateFee:', fin.operating.lateFeePaise);
  console.log('  electricity:', fin.operating.electricityPaise);
  console.log('  otherIncome:', fin.operating.otherIncomePaise);
  console.log(
    'Outstanding Collections paise:',
    outstanding.totalOutstandingPaise,
    'INR',
    outstanding.totalOutstandingPaise / 100,
  );
  console.log('Collection Rate %:', collectionRate);
  console.log('Executive occupancy:', exec.occupancyPct, '%', exec.occupiedBeds, '/', exec.totalBeds);
  if (estimatedErr) console.log('Estimated revenue ERROR (Overview would show ₹0):', estimatedErr);
  if (estimated) {
    console.log('Estimated monthly paise:', estimated.monthlyRevenuePaise, 'INR', estimated.monthlyRevenuePaise / 100);
    console.log('Estimated yearly paise:', estimated.yearlyRevenuePaise);
    console.log(
      'Estimated counts — rentable:',
      estimated.rentableBeds,
      'occupied:',
      estimated.occupiedBeds,
      'vacant rentable:',
      estimated.vacantRentableBeds,
    );
  }

  console.log('\n--- October invoice totals (read-only SQL) ---');
  const oct = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT coalesce(sum(rent_paise - discount_paise + coalesce(late_fee_locked_paise,0)),0)::bigint
       FROM rent_invoices ri
       JOIN bookings b ON b.id=ri.booking_id JOIN customers c ON c.id=ri.customer_id
       WHERE ri.billing_month=${BILLING_MONTH}::date AND ri.is_adhoc=false AND ri.status!='cancelled'
         AND b.is_test=false AND c.is_test=false) AS rent_billed_paise,
      (SELECT coalesce(sum(paid_principal_paise + paid_late_fee_paise),0)::bigint
       FROM rent_invoices ri
       JOIN bookings b ON b.id=ri.booking_id JOIN customers c ON c.id=ri.customer_id
       WHERE ri.billing_month=${BILLING_MONTH}::date AND ri.status='paid'
         AND b.is_test=false AND c.is_test=false) AS rent_paid_paise,
      (SELECT coalesce(sum((rent_paise-discount_paise+coalesce(late_fee_locked_paise,0))-paid_principal_paise-paid_late_fee_paise),0)::bigint
       FROM rent_invoices ri
       JOIN bookings b ON b.id=ri.booking_id JOIN customers c ON c.id=ri.customer_id
       WHERE ri.billing_month=${BILLING_MONTH}::date AND ri.status IN ('pending','overdue','payment_in_progress')
         AND b.is_test=false AND c.is_test=false) AS rent_outstanding_paise,
      (SELECT coalesce(sum(amount_paise + coalesce(late_fee_locked_paise,0)),0)::bigint
       FROM electricity_invoices ei
       JOIN bookings b ON b.id=ei.booking_id JOIN customers c ON c.id=ei.customer_id
       WHERE ei.billing_month=${BILLING_MONTH}::date AND ei.status!='cancelled'
         AND b.is_test=false AND c.is_test=false) AS elec_billed_paise,
      (SELECT coalesce(sum(paid_paise),0)::bigint
       FROM electricity_invoices ei
       JOIN bookings b ON b.id=ei.booking_id JOIN customers c ON c.id=ei.customer_id
       WHERE ei.billing_month=${BILLING_MONTH}::date AND ei.status='paid'
         AND b.is_test=false AND c.is_test=false) AS elec_paid_paise
  `);
  console.log(oct[0]);

  console.log('\n--- Bed status breakdown ---');
  const occRows = await fetchBedOccupancyRows({ asOfDate: AS_OF });
  const byStatus = new Map<string, { total: number; occupied: number; inEstimateRateSum: number }>();
  for (const r of occRows) {
    const st = r.bedStatus;
    const cur = byStatus.get(st) ?? { total: 0, occupied: 0, inEstimateRateSum: 0 };
    cur.total += 1;
    if (r.isOccupiedToday) cur.occupied += 1;
    if (isBedStatusRentableForEstimatedRevenue(r.bedStatus)) cur.inEstimateRateSum += 1;
    byStatus.set(st, cur);
  }
  for (const [st, v] of byStatus) console.log(st, v);

  console.log('\n--- Active monthly/open_ended residents (canonical effective rent) ---');
  const activeRows = await db
    .select({
      bookingId: bookings.id,
      customerName: customers.fullName,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      durationMode: bookings.durationMode,
      bedStatus: beds.status,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(
        eq(bedReservations.bookingId, bookings.id),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        sql`${AS_OF}::date <@ ${bedReservations.stayRange}`,
      ),
    );

  let sumEffectiveRent = 0;
  const missingOctRent: string[] = [];
  console.log('Resident | PG | Room | Bed | mode | bedStatus | rentINR | octInvoice');
  for (const row of activeRows) {
    const resolved = await resolveMonthlyRentPaiseForBooking(row.bookingId, BILLING_MONTH);
    sumEffectiveRent += resolved.rentPaise;
    const [inv] = await db
      .select({ id: rentInvoices.id, status: rentInvoices.status })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, row.bookingId),
          eq(rentInvoices.billingMonth, BILLING_MONTH),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .limit(1);
    if (!inv) missingOctRent.push(`${row.customerName} (${row.bookingId.slice(0, 8)})`);
    console.log(
      [
        row.customerName,
        row.pgName,
        row.roomNumber,
        row.bedCode,
        row.durationMode,
        row.bedStatus,
        (resolved.rentPaise / 100).toFixed(0),
        inv?.status ?? 'NO_INVOICE',
      ].join(' | '),
    );
  }
  console.log('\nSUM effective monthly rent paise:', sumEffectiveRent, 'INR', sumEffectiveRent / 100);
  console.log('Missing October non-adhoc rent invoices:', missingOctRent.length);
  for (const m of missingOctRent) console.log('  -', m);

  await closeDb();
}

main().catch(async (e) => {
  console.error('FATAL', e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
