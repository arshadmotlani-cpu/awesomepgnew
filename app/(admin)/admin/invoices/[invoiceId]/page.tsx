import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoiceDetailActions } from '@/src/components/admin/InvoiceDetailActions';
import { InvoicePageToolbar } from '@/src/components/admin/InvoicePageToolbar';
import { MarkAsPaidCashButton } from '@/src/components/admin/MarkAsPaidCashButton';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import { getInvoiceVoidCapabilities } from '@/src/services/invoiceVoid';
import { getCashSettlementEligibility } from '@/src/services/adminCashSettlement';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { DEPOSIT_EXPRESS_RETURN_PATH } from '@/src/lib/deposits/depositExpressLinks';
import { EXPRESS_SALE_RETURN_PATH } from '@/src/lib/expressBooking/expressSaleLinks';
import { residentProfileHref } from '@/src/lib/billing/residentBillingLinks';
import { invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';
import { ensureInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import { getAppUrl } from '@/src/lib/url';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ from?: string; customerId?: string }>;
}) {
  const { invoiceId } = await params;
  const sp = await searchParams;
  const fromDepositExpress = sp.from === 'deposit-express';
  const fromExpressSale = sp.from === 'express-sale';
  const fromResidentBilling = sp.from === 'resident-billing' && sp.customerId;
  const backHref = fromDepositExpress
    ? DEPOSIT_EXPRESS_RETURN_PATH
    : fromExpressSale
      ? EXPRESS_SALE_RETURN_PATH
      : fromResidentBilling
        ? residentProfileHref(sp.customerId!)
        : '/admin/invoices';
  const backLabel = fromDepositExpress
    ? '← Deposit Express'
    : fromExpressSale
      ? '← Sale Express'
      : fromResidentBilling
        ? '← Resident billing'
        : '← All invoices';
  const session = await requireAdminSession('/admin/invoices');
  const [document, voidCaps, cashEligibility, shareToken] = await Promise.all([
    getInvoiceDocumentDetail(invoiceId),
    getInvoiceVoidCapabilities(invoiceId),
    getCashSettlementEligibility(session, invoiceId),
    ensureInvoiceShareToken(invoiceId),
  ]);
  if (!document) notFound();

  const shareUrl = `${getAppUrl()}${invoicePublicSharePath(shareToken)}`;

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
          <InvoicePageToolbar
            invoiceId={invoiceId}
            shareUrl={shareUrl}
            printHref={`/admin/invoices/${invoiceId}/print`}
            backHref={backHref}
            backLabel={backLabel}
          />
        }
      />

      <div className="mb-6">
        <InvoiceDocument document={document} variant="admin" />
      </div>

      <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Related records</h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          {document.relatedLinks.bookingHref && document.bookingCode ? (
            <li>
              <Link
                href={document.relatedLinks.bookingHref}
                className="text-[#FF5A1F] hover:underline"
              >
                Booking {document.bookingCode}
              </Link>
            </li>
          ) : null}
          {document.relatedLinks.residentHref ? (
            <li>
              <Link
                href={document.relatedLinks.residentHref}
                className="text-[#FF5A1F] hover:underline"
              >
                Resident profile
              </Link>
            </li>
          ) : null}
          {document.relatedLinks.depositHref ? (
            <li>
              <Link
                href={document.relatedLinks.depositHref}
                className="text-[#FF5A1F] hover:underline"
              >
                Deposit page
              </Link>
            </li>
          ) : null}
          {document.relatedLinks.paymentHref ? (
            <li>
              <Link
                href={document.relatedLinks.paymentHref}
                className="text-[#FF5A1F] hover:underline"
              >
                Payment record
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Actions</h2>
        {cashEligibility?.canSettle ? (
          <div className="mb-4">
            <MarkAsPaidCashButton
              financialInvoiceId={cashEligibility.financialInvoiceId}
              balanceDuePaise={cashEligibility.balanceDuePaise}
              residentName={cashEligibility.residentName}
              invoiceNumber={cashEligibility.invoiceNumber}
              adminName={session.fullName ?? session.email}
              canSettle={cashEligibility.canSettle}
              blockReason={cashEligibility.blockReason}
            />
          </div>
        ) : null}
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
