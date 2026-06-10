import 'dotenv/config';
import { checkMigrationHealth, formatMigrationHealthError } from './migrationHealth';

async function main() {
  const health = await checkMigrationHealth();
  console.log(
    JSON.stringify(
      {
        ok: health.ok,
        currentDbVersion: health.currentDbVersion,
        latestCodeVersion: health.latestCodeVersion,
        pendingCount: health.pendingCount,
        pending: health.pending,
        appliedCount: health.appliedCount,
        codeCount: health.codeCount,
        error: health.error ?? null,
      },
      null,
      2,
    ),
  );
  if (!health.ok) {
    console.error('\n' + formatMigrationHealthError(health));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
