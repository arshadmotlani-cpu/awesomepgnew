import Link from 'next/link';
import { IconBuilding, IconChart, IconDashboard, IconUsers } from '@/src/components/admin/icons';

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
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
          Awesome PG
        </span>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Find your PG. Book your bed.
        </h1>
        <p className="mt-4 max-w-xl text-base text-zinc-600 sm:text-lg">
          Browse PGs across the city, choose your dates, and reserve the exact bed
          you want — all in a few simple steps.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pgs"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Browse PGs & book a bed
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            <IconDashboard width={16} height={16} />
            Open admin console
          </Link>
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon width={18} height={18} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900">{title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="w-full border-t border-zinc-200 bg-white py-4 text-center text-xs text-zinc-500">
        © {new Date().getUTCFullYear()} Awesome PG · Secure bookings powered by Razorpay
      </footer>
    </main>
  );
}
