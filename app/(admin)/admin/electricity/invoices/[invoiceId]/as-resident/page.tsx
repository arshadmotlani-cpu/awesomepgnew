import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ResidentPayElectricityPageContent } from '@/src/components/customer/account/resident/ResidentPayElectricityPageContent';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { loadResidentPayElectricityPageData } from '@/src/services/residentPayElectricityPage';

export const dynamic = 'force-dynamic';

export default async function AdminElectricityInvoiceAsResidentPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const { invoiceId } = await params;

  const data = await loadResidentPayElectricityPageData(invoiceId);
  if (!data) notFound();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          {
            label: data.invoice.invoiceNumber,
            href: `/admin/invoices/${invoiceId}`,
          },
          { label: 'Resident view' },
        ]}
      />

      <div className="mb-4">
        <Link
          href={`/admin/electricity/bills/${data.invoice.electricityBillId}`}
          className="text-sm text-apg-silver hover:text-white"
        >
          ← Back to room bill
        </Link>
      </div>

      <div className="rounded-3xl bg-zinc-50 ring-1 ring-zinc-200">
        <ResidentPayElectricityPageContent data={data} previewMode />
      </div>
    </>
  );
}
