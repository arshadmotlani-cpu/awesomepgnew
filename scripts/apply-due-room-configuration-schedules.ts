/**
 * Apply due room configuration schedules (production DB, authoritative service).
 * USE_PRODUCTION_DB=1 npx tsx scripts/apply-due-room-configuration-schedules.ts [runDate]
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { todayInBillingTimezone } from '../src/lib/billing/billingTimezone';

loadProductionAuditEnv();
requireDatabaseUrl('apply-due-room-configuration');

async function main() {
  const runDate = process.argv[2]?.trim() || todayInBillingTimezone();
  const { closeDb } = await import('../src/db/client');
  const { applyDueRoomConfigurationSchedules } = await import(
    '../src/services/roomConfigurationSchedule'
  );

  const result = await applyDueRoomConfigurationSchedules(runDate);
  console.log(JSON.stringify({ runDate, ...result }, null, 2));

  if (result.failed > 0) {
    process.exitCode = 1;
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
