/**
 * Public read API: GET /api/availability
 *
 * Query parameters
 *   pgId       — required, UUID
 *   startDate  — required, YYYY-MM-DD
 *   endDate    — required, YYYY-MM-DD, must be strictly after startDate
 *
 * Response shape
 *   {
 *     ok: true,
 *     data: {
 *       pgId, pgName, startDate, endDate, nights,
 *       summary: { totalBeds, availableBeds, occupiedBeds, blockedBeds,
 *                  maintenanceBeds, occupancyPct },
 *       beds:   [{ bedId, bedCode, status, roomNumber, roomType, floorNumber,
 *                  floorLabel, isAvailable, isOccupied, nextAvailableDate }]
 *     }
 *   }
 *
 * Errors return JSON with `{ ok: false, error: { code, message, fields? } }`
 * and never leak raw stack traces.
 */

import { NextResponse } from 'next/server';
import { getPgAvailability } from '@/src/services/availability';

// Phase 2 read API: always fresh, never cached. Caching policy gets revisited
// in Phase 6 alongside the customer bed-map UI.
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type FieldError = { field: string; message: string };

function badRequest(message: string, fields?: FieldError[]) {
  return NextResponse.json(
    { ok: false, error: { code: 'bad_request', message, fields } },
    { status: 400 },
  );
}

function isValidIsoDate(input: string): boolean {
  if (!ISO_DATE_RE.test(input)) return false;
  const [y, m, d] = input.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pgId = url.searchParams.get('pgId');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const fields: FieldError[] = [];
  if (!pgId) fields.push({ field: 'pgId', message: 'Required' });
  else if (!UUID_RE.test(pgId)) fields.push({ field: 'pgId', message: 'Must be a UUID' });
  if (!startDate) fields.push({ field: 'startDate', message: 'Required (YYYY-MM-DD)' });
  else if (!isValidIsoDate(startDate))
    fields.push({ field: 'startDate', message: 'Must be a valid calendar date in YYYY-MM-DD' });
  if (!endDate) fields.push({ field: 'endDate', message: 'Required (YYYY-MM-DD)' });
  else if (!isValidIsoDate(endDate))
    fields.push({ field: 'endDate', message: 'Must be a valid calendar date in YYYY-MM-DD' });

  if (fields.length > 0) {
    return badRequest('Invalid or missing query parameters.', fields);
  }
  if (startDate! >= endDate!) {
    return badRequest('endDate must be strictly after startDate.', [
      { field: 'endDate', message: `Must be after startDate (${startDate})` },
    ]);
  }

  try {
    const data = await getPgAvailability({
      pgId: pgId!,
      startDate: startDate!,
      endDate: endDate!,
    });
    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'pg_not_found',
            message: `No active PG with id ${pgId}`,
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isMissingUrl = /DATABASE_URL is not set/.test(message);
    const isConnRefused = /ECONNREFUSED|connection refused/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: isMissingUrl
            ? 'db_not_configured'
            : isConnRefused
              ? 'db_unreachable'
              : 'internal_error',
          message,
        },
      },
      { status: 500 },
    );
  }
}
