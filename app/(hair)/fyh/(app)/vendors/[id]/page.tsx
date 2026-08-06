import { notFound } from 'next/navigation';
import { VendorLedgerView } from '@/src/hair/components/vendors/VendorLedgerUi';
import { getVendorLedger } from '@/src/hair/services/purchaseBrain';
import {
  defaultStatementDateRange,
  getVendorActivityTimeline,
  getVendorDashboard,
  getVendorStatement,
} from '@/src/hair/services/vendorBrain';

type Props = { params: Promise<{ id: string }> };

export default async function VendorLedgerPage({ params }: Props) {
  const { id } = await params;
  const ledger = await getVendorLedger(id);
  if (!ledger) notFound();

  const statementPeriod = defaultStatementDateRange();
  const [dashboard, timeline, statement] = await Promise.all([
    getVendorDashboard(id),
    getVendorActivityTimeline(id),
    getVendorStatement(id, statementPeriod),
  ]);

  return (
    <VendorLedgerView
      vendor={ledger.vendor}
      outstandingPaise={ledger.outstandingPaise}
      unallocatedAdvancePaise={ledger.unallocatedAdvancePaise}
      invoices={ledger.invoices}
      payments={ledger.payments}
      dashboard={dashboard!}
      timeline={timeline}
      statement={statement}
      statementPeriod={statementPeriod}
    />
  );
}
