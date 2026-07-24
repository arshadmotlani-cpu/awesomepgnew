import {
  formatSettlementDate,
  formatSettlementDays,
  resolveDaysPaidDisplay,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';

/** Shared "Billing & dates" rows for estimated and audit settlement sections. */
export function buildSettlementBillingDatesSectionRows(args: {
  notice: NoticeSettlementDisplay | null;
  vacatingDate: string;
  stayDays: number;
  checkInDate: string;
  checkoutDate: string;
  daysPaid: ReturnType<typeof resolveDaysPaidDisplay>;
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
      label: 'Vacating date',
      value: formatSettlementDate(args.vacatingDate),
    },
    {
      id: 'days_stayed',
      label: 'Days stayed',
      value: formatSettlementDays(args.stayDays),
      hint: `${args.checkInDate} → ${args.checkoutDate}`,
    },
    {
      id: 'days_paid',
      label: 'Days paid',
      value: args.daysPaid.value,
      hint: args.daysPaid.hint,
    },
  ];
}
