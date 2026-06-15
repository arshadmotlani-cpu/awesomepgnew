/* eslint-disable no-console */
/** Resolve stale billing action items and refresh admin notification badges. */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const { resolveStaleBillingActionItems, syncActionItemsForCron } = await import(
    '../src/services/actionItems'
  );
  const { closeDb } = await import('../src/db/client');

  const resolved = await resolveStaleBillingActionItems();
  console.log('Resolved stale billing action items:', resolved.resolved);
  await syncActionItemsForCron();
  console.log('Notification sync complete.');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
