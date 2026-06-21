import { notFound } from 'next/navigation';
import { InvoiceDocument } from '@/src/components/billing/InvoiceDocument';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';

export const dynamic = 'force-dynamic';

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const document = await getInvoiceDocumentDetail(invoiceId);
  if (!document) notFound();

  return (
    <html lang="en">
      <head>
        <title>{document.invoiceNumber}</title>
        <style>{`
          body { margin: 0; background: #fff; }
          @media print { body { margin: 0; } }
        `}</style>
      </head>
      <body>
        <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
          <InvoiceDocument document={document} variant="resident" />
        </div>
        <script dangerouslySetInnerHTML={{ __html: 'window.onload = () => window.print()' }} />
      </body>
    </html>
  );
}
