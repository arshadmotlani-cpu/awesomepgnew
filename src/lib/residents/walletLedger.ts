import type { ConsoleLedgerEntry } from '@/src/components/customer/design-system/ConsoleLedger';
import type { DepositLedgerEntry } from '@/src/db/schema/depositLedger';

type PaymentRow = {
  id: string;
  purpose: string;
  amountPaise: number;
  status: string;
  paidAt: Date | string | null;
  createdAt: Date | string;
};

const PURPOSE_LABEL: Record<string, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  deposit: 'Security deposit',
  refund: 'Refund',
  booking: 'Booking payment',
  extension: 'Stay extension',
  deposit_deduction: 'Deposit charge',
  adjustment: 'Adjustment',
};

const DEPOSIT_KIND_LABEL: Record<string, string> = {
  collected: 'Security deposit',
  deducted: 'Deposit charge',
  refunded: 'Deposit refund',
};

/**
 * Build wallet ledger rows from server-provided deposit entries and payments.
 * Running balance follows the same walk order as getDepositSummaryForBooking (display only).
 */
export function buildWalletLedger(input: {
  depositEntries: DepositLedgerEntry[];
  payments: PaymentRow[];
  invoiceHrefByPaymentPurpose?: {
    rentInvoiceId?: string | null;
    electricityInvoiceId?: string | null;
  };
}): ConsoleLedgerEntry[] {
  const rows: ConsoleLedgerEntry[] = [];

  let depositBalance = 0;
  const sortedDeposit = [...input.depositEntries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const e of sortedDeposit) {
    depositBalance += e.amountPaise;
    const isCredit = e.entryKind === 'collected';
    rows.push({
      id: `deposit-${e.id}`,
      date: e.createdAt,
      typeLabel: DEPOSIT_KIND_LABEL[e.entryKind] ?? 'Deposit',
      direction: isCredit ? 'credit' : 'debit',
      amountPaise: Math.abs(e.amountPaise),
      runningBalancePaise: depositBalance,
      detail: e.reason,
      status: e.entryKind === 'collected' ? 'paid' : 'processing',
    });
  }

  for (const p of input.payments) {
    if (p.purpose === 'deposit') continue;
    if (!['rent', 'electricity', 'refund', 'deposit_deduction', 'adjustment', 'booking', 'extension'].includes(p.purpose)) {
      continue;
    }

    const isRefund = p.purpose === 'refund';
    let invoiceHref: string | null = null;
    if (p.purpose === 'rent' && input.invoiceHrefByPaymentPurpose?.rentInvoiceId) {
      invoiceHref = `/account/resident/pay-rent/${input.invoiceHrefByPaymentPurpose.rentInvoiceId}`;
    }
    if (p.purpose === 'electricity' && input.invoiceHrefByPaymentPurpose?.electricityInvoiceId) {
      invoiceHref = `/account/resident/pay-electricity/${input.invoiceHrefByPaymentPurpose.electricityInvoiceId}`;
    }

    rows.push({
      id: `payment-${p.id}`,
      date: p.paidAt ?? p.createdAt,
      typeLabel: PURPOSE_LABEL[p.purpose] ?? p.purpose,
      direction: isRefund ? 'credit' : 'debit',
      amountPaise: p.amountPaise,
      runningBalancePaise: null,
      detail: null,
      status: p.status === 'succeeded' ? 'paid' : p.status,
      invoiceHref,
    });
  }

  return rows.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function deriveWalletPrimaryAction(input: {
  amountDuePaise: number;
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  historyHref: string | null;
}): { href: string; label: string } {
  if (input.firstUnpaidRentId) {
    return {
      href: `/account/resident/pay-rent/${input.firstUnpaidRentId}`,
      label: 'Pay rent',
    };
  }
  if (input.firstUnpaidElectricityId) {
    return {
      href: `/account/resident/pay-electricity/${input.firstUnpaidElectricityId}`,
      label: 'Pay electricity',
    };
  }
  if (input.amountDuePaise > 0) {
    return {
      href: '/account/profile?section=resident&tab=payments',
      label: 'View bills to pay',
    };
  }
  return {
    href: input.historyHref ?? '/account/profile?section=resident&tab=payments',
    label: 'View history',
  };
}
