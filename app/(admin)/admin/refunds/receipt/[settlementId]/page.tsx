import { notFound } from 'next/navigation';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { DepositRefundReceiptDocument } from '@/src/components/admin/refunds/DepositRefundReceiptDocument';
import { RefundReceiptToolbar } from '@/src/components/admin/refunds/RefundReceiptToolbar';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { depositRefundReceiptHref } from '@/src/lib/refund/refundReceiptLinks';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { getAppUrl } from '@/src/lib/url';
import { getDepositRefundReceiptDocument } from '@/src/services/depositRefundReceipt';

export const dynamic = 'force-dynamic';

export default async function RefundReceiptPage({
  params,
}: {
  params: Promise<{ settlementId: string }>;
}) {
  const { settlementId } = await params;
  await requireAdminSession('/admin/refunds');
  const document = await getDepositRefundReceiptDocument(settlementId);
  if (!document) notFound();

  const sharePath = depositRefundReceiptHref(settlementId);
  const shareUrl = `${getAppUrl()}${sharePath}`;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: 'Refund of Deposit', href: '/admin/refunds' },
          { label: document.receiptNumber },
        ]}
      />
      <PageHeader
        title={`Refund ${document.receiptNumber}`}
        description={`${document.residentName} · ${document.bookingCode}`}
        actions={
          <RefundReceiptToolbar settlementId={settlementId} shareUrl={shareUrl} />
        }
      />
      <DepositRefundReceiptDocument document={document} />
    </>
  );
}
