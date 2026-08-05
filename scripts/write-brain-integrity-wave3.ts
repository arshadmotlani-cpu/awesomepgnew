/**
 * Wave 3 — run safe repairs then write integrity artifact.
 *   npx tsx --tsconfig tsconfig.json scripts/write-brain-integrity-wave3.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('brain-integrity-wave3');

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '@/src/db/client';
import { runAllBrainIntegrityAudits } from '@/src/lib/health/healthBrain';
import { computeHealthScore } from '@/src/lib/health/repairEngine';

async function main() {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });

  const before = await runAllBrainIntegrityAudits({
    runSafeRepairs: false,
    persistDurableIssues: true,
  });
  const healthScoreBefore = before.healthScore ?? computeHealthScore(before.issues);

  const after = await runAllBrainIntegrityAudits({
    runSafeRepairs: true,
    persistDurableIssues: true,
    persistIncidents: true,
    repairTrigger: 'script',
  });

  const out = {
    asOf: after.asOf,
    billingMonth: after.billingMonth,
    healthScoreBefore,
    healthScoreAfter: after.healthScore,
    pass: after.pass,
    cards: after.cards,
    repairs: after.repairs ?? null,
    issueCount: after.issues.length,
    remaining: after.issues
      .filter((i) => i.code !== 'OPEN_P0_AGGREGATE')
      .map((i) => ({
        brain: i.brain,
        severity: i.severity,
        code: i.code,
        entityType: i.entityType,
        entityId: i.entityId,
        cause: i.cause,
        suggestedRepair: i.suggestedRepair,
        autoRepairAvailable: i.autoRepairAvailable,
      })),
    byBrain: Object.fromEntries(
      after.cards.map((c) => [
        c.brain,
        { status: c.status, openP0: c.openP0, openP1: c.openP1, openP2: c.openP2 },
      ]),
    ),
  };

  const path = join(process.cwd(), 'tmp/brain-integrity-wave3.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path}`);
  console.log(
    JSON.stringify(
      {
        pass: out.pass,
        healthScoreBefore: out.healthScoreBefore,
        healthScoreAfter: out.healthScoreAfter,
        cards: out.cards,
        remainingCount: out.remaining.length,
        remaining: out.remaining.slice(0, 40),
        repairs: out.repairs,
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
