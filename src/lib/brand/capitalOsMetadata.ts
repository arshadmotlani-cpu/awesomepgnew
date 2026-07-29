import type { Metadata } from 'next';
import { CAPITAL_OS, CAPITAL_OS_BRAND } from '@/src/lib/brand/capitalOsTokens';

const base = CAPITAL_OS_BRAND.assetBase;

const svgIcon = (file: string, sizes: string) =>
  ({ url: `${base}/${file}`, sizes, type: 'image/svg+xml' }) as const;

export const capitalOsIcons: Metadata['icons'] = {
  icon: [
    svgIcon('favicon-16.svg', '16x16'),
    svgIcon('favicon-32.svg', '32x32'),
    svgIcon('icon-192.svg', '192x192'),
    svgIcon('icon-512.svg', '512x512'),
    { url: '/capital/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    { url: '/capital/icons/favicon.ico', sizes: '32x32' },
  ],
  apple: [svgIcon('apple-touch-icon.svg', '180x180')],
  shortcut: `${base}/favicon-32.svg`,
};

export const capitalOsMetadata: Metadata = {
  title: {
    default: CAPITAL_OS.name,
    template: `%s · ${CAPITAL_OS.name}`,
  },
  description: `${CAPITAL_OS.tagline} · ${CAPITAL_OS.legalName}`,
  applicationName: CAPITAL_OS.pwaShortName,
  manifest: '/capital/manifest.webmanifest',
  themeColor: CAPITAL_OS_BRAND.color.primary,
  icons: capitalOsIcons,
  openGraph: {
    title: `${CAPITAL_OS.name} · ${CAPITAL_OS.legalName}`,
    description: CAPITAL_OS.tagline,
    images: [
      {
        url: `${base}/og-mark.svg`,
        width: 512,
        height: 512,
        alt: CAPITAL_OS.name,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: CAPITAL_OS.name,
    images: [`${base}/og-mark.svg`],
  },
  appleWebApp: {
    capable: true,
    title: CAPITAL_OS.pwaShortName,
    statusBarStyle: 'black-translucent',
  },
};
