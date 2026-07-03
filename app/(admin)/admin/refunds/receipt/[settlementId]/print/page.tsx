import { notFound } from 'next/navigation';
import { DepositRefundReceiptDocument } from '@/src/components/admin/refunds/DepositRefundReceiptDocument';
import { getDepositRefundReceiptDocument } from '@/src/services/depositRefundReceipt';

export const dynamic = 'force-dynamic';

export default async function RefundReceiptPrintPage({
  params,
}: {
  params: Promise<{ settlementId: string }>;
}) {
  const { settlementId } = await params;
  const document = await getDepositRefundReceiptDocument(settlementId);
  if (!document) notFound();

  return (
    <html lang="en">
      <head>
        <title>{document.receiptNumber}</title>
        <style>{`
          body { margin: 0; background: #fff; }
          @media print { body { margin: 0; } }
        `}</style>
      </head>
      <body>
        <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
          <DepositRefundReceiptDocument document={document} variant="print" />
        </div>
        <script dangerouslySetInnerHTML={{ __html: 'window.onload = () => window.print()' }} />
      </body>
    </html>
  );
}
