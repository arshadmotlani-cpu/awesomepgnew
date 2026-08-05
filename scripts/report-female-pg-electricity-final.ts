/**
 * Final Female PG electricity investigation report (read-only + repair summary).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('female-elec-final-report');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { runElectricityReadingsWithoutBillsAudit } from '@/src/lib/billing/electricityReadingsWithoutBills';

const ROOM_ID = 'e24f92db-2363-4bcf-9b08-bf4d7c4eab74';
const JULY_BILL_ID = '77857b9d-5859-4db3-ba9f-f3976a4fd447';

async function main() {
  mkdirSync('tmp', { recursive: true });

  const invoices = await db.execute(sql`
    SELECT ei.invoice_number, ei.amount_paise::int, ei.paid_paise::int,
           ei.status::text, ei.units_share::text, c.full_name
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.electricity_bill_id = ${JULY_BILL_ID}::uuid AND ei.status <> 'cancelled'
    ORDER BY c.full_name
  `);

  const bill = await db.execute(sql`
    SELECT previous_reading_units::text AS prev, current_reading_units::text AS curr,
           units_consumed::text AS units, total_paise::int, notes
    FROM electricity_bills WHERE id = ${JULY_BILL_ID}::uuid
  `);

  const julyHealth = await runElectricityReadingsWithoutBillsAudit({
    billingMonth: '2026-07-01',
  });
  const augHealth = await runElectricityReadingsWithoutBillsAudit({
    billingMonth: '2026-08-01',
  });

  const augustGate = existsSync('tmp/female-402-august-gate.json')
    ? JSON.parse(readFileSync('tmp/female-402-august-gate.json', 'utf8'))
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    rootCause:
      'Correcting meter readings does not trigger bill generation. July bills already existed (707→850 repaired in place). August was never given a current reading > 850.',
    whyNotGeneratedToday: [
      'No auto-generation path after reading correction',
      'July regenerate would hit already_exists',
      'August with 707→850 fails continuity (opening is 850) or yields 0 units',
    ],
    room: {
      pg: 'CENTRAL - AWESOME PG (Female)',
      roomNumber: '402',
      roomId: ROOM_ID,
      meter: 'room electricity baseline via electricity_bills SSOT (no meter_logs rows)',
    },
    july: {
      billId: JULY_BILL_ID,
      bill: Array.isArray(bill) ? bill[0] : bill,
      invoices,
      expectedAmountPaise: 214500,
      residents: 3,
    },
    repaired: {
      unitsShareSyncedTo: 47.67,
      julyBillsCreated: false,
      julyBillsAlreadyPresent: true,
    },
    august: {
      generated: false,
      blocker: augustGate?.blocker ?? 'No August closing reading > 850 provided',
      opening: 850,
    },
    otherRoomsSamePlaceholderPattern: [
      'Only Female 402 matched ops-female / 5000 placeholder / 707 repair notes in fleet scan.',
    ],
    electricityBrainHealth: {
      july: { pass: julyHealth.pass, findings: julyHealth.findings.length },
      august: {
        pass: augHealth.pass,
        alert: augHealth.alertMessage,
        findings: augHealth.findings,
      },
    },
  };

  writeFileSync(join('tmp', 'female-pg-electricity-final-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
