import { listPublicPgs } from '@/src/db/queries/customer';
import { PgCard } from '@/src/components/customer/PgCard';

export const metadata = {
  title: 'Browse PGs',
};

// Cart and availability data is request-time; opt out of build caching so we
// always see fresh inventory in this read-heavy page.
export const dynamic = 'force-dynamic';

export default async function PgListPage() {
  const result = await listPublicPgs();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Discover
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl">
          PGs accepting bookings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Pick a PG, choose your dates, and select one or more beds. You&apos;ll
          confirm your details and complete payment on the next steps.
        </p>
      </header>

      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((pg) => (
            <li key={pg.id}>
              <PgCard pg={pg} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      <p className="font-semibold">We couldn&apos;t load PGs right now.</p>
      <p className="mt-1">
        Please try again in a few moments. If the problem continues, contact support.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
      <p className="font-semibold text-zinc-700">No PGs are accepting bookings yet.</p>
      <p className="mt-1">New properties will appear here as they become available.</p>
    </div>
  );
}
