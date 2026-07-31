/**
 * Export worked examples from production DB for ELECTRICITY_BILLING_AUDIT.md section 2.
 * Usage: npx tsx scripts/export-electricity-audit-samples.ts
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { loadAppEnv } from '../src/lib/db/loadEnv';

loadAppEnv();

function inr(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    paise / 100,
  );
}

async function main() {
  const { db } = await import('../src/db/client');
  const { electricityBills, electricityInvoices, rooms, floors, pgs, customers, bookings } =
    await import('../src/db/schema');
  const { loadElectricityBillBreakdown } = await import(
    '../src/lib/billing/buildElectricityBillBreakdown'
  );
  const { getElectricitySettlementLedgerView } = await import(
    '../src/services/electricitySettlementLedgerView'
  );
  const { buildRoomElectricityAuditView } = await import(
    '../src/lib/billing/buildRoomElectricityAuditView'
  );

  const bills = await db
    .select({
      id: electricityBills.id,
      roomId: electricityBills.roomId,
      billingMonth: electricityBills.billingMonth,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
      unitsConsumed: electricityBills.unitsConsumed,
      totalPaise: electricityBills.totalPaise,
      monthlyOccupantCount: electricityBills.monthlyOccupantCount,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(electricityBills.isPipelineTest, false),
        isNotNull(electricityBills.calculationBreakdown),
        ne(electricityBills.monthlyOccupantCount, 0),
      ),
    )
    .orderBy(desc(electricityBills.billingMonth), desc(electricityBills.createdAt))
    .limit(12);

  const picked: typeof bills = [];
  const seen = new Set<string>();
  for (const b of bills) {
    if (picked.length >= 3) break;
    const key = `${b.pgName}-${String(b.billingMonth)}`;
    if (seen.has(key)) continue;
    picked.push(b);
    seen.add(key);
  }

  const lines: string[] = [
    '# Electricity Billing — Worked Examples (Production Data)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'These examples are extracted from live database rows with `calculation_breakdown` persisted.',
    '',
  ];

  for (const bill of picked) {
    const breakdown = await loadElectricityBillBreakdown(bill.id);
    const ledger = await getElectricitySettlementLedgerView({
      roomId: bill.roomId,
      billingMonth: bill.billingMonth,
      fallbackTotalBillPaise: bill.totalPaise,
    });
    if (!breakdown || !ledger) continue;

    const invRows = await db
      .select({
        invoiceId: electricityInvoices.id,
        invoiceNumber: electricityInvoices.invoiceNumber,
        bookingId: electricityInvoices.bookingId,
        amountPaise: electricityInvoices.amountPaise,
        paidPaise: electricityInvoices.paidPaise,
        status: electricityInvoices.status,
        unitsShare: electricityInvoices.unitsShare,
        activeDays: electricityInvoices.activeDays,
        customerFullName: customers.fullName,
      })
      .from(electricityInvoices)
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .where(eq(electricityInvoices.electricityBillId, bill.id));

    const audit = buildRoomElectricityAuditView({
      breakdown,
      ledger,
      pgName: bill.pgName,
      distribution: invRows.map((r) => ({
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        bookingId: r.bookingId,
        customerFullName: r.customerFullName,
        amountPaise: r.amountPaise,
        status: r.status,
        paidPaise: r.paidPaise,
        unitsShare: r.unitsShare != null ? Number(r.unitsShare) : null,
        activeDays: r.activeDays,
      })),
    });

    lines.push(`## Room ${bill.roomNumber} · ${bill.pgName} · ${bill.billingMonth}`);
    lines.push('');
    lines.push(`- Bill ID: \`${bill.id}\``);
    lines.push(`- Units consumed: ${bill.unitsConsumed}`);
    lines.push(`- Gross total: ${inr(bill.totalPaise)}`);
    lines.push(`- Monthly occupants billed: ${bill.monthlyOccupantCount}`);
    lines.push(
      `- Reconciliation: ${audit.isBalanced ? 'Balanced ✓' : `Gap ${inr(audit.reconciliationGapPaise)}`}`,
    );
    lines.push('');
    lines.push('### Resident breakdown');
    lines.push('');
    lines.push(
      '| Resident | Check-in | Check-out | Days | Units | Allocated | Prev collected | Paid | Outstanding | Status |',
    );
    lines.push(
      '|----------|----------|-----------|------|-------|-----------|----------------|------|-------------|--------|',
    );

    for (const row of audit.residentRows) {
      lines.push(
        `| ${row.customerName} | ${row.checkIn} | ${row.checkOut ?? '—'} | ${row.daysCharged} | ${row.unitsAllocated?.toFixed(2) ?? '—'} | ${inr(row.amountAllocatedPaise)} | ${row.previousCollectedPaise > 0 ? inr(row.previousCollectedPaise) : '—'} | ${row.amountPaidPaise > 0 ? inr(row.amountPaidPaise) : '—'} | ${row.currentOutstandingPaise > 0 ? inr(row.currentOutstandingPaise) : '—'} | ${row.status} |`,
      );
    }

    lines.push('');
    lines.push(
      `**Sum check:** allocated ${inr(audit.sumAllocatedPaise)} + credits ${inr(audit.sumCreditsPaise)} + remainder ${inr(audit.roundingRemainderPaise)} = ${inr(audit.sumAllocatedPaise + audit.sumCreditsPaise + audit.roundingRemainderPaise)} vs gross ${inr(audit.grossTotalPaise)}`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const outPath = path.join(process.cwd(), 'docs/ELECTRICITY_BILLING_AUDIT_SAMPLES.md');
  await writeFile(outPath, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outPath} (${picked.length} bills)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
