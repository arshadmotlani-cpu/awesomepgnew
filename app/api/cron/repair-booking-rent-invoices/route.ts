import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  DEFAULT_BOOKING_RENT_REPAIR_CODES,
  runBookingRentInvoiceAuditRepair,
} from '@/src/services/bookingRentInvoiceRepair';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, reason: 'CRON_SECRET is not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const execute = req.nextUrl.searchParams.get('execute') !== '0';
  const codesParam = req.nextUrl.searchParams.get('codes');
  const bookingCodes = codesParam
    ? codesParam.split(',').map((c) => c.trim()).filter(Boolean)
    : [...DEFAULT_BOOKING_RENT_REPAIR_CODES];

  const report = await runBookingRentInvoiceAuditRepair({ bookingCodes, execute });
  return Response.json({ ok: report.overallPass, ...report });
}

export const GET = handle;
export const POST = handle;
