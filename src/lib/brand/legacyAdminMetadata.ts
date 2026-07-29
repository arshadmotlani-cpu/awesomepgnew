import type { Metadata } from 'next';

/** Live admin chrome metadata (Awesome PG) — until APG OS is approved. */
export const legacyAdminMetadata: Metadata = {
  title: 'Admin · Awesome PG',
  description: 'Property management console for Awesome PG.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Awesome PG',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/apg-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/apg-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/apg-favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/apg-admin-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/apg-admin-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apg-apple-touch.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Awesome PG Admin',
    images: [{ url: '/og/awesome-pg.png', width: 512, height: 512, alt: 'Awesome PG' }],
  },
};
