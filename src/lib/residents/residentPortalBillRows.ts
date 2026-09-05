/**
 * Resident portal bill row builder — single source for due/paid/cancelled invoice rows.
 */
import { isWithinLastDays } from '@/src/services/billingRevenueMetrics';
import { isElectricityAwaitingAdminApproval, isElectricityCoveredByPriorCollection } from '@/src/lib/billing/electricityCollectibility';
import { roomMonthCollectionKey } from '@/src/lib/billing/electricityPriorCollection';
import type { PaymentProofRejection } from '@/src/db/schema/paymentProofRejections';
import type {
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
} from '@/src/db/queries/customer';
import { formatDate, titleCase } from '@/src/lib/format';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice, rentInvoiceIssueDate } from '@/src/services/rentInvoices';
import {
  logResidentBillRowProjectionError,
  unavailableBillDueRow,
} from '@/src/lib/residents/residentPortalBillRowSafe';
import { formatPaymentModeLabel } from '@/src/lib/billing/paymentModeLabels';
import type { PaidHistoryRow } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';
import { isCancelledResidentInvoiceStatus } from '@/src/lib/residents/residentPortalDisplay';
import { electricityUseProRataFromRow } from '@/src/lib/residents/residentElectricityHistoryPresentation';
import { buildResidentRentBillPresentation } from '@/src/lib/residents/residentBillingPeriodDisplay';

export type ResidentBillRentInvoice = {
  billingMonth: string;
  notes: string | null;
  invoiceSubtype: 'standard' | 'billing_cycle_transition';
};

function rentBillDisplayFields(r: ResidentBillRentInvoice) {
  const pres = buildResidentRentBillPresentation({
    billingMonth: r.billingMonth,
    notes: r.notes,
    invoiceSubtype: r.invoiceSubtype,
  });
  return {
    label: pres.listLabel,
    billingPeriodLabel: pres.periodLabel,
    billingPeriodLine: pres.billingPeriodLine,
    transitionExplanation: pres.transitionExplanation,
  };
}

export type ResidentBillDetail = {
  bookingId: string;
  rent: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
  electricity: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
};

export type BuildResidentBillRowsOptions = {
  paidWindowDays?: number;
  activeRejections?: Map<string, PaymentProofRejection>;
  paymentProviders?: Map<string, string | null>;
  /** bookingId → (roomId:billingMonth → prior collection paise) */
  electricityPriorCollectionByBooking?: Map<string, Map<string, number>>;
};

export type BuildResidentBillRowsResult = {
  dueBillRows: PaymentDueRow[];
  pendingApprovalRows: PaymentDueRow[];
  rejectedBillRows: PaymentDueRow[];
  paidBillRows: PaidHistoryRow[];
  cancelledBillRows: PaidHistoryRow[];
  homeUpcoming: UpcomingPaymentRow[];
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
};

function labelResidentStatus(value: string | null | undefined): string {
  return titleCase((value ?? 'pending').replace(/_/g, ' '));
}

function rejectionFor(
  rejections: Map<string, PaymentProofRejection>,
  entityType: string,
  entityId: string,
): PaymentProofRejection | undefined {
  return rejections.get(`${entityType}:${entityId}`);
}

function paymentModeLabel(
  paymentProviders: Map<string, string | null> | undefined,
  paymentId: string | null | undefined,
): string | null {
  if (!paymentId || !paymentProviders) return null;
  return formatPaymentModeLabel(paymentProviders.get(paymentId) ?? null);
}

/** Re-export for server tests. */
export { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';

export function buildResidentBillRowsFromDetail(
  detail: ResidentBillDetail[],
  options: BuildResidentBillRowsOptions = {},
): BuildResidentBillRowsResult {
  const activeRejections = options.activeRejections ?? new Map();
  const paymentProviders = options.paymentProviders;
  const dueBillRows: PaymentDueRow[] = [];
  const pendingApprovalRows: PaymentDueRow[] = [];
  const rejectedBillRows: PaymentDueRow[] = [];
  const paidBillRows: PaidHistoryRow[] = [];
  const cancelledBillRows: PaidHistoryRow[] = [];
  const homeUpcoming: UpcomingPaymentRow[] = [];
  let firstUnpaidRentId: string | null = null;
  let firstUnpaidElectricityId: string | null = null;

  for (const d of detail) {
    const rentRows = d.rent.ok ? d.rent.data : [];
    const electricityRows = d.electricity.ok ? d.electricity.data : [];

    for (const r of rentRows) {
      try {
      if (isCancelledResidentInvoiceStatus(r.status)) {
        const display = rentBillDisplayFields(r);
        cancelledBillRows.push({
          id: r.id,
          label: display.label,
          billingPeriodLabel: display.billingPeriodLabel,
          billingPeriodLine: display.billingPeriodLine,
          transitionExplanation: display.transitionExplanation,
          amountPaise: r.rentPaise,
          paidAt: null,
          status: 'cancelled',
          invoiceNumber: r.invoiceNumber,
        });
        continue;
      }
      if (r.status === 'paid') {
        if (options.paidWindowDays == null || isWithinLastDays(r.paidAt, options.paidWindowDays)) {
          const mode = paymentModeLabel(paymentProviders, r.paymentId);
          const display = rentBillDisplayFields(r);
          paidBillRows.push({
            id: r.id,
            label: display.label,
            billingPeriodLabel: display.billingPeriodLabel,
            billingPeriodLine: display.billingPeriodLine,
            transitionExplanation: display.transitionExplanation,
            amountPaise: r.paidPrincipalPaise + r.paidLateFeePaise,
            paidAt: r.paidAt ? formatDate(r.paidAt) : null,
            status: 'paid',
            invoiceNumber: r.invoiceNumber,
            paymentModeLabel: mode,
            subtitle: mode ? `Paid via ${mode}` : null,
          });
        }
        continue;
      }
      const projected = projectInvoice({
        ...r,
        cancelledAt: null,
        cancellationReason: null,
        customerId: '',
        bedId: '',
        pgId: '',
        paymentId: r.paymentId ?? null,
        isAdhoc: r.isAdhoc,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
      const outstanding = projected.outstandingPaise;
      if (outstanding <= 0) continue;

      const display = rentBillDisplayFields(r);
      const rentRejection = rejectionFor(activeRejections, 'rent_invoice', r.id);
      if (rentRejection && !r.paymentProofUrl) {
        rejectedBillRows.push({
          key: `rent-${r.id}`,
          label: display.label,
          billingPeriodLabel: display.billingPeriodLabel,
          billingPeriodLine: display.billingPeriodLine,
          transitionExplanation: display.transitionExplanation,
          amountPaise: outstanding,
          dueDate: r.dueDate,
          href: `/account/resident/pay-rent/${r.id}`,
          status: 'Rejected',
          invoiceNumber: r.invoiceNumber,
          rejectionReason: rentRejection.reasonLabel,
          rejectionMessage: rentRejection.residentMessage,
        });
        continue;
      }

      if (projected.effectiveStatus === 'payment_in_progress') {
        pendingApprovalRows.push({
          key: `rent-${r.id}`,
          label: display.label,
          billingPeriodLabel: display.billingPeriodLabel,
          billingPeriodLine: display.billingPeriodLine,
          transitionExplanation: display.transitionExplanation,
          amountPaise: outstanding,
          dueDate: r.dueDate,
          href: `/account/resident/pay-rent/${r.id}`,
          status: 'Waiting for admin approval',
          invoiceNumber: r.invoiceNumber,
        });
        continue;
      }
      if (!firstUnpaidRentId) firstUnpaidRentId = r.id;
      const row: PaymentDueRow = {
        key: `rent-${r.id}`,
        label: display.label,
        billingPeriodLabel: display.billingPeriodLabel,
        billingPeriodLine: display.billingPeriodLine,
        transitionExplanation: display.transitionExplanation,
        amountPaise: outstanding,
        dueDate: r.dueDate,
        href: `/account/resident/pay-rent/${r.id}`,
        status: labelResidentStatus(projected.effectiveStatus),
        invoiceNumber: r.invoiceNumber,
        rentIssueDate: r.createdAt ? rentInvoiceIssueDate(r) : r.dueDate,
        lateFeePaise: projected.accruedLateFeePaise,
      };
      dueBillRows.push(row);
      homeUpcoming.push({
        key: row.key,
        label: row.label,
        billingPeriodLabel: row.billingPeriodLabel,
        amountPaise: row.amountPaise,
        dueDate: row.dueDate,
        href: row.href,
        status: row.status,
      });

      if (
        projected.effectiveStatus === 'partial' &&
        r.paidPrincipalPaise + r.paidLateFeePaise > 0
      ) {
        const mode = paymentModeLabel(paymentProviders, r.paymentId);
        const partialDisplay = rentBillDisplayFields(r);
        paidBillRows.push({
          id: r.id,
          label: partialDisplay.label,
          billingPeriodLabel: partialDisplay.billingPeriodLabel,
          billingPeriodLine: partialDisplay.billingPeriodLine,
          transitionExplanation: partialDisplay.transitionExplanation,
          amountPaise: r.paidPrincipalPaise + r.paidLateFeePaise,
          paidAt: r.paidAt ? formatDate(r.paidAt) : null,
          status: 'partial',
          invoiceNumber: r.invoiceNumber,
          paymentModeLabel: mode,
          subtitle: mode ? `Paid via ${mode}` : null,
        });
      }
      } catch (error) {
        logResidentBillRowProjectionError({
          scope: 'rent',
          entityId: r.id,
          bookingId: d.bookingId,
          bookingCode: r.bookingCode,
          error,
        });
        dueBillRows.push(
          unavailableBillDueRow({
            key: `rent-unavailable-${r.id}`,
            invoiceNumber: r.invoiceNumber,
            label: `Rent · ${r.invoiceNumber ?? r.id}`,
          }),
        );
      }
    }

    for (const e of electricityRows) {
      try {
      const priorCollection =
        options.electricityPriorCollectionByBooking
          ?.get(d.bookingId)
          ?.get(roomMonthCollectionKey(e.roomId, e.billingMonth)) ?? 0;
      if (isElectricityCoveredByPriorCollection({
        invoiceAmountPaise: e.amountPaise,
        priorCollectionPaise: priorCollection,
      })) {
        continue;
      }
      if (isCancelledResidentInvoiceStatus(e.status)) {
        cancelledBillRows.push({
          id: e.id,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: e.amountPaise,
          paidAt: null,
          status: 'cancelled',
          invoiceNumber: e.invoiceNumber,
        });
        continue;
      }
      if (e.status === 'paid') {
        if (options.paidWindowDays == null || isWithinLastDays(e.paidAt, options.paidWindowDays)) {
          const mode = paymentModeLabel(paymentProviders, e.paymentId);
          paidBillRows.push({
            id: e.id,
            label: `Electricity · ${formatDate(e.billingMonth)}`,
            amountPaise: e.paidPaise + (e.lateFeeLockedPaise ?? 0),
            paidAt: e.paidAt ? formatDate(e.paidAt) : null,
            status: 'paid',
            invoiceNumber: e.invoiceNumber,
            detailHref: `/account/resident/pay-electricity/${e.id}`,
            paymentModeLabel: mode,
            subtitle: mode ? `Paid via ${mode}` : null,
          });
        }
        continue;
      }
      const projected = projectElectricityInvoice({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        electricityBillId: e.electricityBillId,
        roomId: e.roomId,
        bookingId: e.bookingId,
        customerId: '',
        bedId: '',
        billingMonth: e.billingMonth,
        dueDate: e.dueDate,
        amountPaise: e.amountPaise,
        paidPaise: e.paidPaise,
        lateFeeLockedPaise: e.lateFeeLockedPaise,
        status: e.status,
        paymentId: e.paymentId ?? null,
        paidAt: e.paidAt,
        paymentProofUrl: null,
        unitsShare: e.unitsShare,
        activeDays: e.activeDays,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        lateFeeWaived: e.lateFeeWaived ?? false,
      });
      const outstanding = projected.outstandingPaise;
      if (outstanding <= 0) continue;

      const elecRejection = rejectionFor(activeRejections, 'electricity_invoice', e.id);
      if (elecRejection && !e.paymentProofUrl) {
        rejectedBillRows.push({
          key: `elec-${e.id}`,
          electricityInvoiceId: e.id,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: e.dueDate,
          href: `/account/resident/pay-electricity/${e.id}`,
          status: 'Rejected',
          invoiceNumber: e.invoiceNumber,
          rejectionReason: elecRejection.reasonLabel,
          rejectionMessage: elecRejection.residentMessage,
        });
        continue;
      }

      if (
        isElectricityAwaitingAdminApproval({
          status: e.status,
          paymentProofUrl: e.paymentProofUrl,
        })
      ) {
        pendingApprovalRows.push({
          key: `elec-${e.id}`,
          electricityInvoiceId: e.id,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: e.dueDate,
          href: `/account/resident/pay-electricity/${e.id}`,
          status: 'Waiting for admin approval',
          invoiceNumber: e.invoiceNumber,
        });
        continue;
      }

      if (!firstUnpaidElectricityId) firstUnpaidElectricityId = e.id;
      const useProRata = electricityUseProRataFromRow(e);
      const row: PaymentDueRow = {
        key: `elec-${e.id}`,
        electricityInvoiceId: e.id,
        label: `Electricity · ${formatDate(e.billingMonth)}`,
        amountPaise: outstanding,
        dueDate: e.dueDate,
        href: `/account/resident/pay-electricity/${e.id}`,
        status: labelResidentStatus(projected.effectiveStatus),
        invoiceNumber: e.invoiceNumber,
        electricityUseProRata: useProRata,
        electricityDueDate: e.dueDate,
      };
      dueBillRows.push(row);
      homeUpcoming.push({
        key: row.key,
        label: row.label,
        amountPaise: row.amountPaise,
        dueDate: row.dueDate,
        href: row.href,
        status: row.status,
      });
      } catch (error) {
        logResidentBillRowProjectionError({
          scope: 'electricity',
          entityId: e.id,
          bookingId: d.bookingId,
          bookingCode: e.bookingCode,
          error,
        });
        dueBillRows.push(
          unavailableBillDueRow({
            key: `elec-unavailable-${e.id}`,
            invoiceNumber: e.invoiceNumber,
            label: `Electricity · ${e.invoiceNumber ?? e.id}`,
          }),
        );
      }
    }
  }

  return {
    dueBillRows,
    pendingApprovalRows,
    rejectedBillRows,
    paidBillRows,
    cancelledBillRows,
    homeUpcoming,
    firstUnpaidRentId,
    firstUnpaidElectricityId,
  };
}
