/**
 * READ-ONLY Room 102 meter-period reconciliation (424→496 scenario).
 * Mutations: 0
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-meter-period-reconciliation-readonly.ts
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-meter-period-reconciliation');

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('@/src/db/client');
  const { paiseToInr } = await import('@/src/lib/format');
  const { loadPgElectricityRoomGenerationPreview } = await import(
    '@/src/lib/billing/pgElectricityGenerationPreview'
  );

  const PREV = 424;
  const CURR = 496;
  const BILLING_MONTH = '2026-10-01';

  const [room] = (
    await db.execute(sql`
      SELECT r.id::text AS id FROM rooms r
      JOIN floors f ON f.id = r.floor_id JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%' LIMIT 1
    `)
  ) as { id: string }[];

  const { loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod } = await import(
    '@/src/lib/billing/electricityMeterPeriodPriorCollections'
  );

  const preview = await loadPgElectricityRoomGenerationPreview({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    previousReadingUnits: PREV,
    currentReadingUnits: CURR,
    ratePerUnitPaise: 1600,
    readingDate: '2026-10-04',
  });

  const priorDetail = await loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod({
    roomId: room.id,
    reportingBillingMonth: BILLING_MONTH,
    periodStartDate: preview.meterPeriod.periodStartDate,
    periodEndExclusive: formatDate(addDays(parseDate(preview.meterPeriod.periodEndDate), 1)),
  });

  const oldMonthOnlyDays = preview.occupants.reduce((s, o) => s + o.occupancyDays, 0);

  console.log(
    JSON.stringify(
      {
        mutations: 0,
        room: '102',
        scenario: `${PREV}→${CURR}`,
        meterPeriod: preview.meterPeriod,
        priorCollections: preview.priorCollections,
        priorCollectionRows: priorDetail.collections.map((c) => ({
          customerId: c.customerId,
          customerName: c.customerName,
          amountPaise: c.amountPaise,
          source: c.source,
          evidence: c.evidence,
          billingMonth: c.billingMonth,
        })),
        occupants: preview.occupants.map((o) => ({
          name: o.customerName,
          start: o.occupancyStart,
          end: o.occupancyEnd,
          days: o.occupancyDays,
          priorCollected: paiseToInr(o.previouslyCollectedPaise),
        })),
        allocation: preview.allocationPreview
          ? {
              gross: paiseToInr(preview.allocationPreview.grossTotalPaise),
              invoiceTotal: paiseToInr(preview.allocationPreview.invoiceTotalPaise),
              remainder: preview.allocationPreview.remainderPaise,
              lines: preview.allocationPreview.lines.map((l) => ({
                name: l.customerName,
                start: l.occupancyStart,
                end: l.occupancyEnd,
                days: l.occupancyDays,
                gross: paiseToInr(l.grossAllocationPaise),
                collected: paiseToInr(l.previouslyCollectedPaise),
                invoice: paiseToInr(l.finalInvoicePaise),
              })),
            }
          : null,
        note: {
          residentDayCountInMeterPeriod: oldMonthOnlyDays,
          calendarOctoberOnlyWouldMiss:
            'Residents who left before Oct 1 are included when meter period starts after last bill close.',
        },
      },
      null,
      2,
    ),
  );

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
