import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { KycApprovedDepositSearch } from '@/src/components/admin/KycApprovedDepositSearch';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listAdminDepositSummaries } from '@/src/db/queries/admin';
import { moduleHref } from '@/src/lib/admin/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsAddPage() {
  const res = await listAdminDepositSummaries();

  return (
    <>
      <PageHeader
        title="Add deposit"
        description="Record cash, UPI, or bank transfer deposits for KYC-approved residents. Ledger, reports, and revenue sync automatically."
        actions={
          <Link
            href={moduleHref('deposits')}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
          >
            ← All deposits
          </Link>
        }
      />
      {!res.ok ? <DbStatusBanner error={res.error} /> : null}
      <KycApprovedDepositSearch />
    </>
  );
}
