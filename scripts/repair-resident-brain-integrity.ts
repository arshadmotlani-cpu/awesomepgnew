/**
 * Apply safe Resident Brain repairs on production (orphan reserves blocking portal).
 *   npx tsx --tsconfig tsconfig.json scripts/repair-resident-brain-integrity.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-resident-brain-integrity');

import { closeDb } from '@/src/db/client';
import {
  repairOrphanReservesBlockingActiveStay,
  runResidentBrainIntegrityAudit,
} from '@/src/lib/residents/residentBrainIntegrity';
import {
  customerHasResidentPortalAccess,
  getOpenReserveBookingCode,
} from '@/src/lib/residents/residentPortalAccess';

const WAQAR_ID = '72772e2a-1466-440b-8413-01d4516cd09e';

async function main() {
  mkdirSync('tmp', { recursive: true });
  const before = await runResidentBrainIntegrityAudit();
  const waqarBefore = {
    portalAccess: await customerHasResidentPortalAccess(WAQAR_ID),
    openReserveCode: await getOpenReserveBookingCode(WAQAR_ID),
  };

  const repair = await repairOrphanReservesBlockingActiveStay();

  const after = await runResidentBrainIntegrityAudit();
  const waqarAfter = {
    portalAccess: await customerHasResidentPortalAccess(WAQAR_ID),
    openReserveCode: await getOpenReserveBookingCode(WAQAR_ID),
  };

  const out = { before, repair, after, waqarBefore, waqarAfter };
  writeFileSync(
    join('tmp', 'resident-brain-repair-result.json'),
    JSON.stringify(out, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        repair,
        waqarBefore,
        waqarAfter,
        beforeCounts: before.counts,
        afterCounts: after.counts,
        afterPass: after.pass,
        remainingP0: after.findings.filter((f) => f.severity === 'P0'),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
