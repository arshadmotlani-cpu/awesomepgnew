import { FyhBrandPreview } from '@/src/components/brand/fyh/FyhBrandPreview';
import { Cormorant_Garamond, Outfit } from 'next/font/google';
import '@/src/hair/styles/globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fyh-display',
  display: 'swap',
});

const sans = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fyh-sans',
  display: 'swap',
});

export default function BrandFyHairPage() {
  return (
    <div className={`${display.variable} ${sans.variable} fyh-root`}>
      <FyhBrandPreview />
    </div>
  );
}
