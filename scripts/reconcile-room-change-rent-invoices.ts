/**
 * Reconcile room-change rent invoices to canonical new-bed monthly SSOT.
 *
 * Usage:
 *   npx tsx scripts/reconcile-room-change-rent-invoices.ts --request <id> --dry-run
 *   npx tsx scripts/reconcile-room-change-rent-invoices.ts --request <id> --execute
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]?.trim() && !match[1].includes('placeholder')) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    } catch {
      // next
    }
  }
}

ensureDatabaseUrl();

async function main(): Promise<void> {
  const argv = process.argv;
  let requestId = '';
  let execute = false;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--request') requestId = argv[++i] ?? '';
    else if (argv[i] === '--execute') execute = true;
    else if (argv[i] === '--dry-run') execute = false;
  }
  if (!requestId) {
    console.error('Usage: --request <room_change_request_id> [--dry-run|--execute]');
    process.exit(1);
  }

  const { previewRoomChangeRentReconciliation, reconcileRoomChangeRentInvoices } =
    await import('../src/services/roomChangeRentReconciliation');

  const preview = await previewRoomChangeRentReconciliation(requestId);
  console.log(JSON.stringify(preview, null, 2));

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to mutate.');
    console.log('Production mutation count: 0');
    return;
  }

  const result = await reconcileRoomChangeRentInvoices({ requestId, dryRun: false });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
