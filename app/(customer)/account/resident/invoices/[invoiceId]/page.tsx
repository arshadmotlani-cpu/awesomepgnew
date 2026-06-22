import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import {
  assertCustomerOwnsFinancialInvoice,
  getInvoiceDocumentDetail,
} from '@/src/lib/billing/invoiceDocumentModel';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { isFinancialInvoiceUuid } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';

export const dynamic = 'force-dynamic';

export default async function ResidentInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId: ref } = await params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();

  const invoiceId = resolved.id;
  const returnPath = `/account/resident/invoices/${invoiceId}`;
  const session = await requireCustomerSession(returnPath);

  if (ref !== invoiceId && !isFinancialInvoiceUuid(ref)) {
    redirect(returnPath);
  }

  const owns = await assertCustomerOwnsFinancialInvoice(session.customerId, invoiceId);
  if (!owns) notFound();

  const document = await getInvoiceDocumentDetail(invoiceId);
  if (!document) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href={residentTabHref('payments')} className={ACCOUNT_BACK_LINK}>
        ← Back to payments
      </Link>
      <header className="mt-4 mb-6">
        <h1 className={ACCOUNT_PAGE_TITLE}>Invoice</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>{document.invoiceNumber}</p>
      </header>

      <InvoiceDocument document={document} variant="resident" />

      {document.payment.paymentLinkUrl && document.totals.balanceDuePaise > 0 ? (
        <div className="mt-6 text-center">
          <Link
            href={document.payment.paymentLinkUrl}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-apg-orange px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
          >
            Pay {document.totals.balanceDuePaise / 100} INR
          </Link>
        </div>
      ) : null}
    </div>
  );
}
