import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { capitalDb } from '../src/capital/db/client';
import { acAssets } from '../src/capital/db/schema';
import { recalculateAsset } from '../src/capital/services/assets';

async function main() {
  const rows = await capitalDb.select({ id: acAssets.id }).from(acAssets);
  console.log(`Recalculating ${rows.length} assets…`);
  for (const r of rows) {
    await recalculateAsset(r.id);
    console.log('ok', r.id);
  }
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
