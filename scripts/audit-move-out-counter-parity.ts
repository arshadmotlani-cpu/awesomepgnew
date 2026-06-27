/**
 * Move-out counter parity audit — lists SSOT counts and phantom vacating rows.
 *
 * Usage: npx tsx scripts/audit-move-out-counter-parity.ts
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
loadScriptEnv();

import { listAdminVacatingRequests } from '../src/db/queries/admin';
import { hasDatabaseUrl } from '../src/lib/db/env';
import type { AdminSession } from '../src/lib/auth/session';
import { activePipelineItems, buildMoveOutPipeline } from '../src/lib/moveOut/moveOutPipeline';
import { guardDepositPaise } from '../src/lib/deposits/paiseSafety';
import { getMoveOutPipelineSnapshot } from '../src/services/moveOutPipelineService';
import { getOperationsCenterData } from '../src/services/operationsCenter';
import { loadAdminVacatingPageData } from '../src/lib/vacating/loadAdminVacatingPageData';
import { listOpenActionItemsByType } from '../src/services/actionItems';

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'audit',
  adminId: 'audit',
  email: 'audit@system',
  fullName: 'Audit',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const session = CRON;
  const snapshot = await getMoveOutPipelineSnapshot(session);
  const ops = await getOperationsCenterData(session);
  const vacatingPage = await loadAdminVacatingPageData(session);
  const actionItems = await listOpenActionItemsByType(session, 'vacating_alert');

  const moveOutCount = snapshot.counts.moveOutNotices;
  const beds30 = snapshot.counts.bedsReleasing30Days;

  console.log('\n=== Move-out counter parity ===\n');
  console.log(`Overview / SSOT Move-out Notices     = ${moveOutCount}`);
  console.log(`Operations center leavingSoon        = ${ops.leavingSoon.count}`);
  console.log(`Vacating module active pipeline      = ${vacatingPage.data?.activeItems.length ?? 0}`);
  console.log(`Checkout pipeline (active move-outs) = ${moveOutCount}`);
  console.log(`vacating_alert open action items     = ${actionItems.length}`);
  console.log(`Beds releasing (30d)                 = ${beds30}`);
  console.log(`Operations bedsReleasingSoon         = ${ops.bedsReleasingSoon.count}`);

  const allMatch =
    moveOutCount === ops.leavingSoon.count &&
    moveOutCount === (vacatingPage.data?.activeItems.length ?? 0) &&
    moveOutCount === actionItems.length &&
    beds30 === ops.bedsReleasingSoon.count;

  console.log(allMatch ? '\nPASS — all counters match.\n' : '\nFAIL — counters diverge.\n');

  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    console.error('Could not load vacating rows:', vacatingRes.error);
    process.exit(1);
  }

  const activeIds = new Set(snapshot.activeVacatingRequestIds);
  const phantomCandidates = vacatingRes.data.filter(
    (row) =>
      (row.status === 'pending' || row.status === 'approved') &&
      !activeIds.has(row.id),
  );

  if (phantomCandidates.length === 0) {
    console.log('No phantom pending/approved vacating rows outside SSOT.');
    process.exit(allMatch ? 0 : 1);
  }

  console.log('Phantom rows (pending/approved but excluded from SSOT active pipeline):\n');

  for (const row of phantomCandidates) {
    const pipeline = buildMoveOutPipeline({
      vacatingRows: [
        {
          id: row.id,
          bookingId: row.bookingId,
          bookingCode: row.bookingCode,
          customerId: row.customerId,
          customerFullName: row.customerFullName,
          customerPhone: row.customerPhone,
          pgName: row.pgName,
          bedCode: row.bedCode,
          roomNumber: row.roomNumber,
          noticeGivenDate: row.noticeGivenDate,
          vacatingDate: row.vacatingDate,
          noticeCompliant: row.noticeCompliant,
          status: row.status,
          resolvedAt: row.resolvedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deductionPaise: guardDepositPaise(row.deductionPaise),
          depositHeldPaise: 0,
        },
      ],
      settlements: [],
    });
    const active = activePipelineItems(pipeline);
    const stage = pipeline[0]?.stage ?? 'unknown';
    const reasons: string[] = [];
    if (row.status === 'rejected' || row.status === 'completed') reasons.push(`status=${row.status}`);
    if (active.length === 0) reasons.push(`pipeline stage=${stage} (terminal / no attention needed)`);
    console.log(
      `- ${row.customerFullName} · ${row.bookingCode} · ${row.pgName} · vacating ${row.vacatingDate} · ${reasons.join('; ') || 'see settlement linkage'}`,
    );
  }

  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
