import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { SpatialLandingPage } from '@/src/components/world/SpatialLandingPage';
import { WorldShell } from '@/src/components/world';
import { listPublicPgs } from '@/src/services/publicPgReadCache';

export const metadata = {
  title: 'Awesome PG · Premium living beyond ordinary PGs',
  description:
    'Book your exact bed at premium PGs with gaming zones, chill rooms, daily cleaning, free laundry, high-speed WiFi, and honest amenities. Awesome PG — live awesome.',
};

export const dynamic = 'force-dynamic';

export default async function Home() {
  const pgsResult = await listPublicPgs();
  const pgs = pgsResult.ok ? pgsResult.data : [];
  const availableBeds = pgs.reduce((n, pg) => n + pg.availableBeds, 0);
  const totalBeds = pgs.reduce((n, pg) => n + pg.totalBeds, 0);
  const featuredPgs = pgs.map((pg) => ({
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
    <div className="apg-customer-shell flex min-h-screen flex-col bg-apg-charcoal">
      <SiteHeader />
      <main className="flex-1">
        <WorldShell>
          <SpatialLandingPage
            availableBeds={availableBeds}
            totalBeds={totalBeds}
            pgCount={pgs.length}
            featuredPgs={featuredPgs}
          />
        </WorldShell>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
