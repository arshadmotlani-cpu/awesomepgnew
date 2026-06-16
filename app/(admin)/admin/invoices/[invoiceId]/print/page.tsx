import { notFound } from 'next/navigation';
import { getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';
import { paiseToInr, formatDate } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) notFound();

  const lines = detail.breakdown?.lines ?? [];

  return (
    <html lang="en">
      <head>
        <title>{detail.invoiceNumber}</title>
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; color: #111; }
          h1 { font-size: 1.25rem; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          th, td { border-bottom: 1px solid #ddd; padding: 0.5rem; text-align: left; }
          .total { font-weight: 700; font-size: 1.1rem; margin-top: 1rem; }
          @media print { body { margin: 0; } }
        `}</style>
      </head>
      <body>
        <h1>Invoice {detail.invoiceNumber}</h1>
        <p>
          {detail.customerName} · {detail.pgName}
          {detail.roomNumber ? ` · Room ${detail.roomNumber}` : ''}
        </p>
        <p>Type: {detail.invoiceType} · Status: {detail.status}</p>
        {detail.dueDate ? <p>Due: {formatDate(detail.dueDate)}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length > 0 ? (
              lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.label}</td>
                  <td>{paiseToInr(l.amountPaise)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>{detail.invoiceType}</td>
                <td>{paiseToInr(detail.amountPaise)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="total">Total due: {paiseToInr(detail.amountPaise)}</p>
        <script dangerouslySetInnerHTML={{ __html: 'window.onload = () => window.print()' }} />
      </body>
    </html>
  );
}
