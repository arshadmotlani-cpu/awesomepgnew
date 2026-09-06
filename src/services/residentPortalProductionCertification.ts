/**
 * Read-only resident portal health certification for production.
 * Classifies portal readiness without mutating data.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';

export type ResidentPortalHealthStatus =
  | 'READY'
  | 'INCOMPLETE'
  | 'NO_STAY'
  | 'OPTIONAL_DATA_DEGRADED'
  | 'CORE_ERROR';

export type ResidentPortalCertRow = {
  customerId: string;
  bookingCode: string | null;
  status: ResidentPortalHealthStatus;
  detail: string | null;
};

export type ResidentPortalCertReport = {
  asOf: string;
  scanned: number;
  summary: Record<ResidentPortalHealthStatus, number>;
  coreErrors: ResidentPortalCertRow[];
  optionalDegraded: ResidentPortalCertRow[];
};

type PortalResidentRow = {
  customer_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  booking_code: string | null;
};

async function listPortalResidentCandidates(limit = 200): Promise<PortalResidentRow[]> {
  const rows = await db.execute<PortalResidentRow>(sql`
    SELECT DISTINCT ON (c.id)
      c.id::text AS customer_id,
      c.full_name,
      c.email,
      c.phone,
      b.booking_code
    FROM customers c
    INNER JOIN bookings b ON b.customer_id = c.id AND b.status = 'confirmed'
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    WHERE br.status IN ('active', 'hold')
      AND (
        CURRENT_DATE <@ br.stay_range
        OR EXISTS (
          SELECT 1 FROM vacating_requests vr
          WHERE vr.booking_id = b.id AND vr.status IN ('pending', 'approved')
        )
      )
    ORDER BY c.id, b.created_at DESC
    LIMIT ${limit}
  `);
  return rows;
}

export async function assessResidentPortalHealth(
  customerId: string,
  email?: string | null,
): Promise<ResidentPortalCertRow> {
  const hasAccess = await customerHasResidentPortalAccess(customerId);
  if (!hasAccess) {
    return { customerId, bookingCode: null, status: 'NO_STAY', detail: 'no_portal_access' };
  }

  const contextLoad = await loadResidentAccountContextSafe(customerId, email);
  if (!contextLoad.ok) {
    if (contextLoad.reason === 'incomplete') {
      return { customerId, bookingCode: null, status: 'INCOMPLETE', detail: contextLoad.errorMessage ?? null };
    }
    return {
      customerId,
      bookingCode: null,
      status: 'CORE_ERROR',
      detail: contextLoad.errorMessage ?? contextLoad.reason,
    };
  }

  const ctx = contextLoad.ctx;
  const bookingCode = ctx.primaryBooking?.bookingCode ?? null;
  if (!hasResidentPortalReadyStay(ctx)) {
    return { customerId, bookingCode, status: 'INCOMPLETE', detail: 'portal_not_ready' };
  }

  if (ctx.portalOptionalDegraded) {
    return { customerId, bookingCode, status: 'OPTIONAL_DATA_DEGRADED', detail: 'financial_summary_degraded' };
  }

  return { customerId, bookingCode, status: 'READY', detail: null };
}

export async function runResidentPortalProductionCertification(
  limit = 200,
): Promise<ResidentPortalCertReport> {
  const candidates = await listPortalResidentCandidates(limit);
  const summary: ResidentPortalCertReport['summary'] = {
    READY: 0,
    INCOMPLETE: 0,
    NO_STAY: 0,
    OPTIONAL_DATA_DEGRADED: 0,
    CORE_ERROR: 0,
  };
  const coreErrors: ResidentPortalCertRow[] = [];
  const optionalDegraded: ResidentPortalCertRow[] = [];

  for (const row of candidates) {
    const result = await assessResidentPortalHealth(row.customer_id, row.email);
    summary[result.status] += 1;
    if (result.status === 'CORE_ERROR') coreErrors.push({ ...result, bookingCode: row.booking_code });
    if (result.status === 'OPTIONAL_DATA_DEGRADED') {
      optionalDegraded.push({ ...result, bookingCode: row.booking_code });
    }
  }

  return {
    asOf: new Date().toISOString(),
    scanned: candidates.length,
    summary,
    coreErrors,
    optionalDegraded,
  };
}
