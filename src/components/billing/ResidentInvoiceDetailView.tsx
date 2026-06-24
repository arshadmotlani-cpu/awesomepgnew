import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import {
  isFinancialInvoiceUuid,
  resolveFinancialInvoiceRef,
} from '@/src/lib/billing/resolveFinancialInvoiceRef';
import {
  checkResidentInvoiceAccess,
  logResidentInvoiceAccess,
} from '@/src/lib/billing/residentInvoiceAccess';
import { legacyResidentInvoiceSharePath } from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { getCustomerSession } from '@/src/lib/auth/session';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';

export async function ResidentInvoiceDetailView({ ref }: { ref: string }) {
  const session = await getCustomerSession();
  const access = await checkResidentInvoiceAccess(ref, session);

  if (!access.ok) {
    logResidentInvoiceAccess(access, { route: '/resident/invoices/[ref]' });

    if (
      access.reason === 'unauthorized_no_session' ||
      access.reason === 'unauthorized_must_set_password'
    ) {
      const sharePath = access.invoiceId
        ? legacyResidentInvoiceSharePath(access.invoiceId)
        : `/resident/invoices/${ref.trim()}`;
      if (access.reason === 'unauthorized_must_set_password') {
        redirect(`/account/set-password?next=${encodeURIComponent(sharePath)}`);
      }
      redirect(`/login?next=${encodeURIComponent(sharePath)}`);
    }

    notFound();
  }

  logResidentInvoiceAccess(access, { route: '/resident/invoices/[ref]' });

  const invoiceId = access.invoiceId;
  const sharePath = legacyResidentInvoiceSharePath(invoiceId);

  const normalizedRef = ref.trim();
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();

  if (normalizedRef !== invoiceId && !isFinancialInvoiceUuid(normalizedRef)) {
    redirect(sharePath);
  }

  const document = await getInvoiceDocumentDetail(invoiceId);
  if (!document) {
    logResidentInvoiceAccess(
      {
        ok: false,
        reason: 'document_load_failed',
        ref,
        invoiceId,
        invoiceNumber: access.invoiceNumber,
        invoiceStatus: access.invoiceStatus,
        invoiceCustomerId: access.invoiceCustomerId,
        sessionCustomerId: access.sessionCustomerId,
        sessionKind: 'customer',
      },
      { route: '/resident/invoices/[ref]' },
    );
    notFound();
  }

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
