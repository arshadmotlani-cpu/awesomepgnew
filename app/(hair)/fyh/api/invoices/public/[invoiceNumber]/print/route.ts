import { NextResponse } from 'next/server';
import {
  buildPublicInvoicePrintHtml,
  getInvoiceDetailByNumber,
} from '@/src/hair/services/invoices';

type RouteContext = { params: Promise<{ invoiceNumber: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { invoiceNumber } = await context.params;
  const detail = await getInvoiceDetailByNumber(invoiceNumber);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const html = buildPublicInvoicePrintHtml(detail);
  const { searchParams } = new URL(request.url);
  const download = searchParams.get('download') === '1';
  const filename = `${detail.invoice.invoiceNumber.replace(/[^\w-]+/g, '-')}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': download
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    },
  });
}
