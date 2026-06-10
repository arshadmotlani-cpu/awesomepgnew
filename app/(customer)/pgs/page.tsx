import { listPublicPgs, type CustomerPgListRow } from '@/src/db/queries/customer';
import { PgCard } from '@/src/components/customer/PgCard';
import { EmptyPgList } from '@/src/components/customer/EmptyPgList';
import { MotionPgGrid, MotionPgGridItem, MotionReveal } from '@/src/components/customer/MotionReveal';
import { SafeModeBanner } from '@/src/components/customer/SafeModeBanner';
import { logServerRequest } from '@/src/lib/monitoring/logServerRequest';
import {
  contextFromHeaders,
  runWithMonitoringContextAsync,
} from '@/src/lib/monitoring/requestContext';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Browse PGs',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgListPage() {
  let pgs: CustomerPgListRow[] = [];

  const h = await headers();
  const ctx = contextFromHeaders(h);
  ctx.route = '/pgs';

  return runWithMonitoringContextAsync(ctx, async () => {
    await logServerRequest('/pgs');

    try {
      const result = await listPublicPgs();
      if (result.ok) {
        pgs = result.data;
      } else {
        console.error('[pgs error]', result.error, result.errorCode);
      }
    } catch (error) {
      console.error('[pgs error]', error);
    }

    return (
      <div>
        <SafeModeBanner />
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <MotionReveal>
            <header className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FF5A1F]">
                Discover
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                PGs accepting bookings
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-apg-silver">
                Pick a PG, choose your dates, and select one or more beds. You&apos;ll
                confirm your details and complete payment on the next steps.
              </p>
            </header>
          </MotionReveal>

          {pgs.length === 0 ? (
            <EmptyPgList />
          ) : (
            <MotionPgGrid>
              {pgs.map((pg) => (
                <MotionPgGridItem key={pg.id}>
                  <PgCard pg={pg} />
                </MotionPgGridItem>
              ))}
            </MotionPgGrid>
          )}
        </div>
      </div>
    );
  });
}
