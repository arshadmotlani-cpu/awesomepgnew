import {
  formatSettlementDate,
  formatSettlementDays,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import { formatBedAvailableLabel } from '@/src/lib/vacating/vacatingBedSemantics';

/** Shared "Billing & dates" rows for estimated and audit settlement sections. */
export function buildSettlementBillingDatesSectionRows(args: {
  notice: NoticeSettlementDisplay | null;
  vacatingDate: string;
  stayDays: number;
  checkInDate: string;
  checkoutDate: string;
}): SettlementDisplaySection['rows'] {
  return [
    {
      id: 'billing_cycle',
      label: 'Billing cycle',
      value: args.notice?.billingCycleLabel ?? '—',
    },
    {
      id: 'paid_until',
      label: 'Paid until',
      value: args.notice?.paidUntilDate ? formatSettlementDate(args.notice.paidUntilDate) : '—',
    },
    {
      id: 'vacating_date',
      label: 'Vacating date (final occupied day)',
      value: formatSettlementDate(args.vacatingDate),
    },
    {
      id: 'bed_available_from',
      label: 'Bed available from',
      value: formatBedAvailableLabel(args.vacatingDate),
    },
    {
      id: 'days_stayed',
      label: 'Days stayed (rent period)',
      value: formatSettlementDays(args.stayDays),
      hint: `${args.checkInDate} → ${args.checkoutDate}`,
    },
  ];
}
