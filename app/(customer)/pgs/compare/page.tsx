import { Suspense } from 'react';
import Link from 'next/link';
import { PgCompareTable } from '@/src/components/customer/PgCompareTable';
import { listPublicPgs } from '@/src/db/queries/customer';
import { titleCase } from '@/src/lib/format';

export const metadata = { title: 'Compare PGs' };
export const dynamic = 'force-dynamic';

export default async function ComparePgsPage() {
  const result = await listPublicPgs();
  const pgs = result.ok
    ? result.data.map((pg) => ({
        slug: pg.slug,
        name: pg.name,
        city: pg.city,
        availableBeds: pg.availableBeds,
        totalBeds: pg.totalBeds,
        startingMonthlyPaise: pg.startingFromPaise > 0 ? pg.startingFromPaise : null,
        genderPolicy: titleCase(pg.genderPolicy.replace(/_/g, ' ')),
      }))
    : [];

  return (
    <div className="apg-aurora mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <nav className="mb-4 text-xs text-apg-silver">
        <Link href="/pgs" className="hover:text-apg-orange">
          Browse PGs
        </Link>
        <span className="mx-2 opacity-40">/</span>
        <span className="text-white">Compare</span>
      </nav>
      <h1 className="text-3xl font-semibold text-white">Compare PGs</h1>
      <p className="mt-2 max-w-2xl text-sm text-apg-silver">
        Side-by-side availability and pricing — pick the property that fits your life.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-apg-silver">Loading comparison…</p>}>
          <PgCompareTable pgs={pgs} />
        </Suspense>
      </div>
    </div>
  );
}
