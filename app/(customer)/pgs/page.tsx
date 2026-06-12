import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { listPublicPgs, type CustomerPgListRow } from '@/src/db/queries/customer';
import { isPaymentScreenshotUploadAvailable } from '@/src/lib/payments/screenshotUpload';
import { EmptyPgList } from '@/src/components/customer/EmptyPgList';
import { MotionReveal } from '@/src/components/customer/MotionReveal';
import { PgBrowseList } from '@/src/components/customer/PgBrowseList';
import { SafeModeBanner } from '@/src/components/customer/SafeModeBanner';
import { ElectricityMeterNotice } from '@/src/components/customer/ElectricityMeterNotice';
import { logServerRequest } from '@/src/lib/monitoring/logServerRequest';
import {
  contextFromHeaders,
  runWithMonitoringContextAsync,
} from '@/src/lib/monitoring/requestContext';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Browse PGs',
  description:
    'Discover premium PGs with live bed availability — gaming, chill rooms, daily cleaning, and more.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgListPage() {
  let pgs: CustomerPgListRow[] = [];

  const h = await headers();
  const ctx = contextFromHeaders(h);
  ctx.route = '/pgs';

  const uploadScreenshot = isPaymentScreenshotUploadAvailable()
    ? uploadPaymentScreenshotAction
    : undefined;

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

    const cardData = pgs.map((pg) => ({
      id: pg.id,
      slug: pg.slug,
      name: pg.name,
      city: pg.city,
      state: pg.state,
      pincode: pg.pincode,
      genderPolicy: pg.genderPolicy,
      amenities: pg.amenities,
      description: pg.description,
      heroImage: pg.heroImage,
      totalBeds: pg.totalBeds,
      availableBeds: pg.availableBeds,
      startingFromPaise: pg.startingFromPaise,
      hasPaymentEnabled: pg.hasPaymentEnabled,
    }));

    return (
      <div className="apg-aurora min-h-full">
        <SafeModeBanner />
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6">
            <ElectricityMeterNotice />
          </div>
          <MotionReveal>
            <header className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan">
                Discover
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                Find your next home base
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-apg-silver">
                Search by name or city, pick your dates, and reserve the exact bed you want —
                gaming zones, chill rooms, daily cleaning, free laundry, and amenities listed on
                each property.
              </p>
            </header>
          </MotionReveal>

          {pgs.length === 0 ? (
            <EmptyPgList />
          ) : (
            <PgBrowseList pgs={cardData} uploadScreenshot={uploadScreenshot} />
          )}
        </div>
      </div>
    );
  });
}
