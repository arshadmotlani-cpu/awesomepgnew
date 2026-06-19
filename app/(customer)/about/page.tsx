import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system/ApgCard';

export const metadata = {
  title: 'About · Trust & safety',
};

export default function AboutPage() {
  return (
    <div className="apg-aurora mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold text-white">Trust & verification</h1>
      <p className="mt-3 text-apg-silver">
        Awesome PG is built for transparent, bed-first living — real photos, real availability, and
        honest pricing from browse to checkout.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {[
          {
            title: 'Verified residents',
            body: 'KYC before check-in. Identity reviewed by our team — not automated guesswork.',
          },
          {
            title: 'Transparent billing',
            body: 'Rent, AC electricity, and deposit balances visible in your Resident Hub wallet.',
          },
          {
            title: 'Safety & security',
            body: 'CCTV, access control, and on-site support at every property.',
          },
          {
            title: 'Real reviews',
            body: 'Resident feedback drives improvements. No fake stock testimonials.',
          },
        ].map((item) => (
          <ApgCard key={item.title} tier="card" className="p-5">
            <h2 className="text-base font-semibold text-white">{item.title}</h2>
            <p className="mt-2 text-sm text-apg-silver">{item.body}</p>
          </ApgCard>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/pgs"
          className="apg-glow-btn inline-flex min-h-[44px] items-center rounded-xl bg-apg-orange px-6 py-3 text-sm font-semibold text-white"
        >
          Browse PGs
        </Link>
        <Link
          href="/enquiry"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          Schedule a visit
        </Link>
      </div>
    </div>
  );
}
