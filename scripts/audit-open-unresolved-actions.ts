#!/usr/bin/env npx tsx
/**
 * Audit every OPEN unresolved_action — validity + auto-close candidates.
 *
 *   npx tsx scripts/audit-open-unresolved-actions.ts
 *   npx tsx scripts/audit-open-unresolved-actions.ts --fix
 */
import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { unresolvedActions } from '@/src/db/schema';
import { isResidentBedAssignmentEligible } from '@/src/lib/residentBedAssignment';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';
import { resolveAction } from '@/src/services/unresolvedActions';
import type { AdminSession } from '@/src/lib/auth/session';

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

type AuditRow = {
  id: string;
  actionType: string;
  resident: string;
  sourceKey: string;
  href: string | null;
  whyOpen: string;
  valid: boolean;
  shouldClose: boolean;
  closeReason: string | null;
};

async function main() {
  const open = await db.select().from(unresolvedActions).where(eq(unresolvedActions.status, 'OPEN'));

  const [residents, kycPending, paymentReviews, checkoutSettlements, residentRequests] =
    await Promise.all([
      listResidentsForAdmin(CRON),
      listPendingKycSubmissions(),
      listPendingPaymentReviews(CRON),
      listPipelineCheckoutSettlements(CRON),
      listPendingResidentRequestsForAdmin(CRON),
    ]);

  const residentById = new Map(residents.map((r) => [r.id, r]));
  const kycIds = new Set(kycPending.map((k) => `unresolved:kyc:${k.id}`));
  const paymentKeys = new Set(paymentReviews.map((p) => `unresolved:payment_review:${p.key}`));
  const checkoutByBooking = new Map(checkoutSettlements.map((s) => [s.bookingId, s]));
  const pendingRequestIds = new Set(residentRequests.map((r) => `unresolved:resident_request:${r.id}`));

  const audits: AuditRow[] = [];

  for (const row of open) {
    const resident = row.residentId ? residentById.get(row.residentId) : null;
    const residentName =
      resident?.fullName ?? row.label?.split('—')[0]?.trim() ?? row.residentId ?? '(none)';

    let whyOpen = row.label ?? row.sourceKey;
    let valid = true;
    let shouldClose = false;
    let closeReason: string | null = null;

    switch (row.actionType) {
      case 'bed_assignment': {
        const customerId = row.residentId ?? row.entityId;
        const r = residentById.get(customerId);
        if (!r) {
          valid = false;
          shouldClose = true;
          closeReason = 'resident not found';
          whyOpen = 'bed_assignment sync — resident missing';
        } else if (!isResidentBedAssignmentEligible(r)) {
          valid = false;
          shouldClose = true;
          closeReason = 'no active onboarding booking awaiting bed assignment';
          whyOpen = `kyc=${r.kycStatus} bed=${r.bedId ?? 'none'} onboarding=${r.onboardingBookingStatus} payment=${r.onboardingPaymentApproved}`;
        } else {
          whyOpen = 'Active onboarding booking confirmed — bed not assigned';
        }
        break;
      }
      case 'kyc_review': {
        valid = kycIds.has(row.sourceKey);
        if (!valid) {
          shouldClose = true;
          closeReason = 'no pending KYC submission';
        }
        whyOpen = valid ? 'Pending KYC submission' : 'Stale KYC action';
        break;
      }
      case 'payment_proof_review': {
        valid = paymentKeys.has(row.sourceKey);
        if (!valid) {
          shouldClose = true;
          closeReason = 'payment proof no longer pending';
        }
        whyOpen = valid ? 'Pending payment proof' : 'Stale payment review';
        break;
      }
      case 'move_out_approval':
      case 'checkout_settlement': {
        const settlementId = row.entityType === 'booking' ? null : row.entityId;
        const settlement =
          checkoutSettlements.find((s) => s.id === settlementId || s.id === row.entityId) ??
          (row.entityType === 'booking'
            ? checkoutByBooking.get(row.entityId)
            : checkoutSettlements.find((s) => s.vacatingRequestId === row.entityId.replace(/^vacating:/, '')));

        if (!settlement) {
          const vacatingOpen = await db.execute(sql`
            SELECT vr.status FROM vacating_requests vr
            WHERE vr.id::text = ${row.entityId}
               OR vr.id::text = ${row.sourceKey.replace(/^unresolved:vacating:/, '')}
            LIMIT 1
          `);
          if (vacatingOpen.length === 0 || !['pending', 'approved'].includes(String(vacatingOpen[0]?.status))) {
            valid = false;
            shouldClose = true;
            closeReason = 'vacating request not open';
          }
          whyOpen = 'Vacating / checkout pipeline';
        } else {
          const refundPaise = settlement.finalRefundPaise ?? settlement.previewRefundPaise ?? 0;
          const terminal = ['completed', 'refund_paid'].includes(settlement.status);
          const zeroRefundDone = refundPaise <= 0 && terminal;
          whyOpen = `settlement status=${settlement.status} refund=${refundPaise}paise`;
          if (zeroRefundDone) {
            valid = false;
            shouldClose = true;
            closeReason = 'settlement completed with ₹0 refund';
          } else if (settlement.status === 'refund_pending' && refundPaise <= 0) {
            valid = false;
            shouldClose = true;
            closeReason = 'refund_pending but refund amount is 0';
          } else if (terminal && row.actionType === 'checkout_settlement') {
            valid = false;
            shouldClose = true;
            closeReason = `settlement ${settlement.status}`;
          } else {
            valid = true;
          }
        }
        break;
      }
      case 'deposit_refund_approval': {
        const bookingId = row.entityType === 'booking' ? row.entityId : null;
        const settlement = bookingId ? checkoutByBooking.get(bookingId) : null;
        if (settlement) {
          const refundPaise = settlement.finalRefundPaise ?? settlement.previewRefundPaise ?? 0;
          whyOpen = `deposit refund — settlement ${settlement.status} refund=${refundPaise}`;
          if (['completed', 'refund_paid'].includes(settlement.status) && refundPaise <= 0) {
            valid = false;
            shouldClose = true;
            closeReason = 'settlement completed with ₹0 refund';
          }
        }
        break;
      }
      case 'room_transfer_approval':
      case 'maintenance_approval': {
        const reqId = row.entityId;
        valid = pendingRequestIds.has(`unresolved:resident_request:${reqId}`) || row.sourceKey.includes(reqId);
        if (!valid && row.actionType === 'room_transfer_approval') {
          const [req] = await db.execute(sql`
            SELECT status FROM resident_requests WHERE id::text = ${reqId} LIMIT 1
          `);
          if (!req || !['pending', 'submitted'].includes(String(req.status))) {
            shouldClose = true;
            closeReason = 'resident request closed';
          }
        }
        whyOpen = row.label ?? row.actionType;
        break;
      }
      default:
        whyOpen = row.label ?? row.actionType;
    }

    // Orphan href check
    if (row.href === '/admin/requests' && row.actionType === 'room_transfer_approval') {
      const reqId = row.entityId;
      const [req] = await db.execute(sql`
        SELECT id, status, type FROM resident_requests WHERE id::text = ${reqId} LIMIT 1
      `);
      if (!req) {
        valid = false;
        shouldClose = true;
        closeReason = 'resident request row missing — destination page cannot load context';
      }
    }

    audits.push({
      id: row.id,
      actionType: row.actionType,
      resident: residentName,
      sourceKey: row.sourceKey,
      href: row.href,
      whyOpen,
      valid,
      shouldClose,
      closeReason,
    });
  }

  console.log('\n=== OPEN unresolved_actions audit ===\n');
  console.log(`Total OPEN: ${open.length}\n`);

  console.log(
    '| action_type | resident | source_key | why open | valid | auto-close |',
  );
  console.log('|-------------|----------|------------|----------|-------|------------|');
  for (const a of audits) {
    console.log(
      `| ${a.actionType} | ${a.resident} | ${a.sourceKey.slice(0, 40)} | ${a.whyOpen.slice(0, 50)} | ${a.valid ? 'YES' : 'NO'} | ${a.shouldClose ? `YES (${a.closeReason})` : 'no'} |`,
    );
  }

  const toClose = audits.filter((a) => a.shouldClose);
  console.log(`\nInvalid / stale: ${toClose.length} / ${audits.length}`);

  if (FIX && toClose.length > 0) {
    for (const a of toClose) {
      const n = await resolveAction({ sourceKey: a.sourceKey });
      console.log(`  closed ${a.sourceKey}: ${n}`);
    }
  } else if (toClose.length > 0) {
    console.log('\nRe-run with --fix to close stale actions.');
  }

  // Named resident spot checks
  for (const name of ['arshad', 'aatif', 'harish', 'crash']) {
    const hits = audits.filter((a) => a.resident.toLowerCase().includes(name));
    if (hits.length) {
      console.log(`\n--- ${name} ---`);
      console.table(hits);
    }
  }

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
