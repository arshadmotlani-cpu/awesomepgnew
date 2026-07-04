import {
  type AdminElectricityInvoiceReminderRow,
  type AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { BILLING_INVOICE_REVIEW_HREF } from '@/src/lib/approvals/approvalRegistry';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { getWaitingForApprovalCount } from '@/src/services/approvalService';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  loadBillingReconciliationSafe,
  type BillingCycleReconciliation,
} from '@/src/services/billingCycleReconciliation';
import {
  computeOutstandingMoneyFromInvoices,
  loadInvoiceOutstandingSnapshot,
} from '@/src/services/financialSummaryService';
import type { AdminSession } from '@/src/lib/auth/session';

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
  reconciliation: BillingCycleReconciliation | null;
  reconciliationError: string | null;
};

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

  const [invoiceSnapshot, paymentReviewCount, kycPending, moveOut, billingCert] = await Promise.all([
    loadInvoiceOutstandingSnapshot(session),
    getWaitingForApprovalCount(session),
    listPendingKycSubmissions(),
    getMoveOutPipelineSnapshot(session),
    loadBillingReconciliationSafe(session, billingMonth),
  ]);

  const reconciliation = billingCert.ok ? billingCert.reconciliation : null;

  const allUnpaidRent = invoiceSnapshot.allOpenRent;
  const allUnpaidElectricity = invoiceSnapshot.allOpenElectricity;
  const rentWaiting = invoiceSnapshot.rentWaiting;
  const elecWaiting = invoiceSnapshot.electricityWaiting;
  const bothDueCount = countBothDue(rentWaiting, elecWaiting);

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: allUnpaidElectricity,
  });
  const overdueCount = collectionsQueue.filter((q) => q.priority === 'overdue').length;

  const rentInReview = invoiceSnapshot.rentInReview;
  const elecInReview = invoiceSnapshot.electricityInReview;
  const invoiceOutstanding = computeOutstandingMoneyFromInvoices(invoiceSnapshot);

  const totalBilledPaise = reconciliation?.metrics.totalBilledPaise ?? 0;
  const totalCollectedPaise = reconciliation?.metrics.totalCollectedPaise ?? 0;
  const totalOutstandingPaise =
    reconciliation?.metrics.totalOutstandingPaise ?? invoiceOutstanding.totalOutstandingPaise;
  const collectionPct = reconciliation?.metrics.collectionPct ?? 0;
  const waitingAdminReview = reconciliation?.metrics.waitingAdminReview ?? rentInReview.length + elecInReview.length;

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
      count: paymentReviewCount,
      href: operationsFilterHref('waiting_for_approval'),
      tone: paymentReviewCount > 0 ? 'urgent' : 'default',
    },
    {
      id: 'admin_review',
      label: 'Waiting for admin review',
      count: waitingAdminReview,
      href: BILLING_INVOICE_REVIEW_HREF,
      tone: waitingAdminReview > 0 ? 'urgent' : 'default',
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
      href: '/admin/operations?filter=move_out',
      tone: moveOut.activeItems.length > 0 ? 'warn' : 'default',
    },
    {
      id: 'kyc',
      label: 'KYC reviews',
      count: kycPending.length,
      href: '/admin/operations?filter=kyc',
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
    paymentReviewCount,
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
    reconciliationError: billingCert.ok ? null : billingCert.error,
  };
}
