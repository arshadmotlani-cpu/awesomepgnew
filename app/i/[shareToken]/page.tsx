import { notFound } from 'next/navigation';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import { InvoicePdfDownloadLink } from '@/src/components/billing/InvoicePdfDownloadLink';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import { invoicePdfShareDownloadHref } from '@/src/lib/billing/invoicePdfLinks';
import { resolveInvoiceIdByShareToken } from '@/src/lib/billing/invoiceShareToken';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

/** Public invoice — no login, no resident/admin navigation, token-only URL. */
export default async function PublicInvoiceSharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const invoiceId = await resolveInvoiceIdByShareToken(shareToken);
  if (!invoiceId) notFound();

  const document = await getInvoiceDocumentDetail(invoiceId);
  if (!document) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 print:bg-white">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center print:mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Awesome PG
          </p>
          <h1 className="mt-1 text-lg font-semibold text-zinc-900">{document.invoiceNumber}</h1>
          <div className="mt-4 flex justify-center print:hidden">
            <InvoicePdfDownloadLink
              href={invoicePdfShareDownloadHref(shareToken)}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            />
          </div>
        </header>

        <InvoiceDocument document={document} variant="resident" />

        {document.payment.paymentLinkUrl && document.totals.balanceDuePaise > 0 ? (
          <div className="mt-6 text-center print:hidden">
            <a
              href={document.payment.paymentLinkUrl}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-[#FF5A1F] px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              Pay {paiseDisplay(document.totals.balanceDuePaise)}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function paiseDisplay(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
