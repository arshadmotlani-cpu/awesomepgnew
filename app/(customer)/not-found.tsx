import Link from 'next/link';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { AWESOME_PG } from '@/src/lib/brand/awesomePgTokens';

export default function CustomerNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center text-white">
      <AwesomePgLogo size={64} className="mb-6" />
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-apg-silver">
        This page isn&apos;t part of {AWESOME_PG.name}.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-apg-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Back home
      </Link>
    </div>
  );
}
