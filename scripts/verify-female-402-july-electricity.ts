/**
 * Female PG Room 402 — verify July electricity integrity after 707→850 repair.
 * Optionally sync stale units_share on invoices. Does NOT create bills.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-female-402-july-electricity.ts
 *   npx tsx --tsconfig tsconfig.json scripts/verify-female-402-july-electricity.ts --sync-units-share
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-female-402-july-electricity');

import { and, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { electricityInvoices } from '@/src/db/schema';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';

const ROOM_ID = 'e24f92db-2363-4bcf-9b08-bf4d7c4eab74';
const JULY_BILL_ID = '77857b9d-5859-4db3-ba9f-f3976a4fd447';
const JULY = '2026-07-01';
const AUGUST = '2026-08-01';
const TARGET_PREV = 707;
const TARGET_CURR = 850;
const TARGET_UNITS = 143;
const EXPECTED_UNITS_SHARE = Math.round((TARGET_UNITS / 3) * 100) / 100; // 47.67

const SYNC = process.argv.includes('--sync-units-share');

async function main() {
  mkdirSync('tmp', { recursive: true });

  const [bill] = await db.execute<{
    id: string;
    billing_month: string;
    previous_reading_units: string;
    current_reading_units: string;
    units_consumed: string;
    total_paise: number;
    notes: string | null;
  }>(sql`
    SELECT id::text, billing_month::text, previous_reading_units::text,
           current_reading_units::text, units_consumed::text, total_paise::int,
           notes
    FROM electricity_bills WHERE id = ${JULY_BILL_ID}::uuid
  `);

  const invoices = await db.execute<{
    id: string;
    invoice_number: string;
    amount_paise: number;
    paid_paise: number;
    status: string;
    units_share: string;
    full_name: string;
    customer_id: string;
  }>(sql`
    SELECT ei.id::text, ei.invoice_number, ei.amount_paise::int, ei.paid_paise::int,
           ei.status::text, ei.units_share::text, c.full_name, c.id::text AS customer_id
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.electricity_bill_id = ${JULY_BILL_ID}::uuid
      AND ei.status <> 'cancelled'
    ORDER BY c.full_name
  `);

  const invList = Array.isArray(invoices) ? invoices : [];
  const augustOpening = await resolveRoomPreviousMeterReading(ROOM_ID, {
    beforeBillingMonth: AUGUST,
  });

  const augustBill = await db.execute(sql`
    SELECT id::text FROM electricity_bills
    WHERE room_id = ${ROOM_ID}::uuid AND billing_month = ${AUGUST}::date
      AND coalesce(is_pipeline_test, false) = false
    LIMIT 1
  `);

  const checks = {
    billExists: Boolean(bill),
    readingsCorrect:
      Number(bill?.previous_reading_units) === TARGET_PREV &&
      Number(bill?.current_reading_units) === TARGET_CURR &&
      Number(bill?.units_consumed) === TARGET_UNITS,
    threeInvoices: invList.length === 3,
    allPaid: invList.every((i) => i.status === 'paid'),
    amountsCorrect: invList.every((i) => i.amount_paise === 71500),
    augustOpening850: augustOpening.previousReadingUnits === TARGET_CURR,
    noAugustBill: (Array.isArray(augustBill) ? augustBill : []).length === 0,
  };

  let unitsShareSynced: string[] = [];
  if (SYNC) {
    for (const inv of invList) {
      if (Number(inv.units_share) !== EXPECTED_UNITS_SHARE) {
        await db
          .update(electricityInvoices)
          .set({
            unitsShare: String(EXPECTED_UNITS_SHARE),
            updatedAt: new Date(),
          })
          .where(and(eq(electricityInvoices.id, inv.id)));
        unitsShareSynced.push(inv.invoice_number);
      }
    }
  }

  const staleShares = invList.filter(
    (i) => Number(i.units_share) !== EXPECTED_UNITS_SHARE,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    bill,
    invoices: invList,
    augustOpening,
    checks,
    expectedUnitsShare: EXPECTED_UNITS_SHARE,
    staleUnitsShareBefore: staleShares.map((i) => ({
      invoice: i.invoice_number,
      units_share: i.units_share,
    })),
    unitsShareSynced,
    syncRequested: SYNC,
    pass:
      checks.billExists &&
      checks.readingsCorrect &&
      checks.threeInvoices &&
      checks.allPaid &&
      checks.amountsCorrect &&
      checks.augustOpening850,
  };

  writeFileSync(
    join('tmp', 'female-402-july-verify.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
