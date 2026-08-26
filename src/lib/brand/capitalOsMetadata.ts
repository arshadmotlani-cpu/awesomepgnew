import type { Metadata } from 'next';
import { CAPITAL_OS, CAPITAL_OS_BRAND } from '@/src/lib/brand/capitalOsTokens';

const base = CAPITAL_OS_BRAND.assetBase;

const pngIcon = (file: string, sizes: string) =>
  ({ url: `${base}/${file}`, sizes, type: 'image/png' }) as const;

export const capitalOsIcons: Metadata['icons'] = {
  icon: [
    pngIcon('favicon-16.png', '16x16'),
    pngIcon('favicon-32.png', '32x32'),
    pngIcon('favicon-48.png', '48x48'),
    pngIcon('icon-64.png', '64x64'),
    pngIcon('icon-128.png', '128x128'),
    pngIcon('icon-192.png', '192x192'),
    pngIcon('icon-512.png', '512x512'),
    { url: '/capital/icons/favicon.ico', sizes: '32x32' },
  ],
  apple: [pngIcon('apple-touch-icon.png', '180x180')],
  shortcut: `${base}/favicon-32.png`,
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
        url: `${base}/icon-512.png`,
        width: 512,
        height: 512,
        alt: 'AUTO',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: CAPITAL_OS.name,
    images: [`${base}/icon-512.png`],
  },
  appleWebApp: {
    capable: true,
    title: CAPITAL_OS.pwaShortName,
    statusBarStyle: 'black-translucent',
  },
};
