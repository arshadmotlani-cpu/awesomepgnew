import { NextResponse } from 'next/server';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { getPrivate, isPrivateBlobUrl } from '@/src/lib/storage/blob';

export async function GET(request: Request) {
  try {
    const admin = await requireHairAuth();
    if (!hasPermission(admin, 'page:inventory')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);
    const blobUrl = url.searchParams.get('url');
    if (!blobUrl || !isPrivateBlobUrl(blobUrl)) {
      return new NextResponse('Invalid file URL', { status: 400 });
    }
    if (!blobUrl.includes('/hair/')) {
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
