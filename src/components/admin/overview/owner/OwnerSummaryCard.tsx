import Link from 'next/link';

function ownerOsUrl(): string {
  return process.env.NEXT_PUBLIC_OWNER_URL ?? 'https://owner.awesomepg.in/dashboard';
}

/** PG admin link-out only — no Personal Finance metrics on PG host. */
export function OwnerSummaryCard() {
  const ownerUrl = ownerOsUrl();

  return (
    <section className="rounded-xl border border-[#FF5A1F]/20 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
          <h2 className="text-base font-semibold text-white">Your financial operating system</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Net worth, cashflow, and life metrics live on{' '}
            <Link href={ownerUrl} className="font-medium text-[#FF5A1F] hover:underline">
              owner.awesomepg.in
            </Link>
            — not on PG admin.
          </p>
        </div>
        <Link
          href={ownerUrl}
          className="rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-3 py-1.5 text-xs font-semibold text-[#FF5A1F] hover:bg-[#FF5A1F]/20"
        >
          Open Owner OS →
        </Link>
      </div>
    </section>
  );
}
