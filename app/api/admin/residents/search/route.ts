import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import type { AdminRole } from '@/src/lib/auth/roles';
import { logger } from '@/src/lib/logger';
import type { AdminResidentSearchApiResponse } from '@/src/lib/admin/residentSearchTypes';
import {
  enrichResidentSearchResults,
  searchResidentsForAdmin,
} from '@/src/services/adminResidentSearch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Any authenticated admin except read-only viewer may search residents. */
function canSearchResidents(role: AdminRole): boolean {
  return role !== 'viewer';
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json(
      {
        ok: false,
        code: 'permission_denied',
        error: 'Permission denied — sign in as an admin to search residents.',
      } satisfies AdminResidentSearchApiResponse,
      { status: 401 },
    );
  }

  if (!canSearchResidents(session.role)) {
    logger.warn('resident search permission denied', {
      adminId: session.adminId,
      role: session.role,
    });
    return Response.json(
      {
        ok: false,
        code: 'permission_denied',
        error: 'Permission denied — your role cannot search residents.',
      } satisfies AdminResidentSearchApiResponse,
      { status: 403 },
    );
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const kycApprovedOnly = req.nextUrl.searchParams.get('kycApproved') === '1';

  logger.info('resident search request', {
    query: q,
    adminId: session.adminId,
    role: session.role,
    kycApprovedOnly,
  });

  if (q.length < 1) {
    return Response.json({ ok: true, data: [], count: 0 } satisfies AdminResidentSearchApiResponse);
  }

  try {
    let data = await searchResidentsForAdmin(session, q, 40);

    if (kycApprovedOnly) {
      data = data.filter((r) => r.kycStatus === 'approved');
    }

    const rows = await enrichResidentSearchResults(data);

    if (kycApprovedOnly) {
      // KYC deposit add still prefers residents with a booking when available.
      // Do not exclude unassigned — show all approved KYC matches.
    }

    logger.info('resident search response', {
      query: q,
      count: rows.length,
      adminId: session.adminId,
    });

    return Response.json({
      ok: true,
      data: rows,
      count: rows.length,
    } satisfies AdminResidentSearchApiResponse);
  } catch (err) {
    const pgMessage =
      err instanceof Error && 'cause' in err && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    const message = err instanceof Error ? err.message : String(err);

    logger.error('resident search failed', {
      query: q,
      adminId: session.adminId,
      error: message,
      pgError: pgMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return Response.json(
      {
        ok: false,
        code: 'database_error',
        error: 'Database error — search could not complete. Check server logs.',
      } satisfies AdminResidentSearchApiResponse,
      { status: 500 },
    );
  }
}
