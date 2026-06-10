/* eslint-disable no-console */
/**
 * Manual invocation of the hold-expiry sweeper. Useful for local
 * development and as a fallback when no cron scheduler is configured.
 */
import 'dotenv/config';
import { closeDb } from '../src/db/client';
import { releaseExpiredHolds } from '../src/services/bookingLifecycle';

async function main() {
  const result = await releaseExpiredHolds();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('sweep-holds crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
