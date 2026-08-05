/**
 * Read-only Wave 1 brain integrity artifact.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/write-brain-integrity-wave1.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('brain-integrity-wave1');

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '@/src/db/client';
import { runAllBrainIntegrityAudits } from '@/src/lib/health/healthBrain';

async function main() {
  const outDir = join(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  const report = await runAllBrainIntegrityAudits({ runSafeRepairs: false });
  const path = join(outDir, 'brain-integrity-wave1.json');
  writeFileSync(
    path,
    JSON.stringify(
      {
        asOf: report.asOf,
        billingMonth: report.billingMonth,
        pass: report.pass,
        cards: report.cards,
        issueCount: report.issues.length,
        byBrain: Object.fromEntries(
          report.cards.map((c) => [
            c.brain,
            {
              status: c.status,
              openP0: c.openP0,
              openP1: c.openP1,
              openP2: c.openP2,
              issues: report.issues
                .filter((i) => i.brain === c.brain)
                .slice(0, 50)
                .map((i) => ({
                  severity: i.severity,
                  code: i.code,
                  entityType: i.entityType,
                  entityId: i.entityId,
                  cause: i.cause,
                  autoRepairAvailable: i.autoRepairAvailable,
                })),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${path}`);
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        cards: report.cards.map((c) => ({
          brain: c.brain,
          status: c.status,
          p0: c.openP0,
          p1: c.openP1,
          p2: c.openP2,
        })),
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
