import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { LandingPage } from '@/src/components/customer/marketing/LandingPage';

export const metadata = {
  title: 'Awesome PG · Premium living beyond ordinary PGs',
  description:
    'Book your exact bed at premium PGs with gaming zones, chill rooms, daily cleaning, free laundry, high-speed WiFi, and honest amenities. Awesome PG — live awesome.',
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
