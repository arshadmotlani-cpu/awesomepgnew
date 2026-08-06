import { NextResponse } from 'next/server';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import {
  loadVendorStatementPdfBytes,
  vendorStatementPdfResponse,
} from '@/src/hair/lib/vendorStatementPdfDownload';

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  try {
    const admin = await requireHairAuth();
    if (!hasPermission(admin, 'page:inventory')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { id } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      return new NextResponse('from and to query params required', { status: 400 });
    }

    const loaded = await loadVendorStatementPdfBytes(id, { from, to });
    if (!loaded) return new NextResponse('Not found', { status: 404 });

    return vendorStatementPdfResponse(loaded.bytes, loaded.filename);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
