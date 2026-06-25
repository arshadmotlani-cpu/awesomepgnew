#!/usr/bin/env npx tsx
/**
 * Production issues audit — Operations badge, Room 201, KYC, July rent preview.
 *
 *   npx tsx scripts/production-issues-audit-report.ts
 *   npx tsx scripts/production-issues-audit-report.ts --fix
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
loadScriptEnv();
import { execSync } from 'node:child_process';
import { and, desc, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { beds, kycSubmissions, rooms, unresolvedActions } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { buildResident360Workflow } from '@/src/lib/residents/resident360Workflow';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { getOpenActionsCount, resolveAction } from '@/src/services/unresolvedActions';
import { syncUnresolvedActionsFromDomain } from '@/src/services/unresolvedActionSync';

const FIX = process.argv.includes('--fix');

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
  console.log('\n# Production Issues Audit Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  // ── 1. Operations badge ──────────────────────────────────────────────
  console.log('## 1. Operations badge (why it showed 20)\n');

  const openInvoiceReview = await db
    .select()
    .from(unresolvedActions)
    .where(and(eq(unresolvedActions.status, 'OPEN'), eq(unresolvedActions.actionType, 'invoice_review')));

  console.log(`OPEN invoice_review rows: **${openInvoiceReview.length}**`);
  console.log(
    '\nRoot cause: financial reconciliation synced MISSING_RENT_INVOICE audit issues as deposit_collection_due → invoice_review in the Operations badge bucket. These are billing audit tasks, not actionable Operations queue items.\n',
  );

  console.log('### Every record contributing to the inflated badge\n');
  console.log('| id | source_key | label | created |');
  console.log('|----|------------|-------|---------|');
  for (const row of openInvoiceReview) {
    console.log(
      `| ${row.id.slice(0, 8)}… | ${row.sourceKey.slice(0, 55)} | ${(row.label ?? '').slice(0, 50)} | ${row.createdAt.toISOString().slice(0, 10)} |`,
    );
  }

  if (FIX && openInvoiceReview.length > 0) {
    for (const row of openInvoiceReview) {
      await resolveAction({ sourceKey: row.sourceKey });
    }
    console.log(`\n**Fixed:** closed ${openInvoiceReview.length} stale invoice_review rows.`);
    await syncUnresolvedActionsFromDomain(CRON);
  } else if (openInvoiceReview.length > 0) {
    console.log('\nRe-run with `--fix` to close stale invoice_review rows on this database.');
  }

  const badges = await loadAdminNavBadges(CRON);
  const opsPage = await loadResidentOperationsResidentsPage(CRON, null);
  const legacyOpsCount = await getOpenActionsCount(CRON, 'operations');

  console.log('\n### Current counts\n');
  console.log(`- Legacy unresolved_actions operations bucket: ${legacyOpsCount}`);
  console.log(`- Operations queue (sidebar SSOT after fix): ${opsPage.allQueueCount}`);
  console.log(`- Sidebar operations badge: ${badges.operations ?? 0}`);
  console.log(`- Match: ${(badges.operations ?? 0) === opsPage.allQueueCount ? 'YES' : 'NO'}`);

  // ── 2. Room 201 billing ──────────────────────────────────────────────
  console.log('\n## 2. Room 201 billing configuration\n');

  const room201Rows = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      billingMode: rooms.billingMode,
      privateRoomMonthlyRentPaise: rooms.privateRoomMonthlyRentPaise,
    })
    .from(rooms)
    .where(and(eq(rooms.roomNumber, '201'), sql`${rooms.archivedAt} IS NULL`));

  if (room201Rows.length === 0) {
    console.log('Room 201 not found.');
  }

  for (const r of room201Rows) {
    console.log(`- Room ${r.roomNumber} (${r.roomId})`);
    console.log(`  billing_mode: ${r.billingMode}`);
    console.log(`  private_room_monthly_rent_paise: ${r.privateRoomMonthlyRentPaise ?? 'null'}`);
    if (r.privateRoomMonthlyRentPaise) {
      console.log(`  → ₹${(r.privateRoomMonthlyRentPaise / 100).toLocaleString('en-IN')}/month, one invoice only`);
    }
  }

  const room201Beds = await db
    .select({
      bedCode: beds.bedCode,
      manualOccupied: beds.manualOccupied,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(rooms.roomNumber, '201'), sql`${rooms.archivedAt} IS NULL`));

  console.log('\nBeds:');
  for (const b of room201Beds) {
    console.log(`  ${b.bedCode}: manual_occupied=${b.manualOccupied}`);
  }

  // ── 3. Room 201 resident KYC ─────────────────────────────────────────
  console.log('\n## 3. Room 201 resident KYC\n');

  const residents201 = await db.execute<{
    customer_id: string;
    full_name: string;
    kyc_status: string;
    bed_code: string;
    booking_id: string;
  }>(sql`
    SELECT DISTINCT c.id AS customer_id, c.full_name, c.kyc_status::text,
           b.bed_code, bk.id AS booking_id
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id AND bk.status = 'confirmed'
    JOIN bed_reservations br ON br.booking_id = bk.id AND br.status = 'active'
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE r.room_number = '201'
      AND r.archived_at IS NULL
      AND CURRENT_DATE <@ br.stay_range
    ORDER BY b.bed_code
  `);

  const pendingKyc = await listPendingKycSubmissions();
  const pendingIds = new Set(pendingKyc.map((p) => p.customerId));

  if (residents201.length === 0) {
    console.log('No active resident in Room 201.');
  }

  for (const r of residents201) {
    const subs = await db
      .select()
      .from(kycSubmissions)
      .where(eq(kycSubmissions.customerId, r.customer_id))
      .orderBy(desc(kycSubmissions.createdAt));

    const latest = subs[0] ?? null;
    const inQueue = pendingIds.has(r.customer_id);

    let verdict: 'UPLOADED' | 'MISSING' | 'BROKEN_RETRIEVAL';
    if (r.kyc_status === 'approved') {
      verdict = 'UPLOADED';
    } else if (subs.length === 0) {
      verdict = 'MISSING';
    } else if (latest?.status === 'pending' && inQueue) {
      verdict = 'UPLOADED';
    } else if (subs.length > 0 && r.kyc_status === 'pending' && !inQueue) {
      verdict = 'BROKEN_RETRIEVAL';
    } else {
      verdict = subs.length > 0 ? 'UPLOADED' : 'MISSING';
    }

    const workflow = buildResident360Workflow({
      customerId: r.customer_id,
      customerName: r.full_name,
      kycStatus: r.kyc_status as 'pending' | 'approved' | 'rejected',
      pendingKycSubmissionId: latest?.status === 'pending' ? latest.id : null,
      hasActiveTenancy: true,
      hasBed: true,
      bookingId: r.booking_id,
      financialSummary: null,
      residencyStatus: 'active',
    });

    console.log(`### ${r.full_name} (${r.bed_code})\n`);
    console.log(`- kyc_status: ${r.kyc_status}`);
    console.log(`- submissions: ${subs.length}${latest ? ` (latest=${latest.status})` : ''}`);
    console.log(`- admin KYC queue: ${inQueue ? 'yes' : 'no'}`);
    console.log(`- profile: ${workflow.stateLine}`);
    console.log(`- **Verdict: ${verdict}**\n`);
  }

  // ── 4. July rent preview ─────────────────────────────────────────────
  console.log('## 4. July rent generation preview\n');
  try {
    const out = execSync('npx tsx scripts/preview-july-rent-generation.ts --month 2026-07', {
      encoding: 'utf8',
    });
    console.log(out);
  } catch (err) {
    console.log('Could not run July preview (DATABASE_URL required).');
    if (err instanceof Error && 'stderr' in err) {
      console.log(String((err as { stderr?: Buffer }).stderr ?? err.message));
    }
  }

  console.log('\n---\nDo NOT deploy until all six deliverable items are verified on production.\n');
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
