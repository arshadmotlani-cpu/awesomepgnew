import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system/ApgCard';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';

export const metadata = { title: 'Schedule a visit' };

export default function EnquiryPage() {
  return (
    <div className="apg-aurora mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">Schedule a visit</h1>
      <p className="mt-2 text-sm text-apg-silver">
        No login required. Tell us which PG you&apos;re interested in and we&apos;ll arrange a
        walkthrough.
      </p>
      <ApgCard tier="card" className="mt-8 space-y-4 p-6">
        <p className="text-sm text-apg-silver">
          For now, reach us on WhatsApp with your preferred PG, move-in date, and sharing preference
          (single/double/triple). A dedicated enquiry form is coming soon.
        </p>
        <a
          href={siteWhatsAppUrl(
            'Hi Awesome PG, I would like to schedule a visit. PG: … Move-in: … Sharing: …',
          )}
          className="apg-glow-btn inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-apg-orange text-sm font-semibold text-white"
        >
          Chat on WhatsApp
        </a>
        <Link href="/pgs" className="block text-center text-sm text-apg-cyan hover:text-apg-orange">
          Or browse PGs online →
        </Link>
      </ApgCard>
    </div>
  );
}
