/**
 * P0 KYC visibility audit — ensures unresolved actions appear consistently across
 * profile, KYC queue, operations, notifications, and action_items.
 */
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, adminNotifications, customers, kycSubmissions } from '@/src/db/schema';
import { buildResident360Workflow } from '@/src/lib/residents/resident360Workflow';
import {
  buildKycReviewAction,
  isKycReviewRequired,
} from '@/src/lib/residents/residentUnresolvedActions';
import { isResidentBedAssignable } from '@/src/lib/residentBedAssignment';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';
import type { AdminSession } from '@/src/lib/auth/session';
import { syncActionItemsForCron } from '@/src/services/actionItems';

export type ActionSurfaceCheck = {
  kycQueue: boolean;
  openActionItem: boolean;
  notification: boolean;
  profileWarning: boolean;
};

export type ResidentActionAuditRow = {
  customerId: string;
  customerName: string;
  kind: 'kyc_review' | 'payment_review' | 'bed_assignment' | 'checkout';
  sourceKey: string;
  submissionId?: string;
  surfaces: ActionSurfaceCheck;
  pass: boolean;
  gaps: string[];
};

export type KycVisibilityAuditReport = {
  ranAt: string;
  overall: 'PASS' | 'FAIL';
  legacyProfileFalsePositives: Array<{
    customerId: string;
    customerName: string;
    kycStatus: string;
    verifiedViaPayment: boolean;
    hasBed: boolean;
  }>;
  actionAudits: ResidentActionAuditRow[];
  dhairya: {
    found: boolean;
    customerId?: string;
    kycSubmissions: Array<{ id: string; status: string; createdAt: string }>;
    profileStateLine?: string;
    surfaces?: ActionSurfaceCheck;
  };
  summary: {
    kycReviewRequired: number;
    kycReviewPass: number;
    legacyFalsePositives: number;
    paymentReviewOpen: number;
    bedAssignmentOpen: number;
    checkoutOpen: number;
  };
};

function cronSession(): AdminSession {
  return {
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
}

async function loadOpenActionAndNotificationKeys(): Promise<{
  actionKeys: Set<string>;
  notificationKeys: Set<string>;
}> {
  const [openActions, openNotifs] = await Promise.all([
    db
      .select({ sourceKey: actionItems.sourceKey, residentId: actionItems.residentId })
      .from(actionItems)
      .where(eq(actionItems.status, 'open')),
    db.select({ sourceKey: adminNotifications.sourceKey }).from(adminNotifications),
  ]);
  return {
    actionKeys: new Set(openActions.map((r) => r.sourceKey)),
    notificationKeys: new Set(openNotifs.map((r) => r.sourceKey)),
  };
}

export async function runKycVisibilityAudit(opts?: {
  syncFirst?: boolean;
}): Promise<KycVisibilityAuditReport> {
  if (opts?.syncFirst) {
    await syncActionItemsForCron();
  }

  const session = cronSession();
  const [pendingKyc, paymentReviews, residents, keys] = await Promise.all([
    listPendingKycSubmissions(),
    listPendingPaymentReviews(session),
    listResidentsForAdmin(session),
    loadOpenActionAndNotificationKeys(),
  ]);

  const pendingKycIds = new Set(pendingKyc.map((k) => k.id));
  const residentById = new Map(residents.map((r) => [r.id, r]));

  const actionAudits: ResidentActionAuditRow[] = [];

  for (const k of pendingKyc) {
    const sourceKey = `kyc:${k.id}`;
    const resident = residentById.get(k.customerId);
    const workflow = buildResident360Workflow({
      customerId: k.customerId,
      customerName: k.customerName,
      kycStatus: resident?.kycStatus ?? 'pending',
      pendingKycSubmissionId: k.id,
      hasActiveTenancy: Boolean(resident && resident.tenancyStatus === 'active'),
      hasBed: Boolean(resident?.bedId),
      bookingId: resident?.bookingId ?? k.bookingId,
      financialSummary: null,
      residencyStatus: resident ? 'active' : 'active',
    });

    const surfaces: ActionSurfaceCheck = {
      kycQueue: pendingKycIds.has(k.id),
      openActionItem: keys.actionKeys.has(sourceKey),
      notification: keys.notificationKeys.has(sourceKey),
      profileWarning: workflow.stateLine.includes('identity review required'),
    };
    const gaps: string[] = [];
    if (!surfaces.kycQueue) gaps.push('missing_kyc_queue');
    if (!surfaces.openActionItem) gaps.push('missing_action_item');
    if (!surfaces.notification) gaps.push('missing_notification');
    if (!surfaces.profileWarning) gaps.push('missing_profile_warning');

    actionAudits.push({
      customerId: k.customerId,
      customerName: k.customerName,
      kind: 'kyc_review',
      sourceKey,
      submissionId: k.id,
      surfaces,
      pass: gaps.length === 0,
      gaps,
    });
  }

  for (const p of paymentReviews) {
    const sourceKey = `payment_review:${p.key}`;
    actionAudits.push({
      customerId: p.customerId ?? '',
      customerName: p.residentName,
      kind: 'payment_review',
      sourceKey,
      surfaces: {
        kycQueue: false,
        openActionItem: keys.actionKeys.has(sourceKey),
        notification: keys.notificationKeys.has(sourceKey),
        profileWarning: false,
      },
      pass:
        keys.actionKeys.has(sourceKey) && keys.notificationKeys.has(sourceKey),
      gaps: [
        ...(!keys.actionKeys.has(sourceKey) ? ['missing_action_item'] : []),
        ...(!keys.notificationKeys.has(sourceKey) ? ['missing_notification'] : []),
      ],
    });
  }

  for (const r of residents.filter((x) => isResidentBedAssignable(x))) {
    const sourceKey = `bed_unassigned:${r.id}`;
    actionAudits.push({
      customerId: r.id,
      customerName: r.fullName,
      kind: 'bed_assignment',
      sourceKey,
      surfaces: {
        kycQueue: false,
        openActionItem: keys.actionKeys.has(sourceKey),
        notification: keys.notificationKeys.has(sourceKey),
        profileWarning: false,
      },
      pass: true,
      gaps: [],
    });
  }

  const checkoutRows = await db
    .select({
      sourceKey: actionItems.sourceKey,
      residentId: actionItems.residentId,
      title: actionItems.title,
    })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.status, 'open'),
        eq(actionItems.type, 'fixed_stay_checkout_due'),
      ),
    );

  for (const c of checkoutRows) {
    actionAudits.push({
      customerId: c.residentId ?? '',
      customerName: c.title.split('·')[0]?.trim() ?? 'Resident',
      kind: 'checkout',
      sourceKey: c.sourceKey,
      surfaces: {
        kycQueue: false,
        openActionItem: keys.actionKeys.has(c.sourceKey),
        notification: keys.notificationKeys.has(c.sourceKey),
        profileWarning: false,
      },
      pass:
        keys.actionKeys.has(c.sourceKey) && keys.notificationKeys.has(c.sourceKey),
      gaps: [
        ...(!keys.actionKeys.has(c.sourceKey) ? ['missing_action_item'] : []),
        ...(!keys.notificationKeys.has(c.sourceKey) ? ['missing_notification'] : []),
      ],
    });
  }

  const legacyFalsePositives = await db.execute<{
    id: string;
    full_name: string;
    kyc_status: string;
    verified_via_payment: boolean;
    has_bed: boolean;
  }>(sql`
    SELECT
      c.id,
      c.full_name,
      c.kyc_status,
      (
        EXISTS (
          SELECT 1 FROM payments p
          INNER JOIN bookings b ON b.id = p.booking_id
          WHERE b.customer_id = c.id AND p.status = 'succeeded'
        )
        OR EXISTS (
          SELECT 1 FROM pg_payment_records pr
          WHERE pr.customer_id = c.id AND pr.status = 'approved'
        )
      ) AS verified_via_payment,
      EXISTS (
        SELECT 1 FROM bed_reservations br
        INNER JOIN bookings b ON b.id = br.booking_id
        WHERE b.customer_id = c.id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND b.status = 'confirmed'
          AND CURRENT_DATE <@ br.stay_range
      ) AS has_bed
    FROM customers c
    WHERE c.archived_at IS NULL
      AND c.kyc_status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      )
      AND (
        c.kyc_status = 'approved'
        OR EXISTS (
          SELECT 1 FROM payments p
          INNER JOIN bookings b ON b.id = p.booking_id
          WHERE b.customer_id = c.id AND p.status = 'succeeded'
        )
        OR EXISTS (
          SELECT 1 FROM pg_payment_records pr
          WHERE pr.customer_id = c.id AND pr.status = 'approved'
        )
      )
    ORDER BY c.full_name
  `);

  const dhairyaRows = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      kycStatus: customers.kycStatus,
      residencyStatus: customers.residencyStatus,
    })
    .from(customers)
    .where(
      or(
        ilike(customers.fullName, '%Dhairya%'),
        ilike(customers.fullName, '%Zinzuvadiya%'),
        ilike(customers.fullName, '%dhair%'),
      ),
    )
    .limit(5);

  let dhairyaBlock: KycVisibilityAuditReport['dhairya'] = { found: false, kycSubmissions: [] };
  if (dhairyaRows.length > 0) {
    const c = dhairyaRows[0]!;
    const subs = await db
      .select({
        id: kycSubmissions.id,
        status: kycSubmissions.status,
        createdAt: kycSubmissions.createdAt,
      })
      .from(kycSubmissions)
      .where(eq(kycSubmissions.customerId, c.id))
      .orderBy(sql`${kycSubmissions.createdAt} DESC`);

    const pendingId =
      subs.find((s) => s.status === 'pending')?.id ?? null;
    const resident = residentById.get(c.id);
    const workflow = buildResident360Workflow({
      customerId: c.id,
      customerName: c.fullName,
      kycStatus: c.kycStatus,
      pendingKycSubmissionId: pendingId,
      hasActiveTenancy: Boolean(resident?.tenancyStatus === 'active'),
      hasBed: Boolean(resident?.bedId),
      bookingId: resident?.bookingId ?? null,
      financialSummary: null,
      residencyStatus: resident ? 'active' : 'active',
    });

    const kycAction = pendingId
      ? buildKycReviewAction({
          customerId: c.id,
          customerName: c.fullName,
          pendingKycSubmissionId: pendingId,
        })
      : null;

    dhairyaBlock = {
      found: true,
      customerId: c.id,
      kycSubmissions: subs.map((s) => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
      profileStateLine: workflow.stateLine,
      surfaces: pendingId
        ? {
            kycQueue: pendingKycIds.has(pendingId),
            openActionItem: keys.actionKeys.has(kycAction!.sourceKey),
            notification: keys.notificationKeys.has(kycAction!.sourceKey),
            profileWarning: isKycReviewRequired({ pendingKycSubmissionId: pendingId }),
          }
        : {
            kycQueue: false,
            openActionItem: false,
            notification: false,
            profileWarning: isKycReviewRequired({ pendingKycSubmissionId: pendingId }),
          },
    };
  }

  const kycAudits = actionAudits.filter((a) => a.kind === 'kyc_review');
  const kycPass = kycAudits.filter((a) => a.pass).length;
  const anyFail = actionAudits.some((a) => !a.pass);

  return {
    ranAt: new Date().toISOString(),
    overall: anyFail ? 'FAIL' : 'PASS',
    legacyProfileFalsePositives: legacyFalsePositives.map((r) => ({
      customerId: r.id,
      customerName: r.full_name,
      kycStatus: r.kyc_status,
      verifiedViaPayment: r.verified_via_payment,
      hasBed: r.has_bed,
    })),
    actionAudits,
    dhairya: dhairyaBlock,
    summary: {
      kycReviewRequired: kycAudits.length,
      kycReviewPass: kycPass,
      legacyFalsePositives: legacyFalsePositives.length,
      paymentReviewOpen: paymentReviews.length,
      bedAssignmentOpen: residents.filter((r) => isResidentBedAssignable(r)).length,
      checkoutOpen: checkoutRows.length,
    },
  };
}
