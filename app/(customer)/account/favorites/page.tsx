import Link from 'next/link';
import { FavoritesList } from '@/src/components/customer/PgFavoriteButton';
import { listPublicPgs } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';

export const metadata = { title: 'Saved PGs' };
export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  await requireCustomerSession('/account/favorites');
  const result = await listPublicPgs();
  const pgs = result.ok
    ? result.data.map((pg) => ({
        slug: pg.slug,
        name: pg.name,
        city: pg.city,
        availableBeds: pg.availableBeds,
      }))
    : [];

  return (
    <div className="apg-aurora mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <nav className="apg-account-nav text-xs">
        <Link href="/account/profile">Profile</Link>
        <span className="mx-1">/</span>
        <span className="text-white">Saved PGs</span>
      </nav>
      <h1 className="mt-4 text-2xl font-semibold text-white">Favorites</h1>
      <p className="mt-1 text-sm text-apg-silver">PGs you saved while browsing — stored on this device.</p>
      <div className="mt-6">
        <FavoritesList pgs={pgs} />
      </div>
    </div>
  );
}
