import type { Metadata } from 'next';
import Link from 'next/link';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Brand previews · Awesome PG family',
  robots: { index: false, follow: false },
};

const links = [
  { href: '/brand/awesomepg', label: 'Awesome PG' },
  { href: '/brand/apgos', label: 'APG OS' },
  { href: '/brand/capital', label: 'Capital OS' },
  { href: '/brand/fyhair', label: 'For Your Hair ERP' },
] as const;

export default function BrandHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-apg-charcoal text-white">
      <nav className="border-b border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-apg-silver">Brand system</span>
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="text-sm text-apg-silver hover:text-white">
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="px-4 py-8">{children}</main>
    </div>
  );
}
