import Link from 'next/link';

function ownerOsUrl(): string {
  return process.env.NEXT_PUBLIC_OWNER_URL ?? 'https://owner.awesomepg.in/dashboard';
}

/** Compact PG admin utility link — full Owner OS dashboard lives off the PG host. */
export function OwnerOsNavLink() {
  const ownerUrl = ownerOsUrl();

  return (
    <Link
      href={ownerUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Net worth, cashflow, and life metrics on owner.awesomepg.in"
      className="hidden shrink-0 items-center gap-1 rounded-md border border-white/10 bg-[#1A1F27] px-2.5 py-1.5 text-xs font-medium text-apg-silver transition hover:bg-white/10 hover:text-white sm:inline-flex"
    >
      Owner OS
      <span className="text-[10px] opacity-70" aria-hidden>↗</span>
    </Link>
  );
}
