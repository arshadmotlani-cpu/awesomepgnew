/**
 * Female PG 402 — August electricity generation gate.
 * Only generates when --august-current N is provided with N > 850.
 * Uses production createElectricityBill (no duplicates for July).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/generate-female-402-august-if-ready.ts
 *   npx tsx --tsconfig tsconfig.json scripts/generate-female-402-august-if-ready.ts --august-current 920 --execute
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('generate-female-402-august-if-ready');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';

const ROOM_ID = 'e24f92db-2363-4bcf-9b08-bf4d7c4eab74';
const AUGUST = '2026-08-01';
const MIN_OPENING = 850;

const EXECUTE = process.argv.includes('--execute');
const augustCurrentArg = (() => {
  const idx = process.argv.indexOf('--august-current');
  if (idx < 0) return null;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) ? n : null;
})();

async function main() {
  mkdirSync('tmp', { recursive: true });

  const opening = await resolveRoomPreviousMeterReading(ROOM_ID, {
    beforeBillingMonth: AUGUST,
  });

  const existing = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM electricity_bills
    WHERE room_id = ${ROOM_ID}::uuid AND billing_month = ${AUGUST}::date
      AND coalesce(is_pipeline_test, false) = false
    LIMIT 1
  `);
  const existingId = Array.isArray(existing) && existing[0] ? existing[0].id : null;

  const blocker =
    existingId != null
      ? `August bill already exists (${existingId}) — will not duplicate.`
      : augustCurrentArg == null
        ? `No August closing reading provided. Official opening is ${opening.previousReadingUnits}. Pass --august-current N with N > ${MIN_OPENING}.`
        : augustCurrentArg <= opening.previousReadingUnits
          ? `August current ${augustCurrentArg} must be > opening ${opening.previousReadingUnits}.`
          : opening.previousReadingUnits < MIN_OPENING
            ? `Unexpected opening ${opening.previousReadingUnits}; expected ≥ ${MIN_OPENING} after July repair.`
            : null;

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    opening,
    augustCurrentArg,
    existingAugustBillId: existingId,
    execute: EXECUTE,
    blocker,
    generated: null as null | Record<string, unknown>,
  };

  if (blocker) {
    writeFileSync(join('tmp', 'female-402-august-gate.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!EXECUTE) {
    report.generated = {
      dryRun: true,
      wouldCall: 'createElectricityBill',
      previousReadingUnits: opening.previousReadingUnits,
      currentReadingUnits: augustCurrentArg,
      units: (augustCurrentArg as number) - opening.previousReadingUnits,
    };
    writeFileSync(join('tmp', 'female-402-august-gate.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const [pgRow] = await db.execute<{ pg_id: string }>(sql`
    SELECT f.pg_id::text AS pg_id FROM rooms r
    JOIN floors f ON f.id = r.floor_id WHERE r.id = ${ROOM_ID}::uuid
  `);

  const result = await createElectricityBill({
    roomId: ROOM_ID,
    billingMonth: AUGUST,
    previousReadingUnits: opening.previousReadingUnits,
    currentReadingUnits: augustCurrentArg as number,
    ratePerUnitPaise: opening.ratePerUnitPaise || DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
  });

  report.generated = { pgId: pgRow?.pg_id ?? null, result };
  writeFileSync(join('tmp', 'female-402-august-gate.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
