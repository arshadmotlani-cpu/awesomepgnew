import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/src/hair/styles/globals.css';
import { FyhAppearanceScript } from '@/src/hair/components/FyhAppearanceScript';
import { HairProviders } from '@/src/hair/components/HairProviders';
import { fyhMetadata } from '@/src/lib/brand/fyhMetadata';

const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fyh-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-fyh-mono',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = fyhMetadata;

export default function HairRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} fyh-root fyh-forest-bg`}>
      <FyhAppearanceScript />
      <HairProviders>
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center p-8">
              <div className="fyh-glass px-6 py-4 text-sm text-fyh-text-secondary">Loading…</div>
            </div>
          }
        >
          {children}
        </Suspense>
      </HairProviders>
    </div>
  );
}
