import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { searchResidentsForAdmin } from '@/src/services/residentAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEARCH_PERMISSIONS = [
  'bookings:write',
  'rent:write',
  'deposits:write',
  'payments:write',
  'electricity:write',
] as const;

function canSearchResidents(role: Parameters<typeof adminHasPermission>[0]): boolean {
  return SEARCH_PERMISSIONS.some((p) => adminHasPermission(role, p));
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canSearchResidents(session.role)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const withBooking = req.nextUrl.searchParams.get('withBooking') === '1';
  const kycApproved = req.nextUrl.searchParams.get('kycApproved') === '1';

  if (q.length < 2) {
    return Response.json({ ok: true, data: [] });
  }

  let data = await searchResidentsForAdmin(session, q, 40);

  if (withBooking || kycApproved) {
    data = data.filter((r) => Boolean(r.bookingId));
  }

  return Response.json({
    ok: true,
    data: data.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
