'use client';

import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { ArchiveResidentButton } from '@/src/components/admin/ArchiveResidentButton';
import { CreateChargeGeneratorForm } from '@/src/components/admin/CreateChargeGeneratorForm';
import { FinancialCommandCenter } from '@/src/components/admin/FinancialCommandCenter';
import { ResidentActionBar } from '@/src/components/admin/ResidentActionBar';
import type { DepositSummary } from '@/src/services/deposits';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';

type Props = {
  customerId: string;
  customerName: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  canArchive: boolean;
  financialSummary?: ResidentFinancialSummary | null;
  invoiceHistory: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    amountPaise: number;
    status: string;
    createdAt: Date;
    notes?: string | null;
    paidAt?: Date | null;
  }>;
  depositWallet?: DepositSummary | null;
  bookingId?: string | null;
  billingDefaults?: ResidentBillingFormDefaults | null;
  actionBar?: {
    pgId: string;
    pgName: string;
    roomNumber: string;
    monthlyRentPaise: number;
    pendingRentPaise?: number;
    rentDueDate?: string;
    rentOverdue?: boolean;
    depositDuePaise?: number;
    depositCollectionStatus?: string;
    depositRefundablePaise?: number;
    pendingElectricityPaise?: number;
    electricityBasePaise?: number;
    electricityDueDate?: string;
    electricityOverdue?: boolean;
    electricityInvoiceNumber?: string;
  } | null;
};

export function ResidentProfileAdvancedTools({
  customerId,
  customerName,
  canArchive,
  financialSummary,
  invoiceHistory,
  depositWallet,
  bookingId,
  billingDefaults,
  actionBar,
  phone,
  kycStatus,
}: Props) {
  const showBilling = financialSummary && bookingId;

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Create invoices, send category-specific WhatsApp messages, add charges, or archive signup-only accounts."
    >
      {actionBar ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
            Billing by category
          </h3>
          <ResidentActionBar
            customerId={customerId}
            customerName={customerName}
            phone={phone}
            kycStatus={kycStatus}
            pgId={actionBar.pgId}
            pgName={actionBar.pgName}
            roomNumber={actionBar.roomNumber}
            bookingId={bookingId ?? undefined}
            monthlyRentPaise={actionBar.monthlyRentPaise}
            pendingRentPaise={actionBar.pendingRentPaise}
            rentDueDate={actionBar.rentDueDate}
            rentOverdue={actionBar.rentOverdue}
            depositDuePaise={actionBar.depositDuePaise}
            depositCollectionStatus={actionBar.depositCollectionStatus}
            depositRefundablePaise={actionBar.depositRefundablePaise}
            pendingElectricityPaise={actionBar.pendingElectricityPaise}
            electricityBasePaise={actionBar.electricityBasePaise}
            electricityDueDate={actionBar.electricityDueDate}
            electricityOverdue={actionBar.electricityOverdue}
            electricityInvoiceNumber={actionBar.electricityInvoiceNumber}
          />
        </div>
      ) : null}

      {showBilling ? (
        <>
          <FinancialCommandCenter
            summary={financialSummary}
            invoiceHistory={invoiceHistory}
            depositWallet={depositWallet}
            bookingId={bookingId}
          />
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Add a new charge
            </h3>
            <CreateChargeGeneratorForm
              customerId={customerId}
              bookingId={bookingId}
              billingDefaults={billingDefaults}
            />
          </div>
        </>
      ) : null}

      {canArchive ? (
        <div className="border-t border-white/10 pt-4">
          <p className="mb-3 text-sm text-apg-silver">
            Remove signup-only accounts from the residents list. This does not delete their login.
          </p>
          <ArchiveResidentButton customerId={customerId} customerName={customerName} />
        </div>
      ) : null}
    </AdminAdvancedToolsSection>
  );
}
