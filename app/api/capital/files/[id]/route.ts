import { NextResponse } from 'next/server';
import { getDocument } from '@/src/capital/services/documents';
import { getPrivate } from '@/src/lib/storage/blob';
import { requireCapitalApiAuth } from '@/src/capital/lib/api/guard';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapitalApiAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return new NextResponse('Not found', { status: 404 });

  try {
    const { stream, contentType } = await getPrivate(doc.blobPath);
    const safeName = doc.fileName.replace(/[^\w.\-]/g, '_');
    return new NextResponse(stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeName}"`,
      },
    });
  } catch {
    return new NextResponse('File unavailable', { status: 404 });
  }
}
