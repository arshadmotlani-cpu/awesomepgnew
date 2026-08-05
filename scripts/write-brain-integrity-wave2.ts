/**
 * Wave 2 brain integrity artifact (read-only audit; no repairs unless --repair).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/write-brain-integrity-wave2.ts
 *   npx tsx --tsconfig tsconfig.json scripts/write-brain-integrity-wave2.ts --repair
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('brain-integrity-wave2');

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '@/src/db/client';
import { runAllBrainIntegrityAudits } from '@/src/lib/health/healthBrain';
import { computeHealthScore } from '@/src/lib/health/repairEngine';

async function main() {
  const repair = process.argv.includes('--repair');
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });

  const before = await runAllBrainIntegrityAudits({
    runSafeRepairs: false,
    persistDurableIssues: true,
  });
  const scoreBefore = before.healthScore ?? computeHealthScore(before.issues);

  let after = before;
  if (repair) {
    after = await runAllBrainIntegrityAudits({
      runSafeRepairs: true,
      persistDurableIssues: true,
      persistIncidents: true,
      repairTrigger: 'script',
    });
  }

  const out = {
    asOf: after.asOf,
    billingMonth: after.billingMonth,
    repair,
    healthScoreBefore: scoreBefore,
    healthScoreAfter: after.healthScore,
    pass: after.pass,
    cards: after.cards,
    repairs: after.repairs ?? null,
    issueCount: after.issues.length,
    byBrain: Object.fromEntries(
      after.cards.map((c) => [
        c.brain,
        {
          status: c.status,
          openP0: c.openP0,
          openP1: c.openP1,
          openP2: c.openP2,
          issues: after.issues
            .filter((i) => i.brain === c.brain)
            .slice(0, 40)
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
  };

  const path = join(process.cwd(), 'tmp/brain-integrity-wave2.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path}`);
  console.log(
    JSON.stringify(
      {
        pass: out.pass,
        healthScoreBefore: out.healthScoreBefore,
        healthScoreAfter: out.healthScoreAfter,
        cards: out.cards.map((c) => ({
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
