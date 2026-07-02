'use client';

import { ResidentInlineOpenBills } from '@/src/components/admin/residents/ResidentInlineOpenBills';
import { ResidentActionBar } from '@/src/components/admin/ResidentActionBar';
import { FinancialCommandCenter } from '@/src/components/admin/FinancialCommandCenter';
import { isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentCommandCenterData } from '@/src/lib/residents/commandCenterTypes';
import { CommandCenterSection } from '@/src/components/admin/residents/command-center/CommandCenterSection';

export function CommandCenterQuickActions({ data }: { data: ResidentCommandCenterData }) {
  if (data.isVacated || !data.activeTenancy || !data.financialAccount) return null;

  const t = data.activeTenancy;
  const fin = data.financialAccount;
  const billing = data.billingDefaults;
  const monthly = isMonthlyStayType(t.stayType);

  const rentItem = fin.rent.items.find((i) => i.outstandingPaise > 0);
  const elecItem = fin.electricity.items.find((i) => i.outstandingPaise > 0);

  return (
    <CommandCenterSection
      id="quick-actions"
      title="Quick actions"
      description="Collect rent, electricity, deposit, generate invoices, send payment links — existing workflows only."
    >
      <div className="space-y-6">
        {monthly && billing ? (
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
              data.canMarkCash
                ? { canSettle: true, adminName: data.adminName }
                : null
            }
            embedded
          />
        ) : null}

        <div className="rounded-xl border border-white/5 bg-[#12161C] p-3">
          <ResidentActionBar
            customerId={data.customer.id}
            customerName={data.customer.fullName}
            phone={data.customer.phone}
            kycStatus={data.customer.kycStatus}
            pgId={t.pgId}
            pgName={t.pgName}
            roomNumber={t.roomNumber}
            bookingId={t.bookingId}
            monthlyRentPaise={t.monthlyRentPaise}
            pendingRentPaise={fin.rent.outstandingPaise}
            rentDueDate={billing?.nextRentDueDate}
            rentOverdue={rentItem?.status === 'overdue'}
            depositDuePaise={fin.deposit.outstandingPaise}
            depositRefundablePaise={data.depositSummary?.refundableBalancePaise}
            pendingElectricityPaise={fin.electricity.outstandingPaise}
            electricityDueDate={elecItem?.dueDate ?? undefined}
            electricityOverdue={elecItem?.status === 'overdue'}
            electricityInvoiceNumber={elecItem?.invoiceNumber ?? undefined}
          />
        </div>

        <FinancialCommandCenter
          summary={fin}
          invoiceHistory={data.invoiceHistory}
          depositWallet={data.depositSummary}
          bookingId={t.bookingId}
        />
      </div>
    </CommandCenterSection>
  );
}
