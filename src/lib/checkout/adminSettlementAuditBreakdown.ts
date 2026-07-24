/**
 * Admin move-out settlement audit breakdown — merges V2 waterfall money fields
 * with notice/billing context from CheckoutSettlementDetail.
 */
import { diffDays } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import {
  formatDualDaysAndPaise,
  formatRentConsumedHint,
  formatSettlementDate,
  formatSettlementDays,
  formatSettlementPaise,
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
  PENDING_OTHER_LABEL,
  type SettlementDisplayRow,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export type AdminSettlementAuditRow = SettlementDisplayRow;
export type AdminSettlementAuditSection = SettlementDisplaySection;

export type AdminSettlementAuditBreakdown = {
  sections: AdminSettlementAuditSection[];
  usesV2: boolean;
};

export {
  formatSettlementDays as formatAuditDays,
  formatSettlementPaise as formatAuditPaise,
  isSettlementDisplayEmpty as isAuditEmpty,
} from '@/src/lib/checkout/settlementDisplayFormat';

export function buildAdminSettlementAuditBreakdown(
  detail: CheckoutSettlementDetail,
): AdminSettlementAuditBreakdown {
  const waterfall = detail.waterfall ?? null;
  const usesV2 = Boolean(waterfall) || (detail.settlementEngineVersion ?? 1) >= 2;
  const preview = detail.preview;
  const notice = detail.settlementNoticeDisplay ?? null;

  const rentPaidPaise = waterfall?.rentBucket.paidPaise ?? detail.rentPaidPaise ?? 0;
  const dailyRentPaise =
    waterfall?.rentBucket.dailyRentPaise ??
    (detail.monthlyRentPaiseSnapshot > 0
      ? Math.floor(detail.monthlyRentPaiseSnapshot / 30)
      : 0);
  const stayDays =
    waterfall?.stay.stayDays ??
    (detail.stayDays ??
      (detail.moveInDate && detail.vacatingDate
        ? Math.max(1, diffDays(detail.moveInDate, detail.vacatingDate) + 1)
        : null));

  const rentConsumedPaise =
    waterfall?.rentBucket.consumedPaise ?? detail.rentConsumedPaise ?? null;
  const unusedRentPaise = waterfall?.rentBucket.unusedPaise ?? detail.unusedRentPaise ?? null;

  const noticeFromUnusedRentPaise =
    waterfall?.notice.fromUnusedRentPaise ?? detail.noticeFromUnusedRentPaise ?? null;
  const noticeFromDepositPaise =
    waterfall?.notice.fromDepositPaise ??
    detail.noticeFromDepositPaise ??
    preview.noticeDeductionPaise;

  const electricitySharePaise = preview.electricitySharePaise ?? detail.electricitySharePaise ?? 0;
  const electricityDeductPaise = waterfall
    ? waterfall.depositBucket.electricityPaise
    : preview.electricityDeductFromDeposit
      ? preview.electricityDeductionPaise
      : 0;

  const damagePaise = preview.damageChargePaise ?? detail.damageChargePaise ?? 0;
  const cleaningPaise = preview.cleaningChargePaise ?? detail.cleaningChargePaise ?? 0;
  const customPaise = preview.customChargePaise ?? detail.customChargePaise ?? 0;
  const customLabel = detail.customChargeLabel ?? preview.customChargeLabel ?? 'Custom charge';

  const finalRefundPaise =
    waterfall?.refund.totalPaise ?? preview.finalRefundPaise ?? detail.totalRefundPaise ?? null;

  const baselineLocked = detail.approvalBaselineLocked && !detail.amountsLocked;
  const electricityPending = baselineLocked && electricityDeductPaise === 0;
  const damagePending =
    baselineLocked && damagePaise === 0 && cleaningPaise === 0 && customPaise === 0;
  const refundLabel =
    detail.amountsLocked || !baselineLocked
      ? 'Final refund'
      : electricityPending && damagePending
        ? 'Estimated refund (at approval)'
        : 'Final refund';

  const daysPaid = detail.billingCoverageDaysPaid ?? { value: '—' };

  const billing: AdminSettlementAuditSection = {
    title: 'Billing & dates',
    rows: [
      {
        id: 'billing_cycle',
        label: 'Billing cycle',
        value: notice?.billingCycleLabel ?? '—',
      },
      {
        id: 'paid_until',
        label: 'Paid until date',
        value: notice?.paidUntilDate ? formatSettlementDate(notice.paidUntilDate) : '—',
      },
      {
        id: 'vacating_date',
        label: 'Vacating date',
        value: formatSettlementDate(detail.vacatingDate),
      },
      {
        id: 'days_paid',
        label: 'Days paid',
        value: daysPaid.value,
        hint: daysPaid.auditHint ?? daysPaid.hint,
      },
    ],
  };

  const rent: AdminSettlementAuditSection = {
    title: 'Rent bucket',
    rows: [
      {
        id: 'days_stayed',
        label: 'Days stayed',
        value: formatSettlementDays(stayDays),
        hint:
          waterfall?.stay.checkInDate && waterfall?.stay.checkoutDate
            ? `${waterfall.stay.checkInDate} → ${waterfall.stay.checkoutDate}`
            : detail.moveInDate
              ? `${detail.moveInDate} → ${detail.vacatingDate}`
              : undefined,
      },
      {
        id: 'rent_consumed',
        label: 'Rent consumed',
        value: formatSettlementPaise(rentConsumedPaise),
        hint:
          stayDays != null && dailyRentPaise > 0
            ? formatRentConsumedHint(stayDays, dailyRentPaise)
            : undefined,
      },
      {
        id: 'unused_prepaid_rent',
        label: 'Unused prepaid rent',
        value: formatDualDaysAndPaise(notice?.unusedPrepaidRentDays, unusedRentPaise),
        hint: 'Calendar days after vacate covered by prepaid rent · rent paid minus consumed',
      },
    ],
  };

  const noticeSection: AdminSettlementAuditSection = {
    title: 'Notice',
    rows: [
      {
        id: 'notice_required',
        label: 'Notice required',
        value: notice ? formatSettlementDays(notice.noticeRequiredDays) : '—',
      },
      {
        id: 'notice_covered_by_unused_rent',
        label: 'Notice covered by unused rent',
        value: formatDualDaysAndPaise(
          notice?.noticeCoveredByPrepaidRent,
          noticeFromUnusedRentPaise,
        ),
      },
      {
        id: 'notice_from_deposit',
        label: 'Notice deducted from deposit',
        value: formatSettlementPaise(noticeFromDepositPaise, true),
        deduct: true,
      },
    ],
  };

  const deductionRows: AdminSettlementAuditRow[] = [
    {
      id: 'electricity',
      label: 'Electricity deduction',
      value: electricityPending
        ? PENDING_ELECTRICITY_LABEL
        : formatSettlementPaise(electricityDeductPaise, true),
      deduct: !electricityPending,
      hint:
        !electricityPending && !preview.electricityDeductFromDeposit && electricitySharePaise > 0
          ? `${paiseToInr(electricitySharePaise)} share not deducted from deposit`
          : undefined,
    },
  ];

  if (damagePaise > 0 || cleaningPaise > 0 || customPaise > 0) {
    if (damagePaise > 0) {
      deductionRows.push({
        id: 'damage',
        label: 'Damage',
        value: formatSettlementPaise(damagePaise, true),
        deduct: true,
      });
    }
    if (cleaningPaise > 0) {
      deductionRows.push({
        id: 'cleaning',
        label: 'Cleaning',
        value: formatSettlementPaise(cleaningPaise, true),
        deduct: true,
      });
    }
    if (customPaise > 0) {
      deductionRows.push({
        id: 'custom',
        label: customLabel,
        value: formatSettlementPaise(customPaise, true),
        deduct: true,
      });
    }
  } else {
    const otherPaise = waterfall?.depositBucket.otherPaise ?? damagePaise + cleaningPaise + customPaise;
    deductionRows.push({
      id: 'other_deductions',
      label: 'Damage / other deductions',
      value: damagePending ? PENDING_DAMAGES_LABEL : formatSettlementPaise(otherPaise, true),
      deduct: !damagePending,
    });
    if (damagePending) {
      deductionRows.push({
        id: 'pending_other',
        label: 'Other deductions',
        value: PENDING_OTHER_LABEL,
      });
    }
  }

  const deductions: AdminSettlementAuditSection = {
    title: baselineLocked && (electricityPending || damagePending) ? 'Pending deductions' : 'Deductions',
    rows: deductionRows,
  };

  const totals: AdminSettlementAuditSection = {
    title: 'Deposit & refund',
    rows: [
      {
        id: 'deposit_held',
        label: 'Deposit held',
        value: formatSettlementPaise(detail.depositRefundablePaise),
      },
      {
        id: 'final_refund',
        label: refundLabel,
        value: formatSettlementPaise(finalRefundPaise),
        emphasis: true,
        hint:
          waterfall && waterfall.refund.unusedRentPortionPaise > 0
            ? `Includes ${paiseToInr(waterfall.refund.unusedRentPortionPaise)} unused rent credit`
            : undefined,
      },
    ],
  };

  return {
    sections: [billing, rent, noticeSection, deductions, totals],
    usesV2,
  };
}
