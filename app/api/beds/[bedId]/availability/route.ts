/**
 * Public read API: GET /api/beds/[bedId]/availability
 *
 * Query parameters
 *   fromDate       — optional YYYY-MM-DD (default: today)
 *   lookAheadDays  — optional integer (default: 365, max: 730)
 *
 * Returns per-bed free windows, future reservations, and earliest check-in.
 */

import { NextResponse } from 'next/server';
import { getBedAvailabilityTimeline } from '@/src/services/availability';
import { todayString } from '@/src/lib/dates';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(input: string): boolean {
  if (!ISO_DATE_RE.test(input)) return false;
  const [y, m, d] = input.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ bedId: string }> },
) {
  const { bedId } = await context.params;
  if (!UUID_RE.test(bedId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_request', message: 'bedId must be a UUID' } },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const fromDateRaw = url.searchParams.get('fromDate') ?? todayString();
  const lookAheadRaw = url.searchParams.get('lookAheadDays');
  const lookAheadDays = lookAheadRaw ? Number.parseInt(lookAheadRaw, 10) : 365;

  if (!isValidIsoDate(fromDateRaw)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'bad_request', message: 'fromDate must be YYYY-MM-DD' },
      },
      { status: 400 },
    );
  }
  if (!Number.isFinite(lookAheadDays) || lookAheadDays < 1 || lookAheadDays > 730) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'bad_request', message: 'lookAheadDays must be 1–730' },
      },
      { status: 400 },
    );
  }

  try {
    const data = await getBedAvailabilityTimeline({
      bedId,
      fromDate: fromDateRaw,
      lookAheadDays,
    });
    if (!data) {
      return NextResponse.json(
        { ok: false, error: { code: 'bed_not_found', message: 'Bed not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message } },
      { status: 500 },
    );
  }
}
