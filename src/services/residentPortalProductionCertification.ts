/**
 * Read-only resident portal health certification for production.
 * Classifies portal readiness without mutating data.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import type { CustomerSession } from '@/src/lib/auth/session';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import {
  loadResidentConciergeTabData,
  loadResidentPaymentsTabData,
  loadResidentProfileTabData,
  loadResidentReferralsTabData,
  loadResidentRequestsTabData,
} from '@/src/services/residentPortalTabData';

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
  sections: ResidentPortalSectionCert[];
};

export type ResidentPortalSectionCert = {
  section: 'CORE' | 'PROFILE_MY_STAY' | 'PAYMENTS' | 'REQUESTS' | 'REFERRALS' | 'CONCIERGE';
  status: 'READY' | 'FAILED';
  loader: string;
  errorClass?: string;
  errorMessage?: string;
  rootService?: string;
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
  identity?: { fullName?: string | null; phone?: string | null },
): Promise<ResidentPortalCertRow> {
  const sections: ResidentPortalSectionCert[] = [];
  const hasAccess = await customerHasResidentPortalAccess(customerId);
  if (!hasAccess) {
    return {
      customerId,
      bookingCode: null,
      status: 'NO_STAY',
      detail: 'no_portal_access',
      sections,
    };
  }

  const contextLoad = await loadResidentAccountContextSafe(customerId, email);
  if (!contextLoad.ok) {
    sections.push({
      section: 'CORE',
      status: 'FAILED',
      loader: 'loadResidentAccountContextSafe',
      errorMessage: contextLoad.errorMessage ?? contextLoad.reason,
    });
    if (contextLoad.reason === 'incomplete') {
      return {
        customerId,
        bookingCode: null,
        status: 'INCOMPLETE',
        detail: contextLoad.errorMessage ?? null,
        sections,
      };
    }
    return {
      customerId,
      bookingCode: null,
      status: 'CORE_ERROR',
      detail: contextLoad.errorMessage ?? contextLoad.reason,
      sections,
    };
  }

  const ctx = contextLoad.ctx;
  const bookingCode = ctx.primaryBooking?.bookingCode ?? null;
  sections.push({
    section: 'CORE',
    status: 'READY',
    loader: 'loadResidentAccountContextSafe',
  });
  if (!hasResidentPortalReadyStay(ctx)) {
    return {
      customerId,
      bookingCode,
      status: 'INCOMPLETE',
      detail: 'portal_not_ready',
      sections,
    };
  }

  const session: CustomerSession = {
    kind: 'customer',
    sessionId: 'resident-portal-readonly-certification',
    customerId,
    phone: identity?.phone ?? ctx.customer.phone ?? '',
    fullName: identity?.fullName ?? ctx.customer.fullName ?? 'Resident',
    email: email ?? ctx.customer.email ?? '',
    mustSetPassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 60_000),
  };

  const loaders: Array<{
    section: Exclude<ResidentPortalSectionCert['section'], 'CORE'>;
    loader: string;
    run: () => Promise<unknown>;
  }> = [
    {
      section: 'PROFILE_MY_STAY',
      loader: 'loadResidentProfileTabData',
      run: () =>
        loadResidentProfileTabData({
          preloaded: ctx,
          session,
          developerTestMode: false,
          simulatedDurationMode: null,
        }),
    },
    {
      section: 'PAYMENTS',
      loader: 'loadResidentPaymentsTabData',
      run: () => loadResidentPaymentsTabData({ preloaded: ctx, session }),
    },
    {
      section: 'REQUESTS',
      loader: 'loadResidentRequestsTabData',
      run: () =>
        loadResidentRequestsTabData({
          preloaded: ctx,
          session,
          developerTestMode: false,
          simulatedDurationMode: null,
        }),
    },
    {
      section: 'REFERRALS',
      loader: 'loadResidentReferralsTabData',
      run: () => loadResidentReferralsTabData(customerId),
    },
    {
      section: 'CONCIERGE',
      loader: 'loadResidentConciergeTabData',
      run: () => loadResidentConciergeTabData({ preloaded: ctx, session }),
    },
  ];

  for (const loader of loaders) {
    try {
      await loader.run();
      sections.push({ section: loader.section, status: 'READY', loader: loader.loader });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sections.push({
        section: loader.section,
        status: 'FAILED',
        loader: loader.loader,
        errorClass: err.name || err.constructor.name,
        errorMessage: err.message,
        rootService: err.stack
          ?.split('\n')
          .slice(1, 8)
          .map((line) => line.trim())
          .join(' <- '),
      });
    }
  }

  const failed = sections.filter((section) => section.status === 'FAILED');
  if (failed.length > 0 || ctx.portalOptionalDegraded) {
    return {
      customerId,
      bookingCode,
      status: 'OPTIONAL_DATA_DEGRADED',
      detail:
        failed.map((section) => `${section.section}:${section.errorMessage}`).join(' | ') ||
        'financial_summary_degraded',
      sections,
    };
  }

  return { customerId, bookingCode, status: 'READY', detail: null, sections };
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

  const batchSize = 3;
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (row) => ({
        row,
        result: await assessResidentPortalHealth(row.customer_id, row.email, {
          fullName: row.full_name,
          phone: row.phone,
        }),
      })),
    );
    for (const { row, result } of results) {
      summary[result.status] += 1;
      if (result.status === 'CORE_ERROR') {
        coreErrors.push({ ...result, bookingCode: row.booking_code });
      }
      if (result.status === 'OPTIONAL_DATA_DEGRADED') {
        optionalDegraded.push({ ...result, bookingCode: row.booking_code });
      }
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
