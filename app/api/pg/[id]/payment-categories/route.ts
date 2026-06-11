import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  createPaymentCategory,
  listActiveCategoriesForPg,
  listCategoriesForPgAdmin,
} from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: pgId } = await ctx.params;
  const admin = await getAdminSession();
  const categories = admin
    ? await listCategoriesForPgAdmin(admin, pgId)
    : await listActiveCategoriesForPg(pgId);
  return NextResponse.json({ ok: true, categories });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id: pgId } = await ctx.params;
  let body: {
    name?: string;
    qrCodeImageUrl?: string;
    upiId?: string;
    isActive?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const category = await createPaymentCategory(session, pgId, {
      name: body.name ?? '',
      qrCodeImageUrl: body.qrCodeImageUrl ?? '',
      upiId: body.upiId,
      isActive: body.isActive,
    });
    return NextResponse.json({ ok: true, category });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
