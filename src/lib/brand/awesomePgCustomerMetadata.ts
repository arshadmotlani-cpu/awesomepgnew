import type { Metadata } from 'next';
import { AWESOME_PG, AWESOME_PG_BRAND } from '@/src/lib/brand/awesomePgTokens';

const base = AWESOME_PG_BRAND.assetBase;

const svgIcon = (file: string, sizes: string) =>
  ({ url: `${base}/${file}`, sizes, type: 'image/svg+xml' }) as const;

export const awesomePgCustomerIcons: Metadata['icons'] = {
  icon: [
    svgIcon('favicon-16.svg', '16x16'),
    svgIcon('favicon-32.svg', '32x32'),
    svgIcon('favicon-48.svg', '48x48'),
    svgIcon('icon-64.svg', '64x64'),
    svgIcon('icon-128.svg', '128x128'),
    svgIcon('icon-192.svg', '192x192'),
    svgIcon('icon-512.svg', '512x512'),
    { url: '/icons/apg-favicon-32.png', sizes: '32x32', type: 'image/png' },
  ],
  apple: [svgIcon('apple-touch-icon.svg', '180x180')],
  shortcut: `${base}/favicon-32.svg`,
};

/** Root layout metadata for the customer marketing site. */
export const awesomePgCustomerMetadata: Metadata = {
  title: {
    default: `${AWESOME_PG.name} · ${AWESOME_PG.tagline}`,
    template: `%s · ${AWESOME_PG.name}`,
  },
  description: AWESOME_PG.shortDescription,
  applicationName: AWESOME_PG.name,
  manifest: `${base}/manifest.webmanifest`,
  themeColor: AWESOME_PG_BRAND.color.primary,
  icons: awesomePgCustomerIcons,
  openGraph: {
    title: AWESOME_PG.name,
    description: AWESOME_PG.shortDescription,
    images: [
      {
        url: `${base}/og-mark.svg`,
        width: 512,
        height: 512,
        alt: AWESOME_PG.name,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: AWESOME_PG.name,
    images: [`${base}/og-mark.svg`],
  },
  appleWebApp: {
    capable: true,
    title: AWESOME_PG.name,
    statusBarStyle: 'black-translucent',
  },
};
