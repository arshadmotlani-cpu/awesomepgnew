import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoiceDetailActions } from '@/src/components/admin/InvoiceDetailActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import { getInvoiceVoidCapabilities } from '@/src/services/invoiceVoid';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const [document, voidCaps] = await Promise.all([
    getInvoiceDocumentDetail(invoiceId),
    getInvoiceVoidCapabilities(invoiceId),
  ]);
  if (!document) notFound();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.invoices.label, href: ADMIN_MODULES.invoices.href },
          { label: document.invoiceNumber },
        ]}
      />
      <PageHeader
        title={`Invoice ${document.invoiceNumber}`}
        description={`${document.pgName} · ${document.customerName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/invoices/${invoiceId}/print`}
              target="_blank"
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
            >
              Print
            </Link>
            <Link
              href="/admin/invoices"
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
            >
              ← All invoices
            </Link>
          </div>
        }
      />

      <div className="mb-6">
        <InvoiceDocument document={document} variant="admin" />
      </div>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Actions</h2>
        <InvoiceDetailActions
          invoiceId={document.id}
          status={document.status}
          canVoidExpressSale={voidCaps.canVoidExpressSale}
          bookingCode={voidCaps.bookingCode}
        />
      </section>
    </>
  );
}
