/**
 * Admin KYC access — PG scope and submission context for downloads.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, kycSubmissions, type KycSubmission } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { listApprovedKycSubmissions } from '@/src/services/kyc';

export type KycSubmissionAdminContext = {
  submission: KycSubmission;
  customerId: string;
  customerName: string;
  bookingId: string | null;
  bookingCode: string | null;
  pgId: string | null;
  pgName: string | null;
};

export function adminCanAccessKycPg(session: AdminSession, pgId: string | null): boolean {
  if (!pgId) return session.role === 'super_admin';
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}

async function resolvePgForBooking(
  bookingId: string,
): Promise<{ pgId: string | null; pgName: string | null }> {
  const rows = await db.execute<{ pg_id: string | null; pg_name: string | null }>(sql`
    SELECT f.pg_id::text AS pg_id, p.name AS pg_name
    FROM bed_reservations br
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid
      AND br.kind = 'primary'
    ORDER BY br.created_at DESC
    LIMIT 1
  `);
  const row = rows[0];
  return { pgId: row?.pg_id ?? null, pgName: row?.pg_name ?? null };
}

export async function loadKycSubmissionAdminContext(
  submissionId: string,
): Promise<KycSubmissionAdminContext | null> {
  const [row] = await db
    .select({
      submission: kycSubmissions,
      customerId: customers.id,
      customerName: customers.fullName,
      bookingCode: bookings.bookingCode,
    })
    .from(kycSubmissions)
    .innerJoin(customers, eq(customers.id, kycSubmissions.customerId))
    .leftJoin(bookings, eq(bookings.id, kycSubmissions.bookingId))
    .where(eq(kycSubmissions.id, submissionId))
    .limit(1);

  if (!row) return null;

  const pg =
    row.submission.bookingId != null
      ? await resolvePgForBooking(row.submission.bookingId)
      : { pgId: null, pgName: null };

  return {
    submission: row.submission,
    customerId: row.customerId,
    customerName: row.customerName,
    bookingId: row.submission.bookingId,
    bookingCode: row.bookingCode ?? null,
    pgId: pg.pgId,
    pgName: pg.pgName,
  };
}

export async function getKycSubmissionForAdmin(
  session: AdminSession,
  submissionId: string,
): Promise<KycSubmissionAdminContext | null> {
  const ctx = await loadKycSubmissionAdminContext(submissionId);
  if (!ctx) return null;
  if (!adminCanAccessKycPg(session, ctx.pgId)) return null;
  return ctx;
}

export type ApprovedKycAdminRow = {
  id: string;
  customerId: string;
  customerName: string;
  bookingId: string | null;
  bookingCode: string | null;
  pgId: string | null;
};

export async function listApprovedKycSubmissionsForAdmin(
  session: AdminSession,
  limit = 200,
): Promise<ApprovedKycAdminRow[]> {
  const approved = await listApprovedKycSubmissions(limit);
  const rows: ApprovedKycAdminRow[] = [];

  for (const row of approved) {
    const ctx = await loadKycSubmissionAdminContext(row.id);
    if (!ctx || !adminCanAccessKycPg(session, ctx.pgId)) continue;
    rows.push({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      bookingCode: ctx.bookingCode,
      pgId: ctx.pgId,
    });
  }

  return rows;
}
