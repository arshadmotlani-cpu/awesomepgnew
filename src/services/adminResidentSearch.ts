/**
 * Central admin resident search — customers table is the source of truth.
 * Optional bed/booking context is LEFT JOINed; never required for a match.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import type { ResidencyStatus } from '@/src/db/schema/enums';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import type {
  AdminResidentSearchResult,
  AdminResidentTenancyStatus,
} from '@/src/lib/admin/residentSearchTypes';
import { isNotOccupancyPlaceholderCustomerSql } from '@/src/lib/occupancySqlFilters';
import { occupancyReservationCoreSql_b, adminAssignedReservationSql_b } from '@/src/lib/occupancySsot';
import {
  activeTenancyLateralSql,
  deriveTenancyStatus,
  getActiveTenancyForCustomer,
} from '@/src/lib/residentActiveTenancy';
import { logger } from '@/src/lib/logger';

export type { AdminResidentSearchResult };

type SearchSchemaCapabilities = {
  customerLifecycle: boolean;
  bookingsIsTest: boolean;
};

type SearchDbRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  kyc_status: 'pending' | 'approved' | 'rejected';
  gender: 'male' | 'female' | 'other';
  created_at: Date | string;
  residency_status: ResidencyStatus | null;
  booking_id: string | null;
  booking_code: string | null;
  pg_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  pg_id: string | null;
  room_id: string | null;
  bed_id: string | null;
  monthly_rent_paise: number | null;
  is_vacating: boolean;
};

let cachedCapabilities: SearchSchemaCapabilities | null = null;

export async function getResidentSearchSchemaCapabilities(): Promise<SearchSchemaCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  try {
    const rows = await db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'customers' AND column_name IN ('residency_status', 'is_test'))
          OR (table_name = 'bookings' AND column_name = 'is_test')
        )
    `);
    const cols = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    cachedCapabilities = {
      customerLifecycle:
        cols.has('customers.residency_status') && cols.has('customers.is_test'),
      bookingsIsTest: cols.has('bookings.is_test'),
    };
  } catch {
    cachedCapabilities = { customerLifecycle: false, bookingsIsTest: false };
  }
  return cachedCapabilities;
}

/** @deprecated Use getResidentSearchSchemaCapabilities */
export async function hasCustomerLifecycleColumns(): Promise<boolean> {
  const caps = await getResidentSearchSchemaCapabilities();
  return caps.customerLifecycle;
}

const legacyExcludeTestCustomersSql = sql`(
  c.email NOT LIKE '%@example.com'
  AND c.email NOT LIKE '%@awesomepg.local'
  AND c.full_name NOT LIKE 'E2E User%'
  AND c.full_name NOT LIKE 'Verification Bot%'
  AND c.full_name NOT LIKE 'Phase5%'
)`;

/** Optional active-bed context — never filters customers out. */
const activeTenancyJoinSql = activeTenancyLateralSql;

/** Match active bed assignment location — works with or without tenancy lateral join. */
const activeAssignmentLocationMatchSql = (pattern: string) => sql`
  EXISTS (
    SELECT 1
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = c.id
      AND ${adminAssignedReservationSql_b}
      AND (
        p.name ILIKE ${pattern}
        OR r.room_number ILIKE ${pattern}
        OR bd.bed_code ILIKE ${pattern}
        OR (r.room_number || ' ' || bd.bed_code) ILIKE ${pattern}
      )
  )
`;

function matchSql(
  pattern: string,
  q: string,
  phoneDigits: string,
  phoneSearchEnabled: boolean,
  includeLateralMatch: boolean,
) {
  return sql`
    (
      c.full_name ILIKE ${pattern}
      OR c.email ILIKE ${pattern}
      OR c.id::text = ${q}
      OR EXISTS (
        SELECT 1 FROM bookings bk
        WHERE bk.customer_id = c.id
          AND bk.booking_code ILIKE ${pattern}
      )
      OR (
        ${phoneSearchEnabled}
        AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE ${`%${phoneDigits}%`}
      )
      OR ${activeAssignmentLocationMatchSql(pattern)}
      ${
        includeLateralMatch
          ? sql`
              OR t.pg_name ILIKE ${pattern}
              OR t.room_number ILIKE ${pattern}
              OR t.bed_code ILIKE ${pattern}
              OR (coalesce(t.room_number, '') || ' ' || coalesce(t.bed_code, '')) ILIKE ${pattern}
            `
          : sql``
      }
    )
  `;
}

function orderSql(
  qLower: string,
  namePrefix: string,
  pattern: string,
  phoneDigits: string,
  phoneSearchEnabled: boolean,
  includeTenancyRank: boolean,
) {
  return sql`
    ORDER BY
      CASE
        WHEN lower(trim(c.full_name)) = ${qLower} THEN 0
        WHEN c.full_name ILIKE ${namePrefix} THEN 1
        WHEN c.full_name ILIKE ${pattern} THEN 2
        WHEN ${phoneSearchEnabled}
          AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE ${`${phoneDigits}%`} THEN 3
        ELSE 4
      END,
      ${includeTenancyRank ? sql`(t.booking_id IS NOT NULL) DESC,` : sql``}
      c.full_name ASC
  `;
}

function mapTenancyStatus(row: SearchDbRow): AdminResidentTenancyStatus {
  return deriveTenancyStatus({
    residencyStatus: row.residency_status,
    activeTenancy: row.booking_id
      ? { bookingId: row.booking_id, isVacating: row.is_vacating }
      : null,
    bedId: row.bed_id,
  });
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: SearchDbRow): AdminResidentSearchResult {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    kycStatus: row.kyc_status,
    gender: row.gender,
    tenancyStatus: mapTenancyStatus(row),
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    bedCode: row.bed_code,
    roomId: row.room_id,
    bedId: row.bed_id,
    monthlyRentPaise: Number(row.monthly_rent_paise ?? 0),
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

type SearchTier = 'full' | 'legacy' | 'minimal';

async function runSearchQuery(
  q: string,
  limit: number,
  tier: SearchTier,
  caps: SearchSchemaCapabilities,
): Promise<SearchDbRow[]> {
  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const phoneDigits = q.replace(/\D/g, '');
  const qLower = q.toLowerCase();
  const namePrefix = `${q.replace(/[%_\\]/g, '\\$&')}%`;
  const phoneSearchEnabled = phoneDigits.length >= 2;

  if (tier === 'minimal') {
    const residencySelect =
      caps.customerLifecycle
        ? sql`c.residency_status,`
        : sql`'active'::text AS residency_status,`;
    const testFilter = caps.customerLifecycle
      ? sql`AND c.is_test = false`
      : sql`AND ${legacyExcludeTestCustomersSql}`;

    const rows = await db.execute<SearchDbRow>(sql`
      SELECT
        c.id,
        c.full_name,
        c.email,
        c.phone,
        c.gender,
        c.kyc_status,
        c.created_at,
        ${residencySelect}
        NULL::text AS booking_id,
        NULL::text AS booking_code,
        NULL::text AS pg_name,
        NULL::text AS room_number,
        NULL::text AS bed_code,
        NULL::text AS pg_id,
        NULL::text AS room_id,
        NULL::text AS bed_id,
        0::bigint AS monthly_rent_paise,
        false AS is_vacating
      FROM customers c
      WHERE c.archived_at IS NULL
        ${testFilter}
        AND ${isNotOccupancyPlaceholderCustomerSql}
        AND ${matchSql(pattern, q, phoneDigits, phoneSearchEnabled, false)}
      ${orderSql(qLower, namePrefix, pattern, phoneDigits, phoneSearchEnabled, false)}
      LIMIT ${limit}
    `);
    return Array.from(rows);
  }

  const residencySelect = caps.customerLifecycle
    ? sql`c.residency_status,`
    : sql`'active'::text AS residency_status,`;
  const testFilter = caps.customerLifecycle
    ? sql`AND c.is_test = false`
    : sql`AND ${legacyExcludeTestCustomersSql}`;

  const rows = await db.execute<SearchDbRow>(sql`
    SELECT
      c.id,
      c.full_name,
      c.email,
      c.phone,
      c.gender,
      c.kyc_status,
      c.created_at,
      ${residencySelect}
      t.booking_id,
      t.booking_code,
      t.pg_name,
      t.room_number,
      t.bed_code,
      t.pg_id,
      t.room_id,
      t.bed_id,
      t.monthly_rent_paise,
      coalesce(t.is_vacating, false) AS is_vacating
    FROM customers c
    ${activeTenancyJoinSql}
    WHERE c.archived_at IS NULL
      ${testFilter}
      AND ${isNotOccupancyPlaceholderCustomerSql}
      AND ${matchSql(pattern, q, phoneDigits, phoneSearchEnabled, true)}
    ${orderSql(qLower, namePrefix, pattern, phoneDigits, phoneSearchEnabled, true)}
    LIMIT ${limit}
  `);
  return Array.from(rows);
}

function isSearchQueryError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && 'cause' in err && err.cause instanceof Error
      ? err.cause.message
      : '';
  const combined = `${message} ${cause}`.toLowerCase();
  return (
    combined.includes('failed query') ||
    combined.includes('does not exist') ||
    combined.includes('syntax error')
  );
}

export async function searchResidentsForAdmin(
  session: AdminSession,
  query: string,
  limit = 20,
): Promise<AdminResidentSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const caps = await getResidentSearchSchemaCapabilities();
  const tiers: SearchTier[] = caps.customerLifecycle
    ? ['full', 'legacy', 'minimal']
    : ['legacy', 'minimal'];

  let lastError: unknown;
  for (const tier of tiers) {
    try {
      const rows = await runSearchQuery(q, limit, tier, caps);
      const mapped = rows
        .filter(
          (row) =>
            !row.pg_id ||
            adminCanAccessPg(
              { role: session.role, pgScope: session.pgScope },
              row.pg_id,
            ),
        )
        .map(mapRow);

      logger.info('admin resident search', {
        query: q,
        tier,
        rawCount: rows.length,
        resultCount: mapped.length,
        customerLifecycle: caps.customerLifecycle,
        bookingsIsTest: caps.bookingsIsTest,
      });

      return mapped;
    } catch (err) {
      lastError = err;
      logger.warn('admin resident search tier failed', {
        query: q,
        tier,
        error: err instanceof Error ? err.message : String(err),
        cause:
          err instanceof Error && 'cause' in err && err.cause instanceof Error
            ? err.cause.message
            : undefined,
      });
      if (!isSearchQueryError(err)) throw err;
    }
  }

  logger.error('admin resident search exhausted all tiers', {
    query: q,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    stack: lastError instanceof Error ? lastError.stack : undefined,
  });
  throw lastError;
}

export async function resolveBookingIdForCustomer(
  customerId: string,
): Promise<string | null> {
  const active = await getActiveTenancyForCustomer(customerId);
  if (active) return active.bookingId;

  const caps = await getResidentSearchSchemaCapabilities();
  try {
    const rows = await db.execute<{ booking_id: string }>(
      caps.bookingsIsTest
        ? sql`
            SELECT b.id::text AS booking_id
            FROM bookings b
            WHERE b.customer_id = ${customerId}::uuid
              AND b.is_test = false
              AND b.status IN ('confirmed', 'pending_payment')
            ORDER BY
              CASE b.status
                WHEN 'confirmed' THEN 0
                WHEN 'pending_payment' THEN 1
              END,
              b.created_at DESC
            LIMIT 1
          `
        : sql`
            SELECT b.id::text AS booking_id
            FROM bookings b
            WHERE b.customer_id = ${customerId}::uuid
              AND b.status IN ('confirmed', 'pending_payment')
            ORDER BY
              CASE b.status
                WHEN 'confirmed' THEN 0
                WHEN 'pending_payment' THEN 1
              END,
              b.created_at DESC
            LIMIT 1
          `,
    );
    return rows[0]?.booking_id ?? null;
  } catch (err) {
    logger.warn('resolveBookingIdForCustomer failed', {
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function enrichResidentSearchResults(
  rows: AdminResidentSearchResult[],
): Promise<AdminResidentSearchResult[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.bedId && row.bookingId) return row;
      const active = await getActiveTenancyForCustomer(row.id);
      if (!active) return row;
      return {
        ...row,
        bookingId: active.bookingId,
        bookingCode: active.bookingCode,
        pgId: active.pgId,
        pgName: active.pgName,
        roomNumber: active.roomNumber,
        bedCode: active.bedCode,
        bedId: active.bedId,
        monthlyRentPaise: active.monthlyRentPaise,
        tenancyStatus: deriveTenancyStatus({
          residencyStatus: row.tenancyStatus === 'vacated' ? 'vacated' : 'active',
          activeTenancy: { bookingId: active.bookingId, isVacating: active.isVacating },
          bedId: active.bedId,
        }),
      };
    }),
  );
}
