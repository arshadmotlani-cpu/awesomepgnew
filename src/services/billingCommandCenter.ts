import {
  listAdminElectricityInvoicesForReminders,
  listAdminOpenRentInvoices,
  type AdminElectricityInvoiceReminderRow,
  type AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  reconcileAndEvaluateBillingCycle,
  type BillingCycleReconciliation,
} from '@/src/services/billingCycleReconciliation';

export type BillingCommandCard = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: 'default' | 'warn' | 'urgent';
};

export type BillingCommandCenterSnapshot = {
  billingMonth: string;
  rentWaitingCount: number;
  electricityWaitingCount: number;
  bothDueCount: number;
  paymentReviewCount: number;
  overdueCount: number;
  moveOutCount: number;
  kycReviewCount: number;
  pendingInvoiceCount: number;
  totalOutstandingPaise: number;
  totalBilledPaise: number;
  totalCollectedPaise: number;
  collectionPct: number;
  cards: BillingCommandCard[];
  hasUnpaidInvoices: boolean;
  reconciliation: BillingCycleReconciliation;
};

function waitingForPaymentRent(rows: AdminRentInvoiceRow[]) {
  return rows.filter(
    (r) =>
      r.outstandingPaise > 0 &&
      r.effectiveStatus !== 'paid' &&
      r.effectiveStatus !== 'cancelled' &&
      r.effectiveStatus !== 'payment_in_progress',
  );
}

function waitingForPaymentElectricity(rows: AdminElectricityInvoiceReminderRow[]) {
  return rows.filter((r) => r.outstandingPaise > 0 && !r.paymentProofUrl);
}

function countBothDue(
  rentWaiting: AdminRentInvoiceRow[],
  elecWaiting: AdminElectricityInvoiceReminderRow[],
) {
  const rentByCustomer = new Set(rentWaiting.map((r) => r.customerId));
  let both = 0;
  for (const e of elecWaiting) {
    if (rentByCustomer.has(e.customerId)) both += 1;
  }
  return both;
}

export async function loadBillingCommandCenterSnapshot(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<BillingCommandCenterSnapshot> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [openRent, elecPending, paymentReviews, kycPending, moveOut, reconciliation] =
    await Promise.all([
    listAdminOpenRentInvoices(),
    listAdminElectricityInvoicesForReminders(),
    listPendingPaymentReviews(session),
    listPendingKycSubmissions(),
    getMoveOutPipelineSnapshot(session),
    reconcileAndEvaluateBillingCycle(session, billingMonth),
  ]);

  const allUnpaidRent = openRent.ok ? openRent.data : [];
  const allUnpaidElectricity = elecPending.ok ? elecPending.data : [];

  const rentWaiting = waitingForPaymentRent(allUnpaidRent);
  const elecWaiting = waitingForPaymentElectricity(allUnpaidElectricity);
  const bothDueCount = countBothDue(rentWaiting, elecWaiting);

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: allUnpaidElectricity,
  });
  const overdueCount = collectionsQueue.filter((q) => q.priority === 'overdue').length;

  const rentInReview = allUnpaidRent.filter((r) => r.effectiveStatus === 'payment_in_progress');
  const elecInReview = allUnpaidElectricity.filter((r) => r.paymentProofUrl);

  const totalBilledPaise = reconciliation.metrics.totalBilledPaise;
  const totalCollectedPaise = reconciliation.metrics.totalCollectedPaise;
  const totalOutstandingPaise = reconciliation.metrics.totalOutstandingPaise;
  const collectionPct = reconciliation.metrics.collectionPct;

  const cards: BillingCommandCard[] = [
    {
      id: 'rent_waiting',
      label: 'Waiting to pay rent',
      count: rentWaiting.length,
      href: '/admin/billing?tab=rent',
      tone: rentWaiting.length > 0 ? 'warn' : 'default',
    },
    {
      id: 'electricity_waiting',
      label: 'Waiting to pay electricity',
      count: elecWaiting.length,
      href: '/admin/billing?tab=electricity',
      tone: elecWaiting.length > 0 ? 'warn' : 'default',
    },
    {
      id: 'both_due',
      label: 'Both rent & electricity due',
      count: bothDueCount,
      href: '/admin/billing?tab=billing',
      tone: bothDueCount > 0 ? 'urgent' : 'default',
    },
    {
      id: 'payment_reviews',
      label: 'Payment screenshots to review',
      count: paymentReviews.length,
      href: '/admin/operations/payment-reviews',
      tone: paymentReviews.length > 0 ? 'urgent' : 'default',
    },
    {
      id: 'admin_review',
      label: 'Waiting for admin review',
      count: reconciliation.metrics.waitingAdminReview,
      href: '/admin/operations/payment-reviews',
      tone: reconciliation.metrics.waitingAdminReview > 0 ? 'urgent' : 'default',
    },
    {
      id: 'overdue',
      label: 'Overdue invoices',
      count: overdueCount,
      href: '/admin/billing?tab=billing',
      tone: overdueCount > 0 ? 'urgent' : 'default',
    },
    {
      id: 'move_outs',
      label: 'Move-outs in progress',
      count: moveOut.activeItems.length,
      href: '/admin/operations/residents?filter=move_out',
      tone: moveOut.activeItems.length > 0 ? 'warn' : 'default',
    },
    {
      id: 'kyc',
      label: 'KYC reviews',
      count: kycPending.length,
      href: '/admin/operations/residents?filter=kyc',
      tone: kycPending.length > 0 ? 'warn' : 'default',
    },
  ];

  const hasUnpaidInvoices =
    rentWaiting.length > 0 ||
    elecWaiting.length > 0 ||
    rentInReview.length > 0 ||
    elecInReview.length > 0;

  return {
    billingMonth,
    rentWaitingCount: rentWaiting.length,
    electricityWaitingCount: elecWaiting.length,
    bothDueCount,
    paymentReviewCount: paymentReviews.length,
    overdueCount,
    moveOutCount: moveOut.activeItems.length,
    kycReviewCount: kycPending.length,
    pendingInvoiceCount:
      rentWaiting.length + elecWaiting.length + rentInReview.length + elecInReview.length,
    totalOutstandingPaise,
    totalBilledPaise,
    totalCollectedPaise,
    collectionPct,
    cards: cards.filter((c) => c.count > 0),
    hasUnpaidInvoices,
    reconciliation,
  };
}
