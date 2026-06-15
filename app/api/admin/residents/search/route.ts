import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { searchResidentsForAdmin } from '@/src/services/residentAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'bookings:write')) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const kycApproved = req.nextUrl.searchParams.get('kycApproved') === '1';
  if (q.length < 2) {
    return Response.json({ ok: true, data: [] });
  }

  let data = await searchResidentsForAdmin(session, q);
  if (kycApproved) {
    data = data.filter((r) => r.kycStatus === 'approved' && r.bookingId);
  }
  return Response.json({
    ok: true,
    data: data.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
