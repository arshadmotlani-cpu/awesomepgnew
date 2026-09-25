import { NextResponse } from 'next/server';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';
import { getGeneralExpenseById } from '@/src/hair/services/expenses';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getPrivate, isPrivateBlobUrl } from '@/src/lib/storage/blob';

export async function GET(request: Request) {
  try {
    await requireFyhPermission({ permission: 'expenses.general.view', scope: 'org' });
    const ctx = await getTenantContextForPage();

    const url = new URL(request.url);
    const expenseId = url.searchParams.get('expenseId');
    const blobUrl = url.searchParams.get('url');
    if (!expenseId || !blobUrl || !isPrivateBlobUrl(blobUrl)) {
      return new NextResponse('Invalid request', { status: 400 });
    }
    if (!blobUrl.includes('/hair/expense-receipts/')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const expense = await getGeneralExpenseById(expenseId, ctx);
    if (!expense?.attachmentUrl || expense.attachmentUrl !== blobUrl) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { stream, contentType } = await getPrivate(blobUrl);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('File unavailable', { status: 404 });
  }
}
