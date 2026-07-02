'use client';

import Link from 'next/link';
import { ResidentInlineOpenBills } from '@/src/components/admin/residents/ResidentInlineOpenBills';
import { isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentCommandCenterData } from '@/src/lib/residents/commandCenterTypes';
import { checkoutRefundHref } from '@/src/lib/residents/commandCenterLinks';
import { CommandCenterSection } from '@/src/components/admin/residents/command-center/CommandCenterSection';

export function CommandCenterQuickActions({ data }: { data: ResidentCommandCenterData }) {
  if (data.isVacated || !data.activeTenancy || !data.financialAccount) return null;

  const t = data.activeTenancy;
  const fin = data.financialAccount;
  const billing = data.billingDefaults;
  const monthly = isMonthlyStayType(t.stayType);
  const refundDuePaise = fin.refundBalancePaise;

  if (!monthly || !billing) {
    if (refundDuePaise <= 0) return null;
    return (
      <CommandCenterSection
        id="quick-actions"
        title="Quick actions"
        description="Operational shortcuts for this resident."
      >
        <Link
          href={checkoutRefundHref(t.bookingId)}
          className="inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Refund of Deposit →
        </Link>
      </CommandCenterSection>
    );
  }

  return (
    <CommandCenterSection
      id="quick-actions"
      title="Quick actions"
      description="Collect rent, electricity, and deposit — one billing surface."
    >
      <div className="space-y-4">
        <ResidentInlineOpenBills
          customerId={data.customer.id}
          customerName={data.customer.fullName}
          phone={data.customer.phone}
          pgId={t.pgId}
          pgName={t.pgName}
          roomNumber={t.roomNumber}
          bookingId={t.bookingId}
          billingDefaults={billing}
          financialSummary={fin}
          cashSettlement={
            data.canMarkCash ? { canSettle: true, adminName: data.adminName } : null
          }
          embedded
        />
        {refundDuePaise > 0 ? (
          <Link
            href={checkoutRefundHref(t.bookingId)}
            className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
          >
            Refund of Deposit — {refundDuePaise > 0 ? 'refund due' : 'deposit wallet'}
          </Link>
        ) : null}
      </div>
    </CommandCenterSection>
  );
}
