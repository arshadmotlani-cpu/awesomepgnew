import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { releaseExpiredHolds, expireStaleReservations } from '@/src/services/bookingLifecycle';
import { expireAbandonedReservationDrafts } from '@/src/services/reservationRequest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint — schedules the hold-expiry sweep that flips
 * `bed_reservations.status = 'hold' → 'cancelled'` for any rows whose
 * `hold_expires_at` has passed, and cancels the parent booking when its
 * last reservation is gone.
 *
 * Auth: a shared secret in the Authorization header. Configure
 * `CRON_SECRET` in your env and call with
 *   Authorization: Bearer $CRON_SECRET
 *
 * Both GET and POST are accepted so this works with Vercel Cron (which
 * issues GET) and with arbitrary external schedulers (cron + curl).
 *
 * Idempotent — running it 10× in a row is the same as running it once.
 */
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
  const result = await releaseExpiredHolds();
  const drafts = await expireAbandonedReservationDrafts();
  const stale = await expireStaleReservations();

  if (
    result.reservationsReleased > 0 ||
    result.bookingsCancelled > 0 ||
    drafts.expired > 0 ||
    stale.expired > 0
  ) {
    const { revalidateReservationLifecycleViews } = await import(
      '@/src/lib/occupancyRevalidate'
    );
    revalidateReservationLifecycleViews();
    const codes = [...result.cancelledCodes, ...stale.bookingCodes];
    for (const bookingCode of new Set(codes)) {
      revalidateReservationLifecycleViews({ bookingCode });
    }
  }

  return Response.json({ ok: true, ...result, draftsExpired: drafts.expired, staleReservations: stale });
}

export const GET = handle;
export const POST = handle;
