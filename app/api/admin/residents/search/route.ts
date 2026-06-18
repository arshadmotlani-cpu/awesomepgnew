import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { logger } from '@/src/lib/logger';
import {
  resolveBookingIdForCustomer,
  searchResidentsForAdmin,
} from '@/src/services/residentAdmin';

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
    logger.warn('resident search unauthorized', {
      hasSession: Boolean(session),
      role: session?.role,
    });
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const kycApprovedOnly = req.nextUrl.searchParams.get('kycApproved') === '1';

  logger.info('resident search request', {
    query: q,
    adminId: session.adminId,
    role: session.role,
    kycApprovedOnly,
  });

  if (q.length < 2) {
    return Response.json({ ok: true, data: [] });
  }

  try {
    let data = await searchResidentsForAdmin(session, q, 40);

    if (kycApprovedOnly) {
      data = data.filter((r) => r.kycStatus === 'approved' && Boolean(r.bookingId));
    }

    const rows = await Promise.all(
      data.map(async (r) => {
        const bookingId = r.bookingId ?? (await resolveBookingIdForCustomer(r.id));
        return {
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          kycStatus: r.kycStatus,
          tenancyStatus: r.tenancyStatus,
          pgId: r.pgId,
          pgName: r.pgName,
          roomNumber: r.roomNumber,
          bedCode: r.bedCode,
          roomId: r.roomId,
          bedId: r.bedId,
          monthlyRentPaise: r.monthlyRentPaise,
          bookingId,
          bookingCode: r.bookingCode,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );

    logger.info('resident search response', {
      query: q,
      count: rows.length,
    });

    return Response.json({ ok: true, data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed.';
    logger.error('resident search failed', {
      query: q,
      adminId: session.adminId,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return Response.json({ ok: false, error: 'Search failed. Check server logs.' }, { status: 500 });
  }
}
