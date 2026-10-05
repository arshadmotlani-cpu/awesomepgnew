/**
 * READ-ONLY Room 102 meter-period allocation + deposit-aware settlement.
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-settlement-reconciliation-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-settlement-reconciliation');

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('@/src/db/client');
  const { paiseToInr } = await import('@/src/lib/format');
  const { loadPgElectricityRoomGenerationPreview } = await import(
    '@/src/lib/billing/pgElectricityGenerationPreview'
  );
  const { loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod } = await import(
    '@/src/lib/billing/electricityMeterPeriodPriorCollections'
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

  const preview = await loadPgElectricityRoomGenerationPreview({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    previousReadingUnits: PREV,
    currentReadingUnits: CURR,
    ratePerUnitPaise: 1600,
    readingDate: '2026-10-04',
  });

  const krishnaPrior = await loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod({
    roomId: room.id,
    reportingBillingMonth: BILLING_MONTH,
    periodStartDate: preview.meterPeriod.periodStartDate,
    periodEndExclusive: '2026-10-05',
    previousFinalizedReadingUnits: PREV,
  });

  const settlement = preview.settlementPreview;
  const allocation = preview.allocationPreview;

  console.log(
    JSON.stringify(
      {
        mutations: 0,
        room: '102',
        meterPeriod: preview.meterPeriod,
        krishnaPriorExcludedFromOpenPeriod: {
          totalPaise: krishnaPrior.totalPaise,
          rows: krishnaPrior.collections.length,
        },
        totals: settlement?.totals ?? null,
        residents: settlement?.lines.map((line) => ({
          name: line.customerName,
          gross: paiseToInr(line.grossAllocationPaise),
          previouslySettled: paiseToInr(line.previouslyCollectedPaise),
          refundableBefore: paiseToInr(line.refundableBalanceBeforePaise),
          depositDeduction: paiseToInr(line.depositElectricityDeductionPaise),
          newDues: paiseToInr(line.newDuesPaise),
          refundableAfter: paiseToInr(line.remainingRefundableBalancePaise),
          category: line.category,
          notes: line.settlementNotes,
        })),
        allocationGross: allocation ? paiseToInr(allocation.grossTotalPaise) : null,
        allocationInvoiceTotal: allocation ? paiseToInr(allocation.invoiceTotalPaise) : null,
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
