import type { Metadata } from 'next';
import { FYH_BRAND, FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

const base = FYH_BRAND.assetBase;

const pngIcon = (file: string, sizes: string) =>
  ({ url: `${base}/${file}`, sizes, type: 'image/png' }) as const;

export const fyhMetadataIcons: Metadata['icons'] = {
  icon: [
    pngIcon('favicon-16.png', '16x16'),
    pngIcon('favicon-32.png', '32x32'),
    pngIcon('favicon-48.png', '48x48'),
    pngIcon('icon-64.png', '64x64'),
    pngIcon('icon-128.png', '128x128'),
    pngIcon('icon-192.png', '192x192'),
    pngIcon('icon-512.png', '512x512'),
    { url: `${base}/icons/favicon-32.png`, sizes: '32x32', type: 'image/png' },
  ],
  apple: [pngIcon('apple-touch-icon.png', '180x180')],
  shortcut: `${base}/favicon-32.png`,
};

export const fyhMetadata: Metadata = {
  title: {
    default: FYH_ERP.name,
    template: `%s · ${FYH_ERP.name}`,
  },
  description: FYH_ERP.tagline,
  applicationName: FYH_ERP.name,
  manifest: `${base}/manifest.webmanifest`,
  themeColor: FYH_BRAND.mark.primary,
  icons: fyhMetadataIcons,
  openGraph: {
    title: FYH_ERP.name,
    description: FYH_ERP.tagline,
    images: [
      {
        url: `${base}/icon-512.png`,
        width: 512,
        height: 512,
        alt: 'SOFT',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: FYH_ERP.shortName,
    statusBarStyle: 'black-translucent',
  },
};
