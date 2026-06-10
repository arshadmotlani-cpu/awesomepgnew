import Link from 'next/link';
import { IconBuilding, IconChart, IconUsers } from '@/src/components/admin/icons';

export const metadata = {
  title: 'Awesome PG · Property management',
};

const FEATURES = [
  {
    icon: IconBuilding,
    title: 'Pick your exact bed',
    body: 'Browse rooms and choose the bed you want — no surprises at check-in.',
  },
  {
    icon: IconChart,
    title: 'Book in minutes',
    body: 'Select dates, confirm your details, pay securely, and you are all set.',
  },
  {
    icon: IconUsers,
    title: 'Stay with confidence',
    body: 'Manage bookings, identity verification, and monthly bills from one place.',
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#0B0F14] text-[#f4f6f8]">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="rounded-full border border-[#FF5A1F]/30 bg-[#FF5A1F]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#FF5A1F]">
          Awesome PG
        </span>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Find your PG. Book your bed.
        </h1>
        <p className="mt-4 max-w-xl text-base text-apg-silver sm:text-lg">
          Browse PGs across the city, choose your dates, and reserve the exact bed
          you want — all in a few simple steps.
        </p>

        <div className="mt-8">
          <Link
            href="/pgs"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF5A1F] px-6 py-3 text-sm font-semibold text-white apg-glow-btn transition hover:brightness-110"
          >
            Browse PGs & book a bed
          </Link>
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="apg-glass rounded-2xl p-5 text-left">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5A1F]/15 text-[#FF5A1F]">
                <Icon width={18} height={18} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm text-apg-silver">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="w-full border-t border-white/5 py-4 text-center text-xs text-apg-silver">
        © {new Date().getUTCFullYear()} Awesome PG · Secure bookings powered by Razorpay
      </footer>
    </main>
  );
}
