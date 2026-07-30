import { NextResponse } from 'next/server';
import { getHairAuthOptional } from '@/src/hair/lib/auth/guards';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { buildInvoicePrintHtml, getInvoiceDetail } from '@/src/hair/services/invoices';

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await getHairAuthOptional();
  if (!admin || !hasPermission(admin, 'page:billing')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const detail = await getInvoiceDetail(invoiceId);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const html = buildInvoicePrintHtml(detail);
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
