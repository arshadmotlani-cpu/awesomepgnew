import type { Metadata } from 'next';
import { FYH_BRAND, FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

const base = FYH_BRAND.assetBase;

const svgIcon = (file: string, sizes: string) =>
  ({ url: `${base}/${file}`, sizes, type: 'image/svg+xml' }) as const;

export const fyhMetadataIcons: Metadata['icons'] = {
  icon: [
    svgIcon('favicon-16.svg', '16x16'),
    svgIcon('favicon-32.svg', '32x32'),
    svgIcon('icon-192.svg', '192x192'),
    svgIcon('icon-512.svg', '512x512'),
  ],
  apple: [svgIcon('apple-touch-icon.svg', '180x180')],
  shortcut: `${base}/favicon-32.svg`,
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
        url: `${base}/og-mark.svg`,
        width: 512,
        height: 512,
        alt: FYH_ERP.shortName,
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: FYH_ERP.shortName,
    statusBarStyle: 'black-translucent',
  },
};
