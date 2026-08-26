import type { FamilyProductId } from '@/src/lib/brand/familyTokens';

const PNG_BY_PRODUCT: Record<FamilyProductId, string> = {
  awesomepg: 'public/brand/awesome-pg-256.png',
  apgos: 'public/admin-os/icon-512.png',
  capital: 'public/capital/icons/icon-256.png',
  fyhair: 'public/fyh/icons/icon-192.png',
};

/** Relative public path for PDF/email embed (Awesome PG default). */
export function getProductBrandLogoPng(product: FamilyProductId = 'awesomepg'): string {
  switch (product) {
    case 'awesomepg':
      return '/brand/awesome-pg-256.png';
    case 'capital':
      return '/capital/icons/icon-256.png';
    case 'fyhair':
      return '/fyh/icons/icon-192.png';
    case 'apgos':
      return '/admin-os/icon-512.png';
    default:
      return '/brand/awesome-pg-256.png';
  }
}

/** Filesystem path under process.cwd() for pdf-lib embed. */
export function getProductBrandLogoFsPath(product: FamilyProductId = 'awesomepg'): string {
  return PNG_BY_PRODUCT[product] ?? PNG_BY_PRODUCT.awesomepg;
}
