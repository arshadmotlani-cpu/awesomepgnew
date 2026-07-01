#!/usr/bin/env npx tsx
/** Apply ₹1,200 June electricity split for room 203 (production fix). */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();
import { and, eq, ilike, ne } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { customers, electricityBills, electricityInvoices, floors, pgs, rooms } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';

const JUNE = '2026-06-01';
const TARGETS = [
  { pattern: 'krishna', amountPaise: 120_000 },
  { pattern: 'vijay', amountPaise: 120_000 },
  { pattern: 'waqar', amountPaise: 120_000 },
];

async function main() {
  const [pg] = await db.select().from(pgs).where(ilike(pgs.name, '%shanti%')).limit(1);
  if (!pg) throw new Error('Shantinagar PG not found');
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(floors.pgId, pg.id), eq(rooms.roomNumber, '203')))
    .limit(1);
  if (!room) throw new Error('Room 203 not found');

  const invoices = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      customerName: customers.fullName,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityBills.roomId, room.id),
        eq(electricityBills.billingMonth, JUNE),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  for (const inv of invoices) {
    const target = TARGETS.find((t) => inv.customerName.toLowerCase().includes(t.pattern));
    if (!target || inv.amountPaise === target.amountPaise) continue;
    console.log(
      `Fix ${inv.customerName}: ${paiseToInr(inv.amountPaise)} → ${paiseToInr(target.amountPaise)} (${inv.invoiceNumber})`,
    );
    await db
      .update(electricityInvoices)
      .set({ amountPaise: target.amountPaise, updatedAt: new Date() })
      .where(eq(electricityInvoices.id, inv.id));
    const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    await syncElectricityInvoiceToUnified(inv.id);
  }

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
