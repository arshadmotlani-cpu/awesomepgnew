import { ApgOsBrandPreview } from '@/src/components/brand/apg-os/ApgOsBrandPreview';
import '@/src/styles/apg-os-tokens.css';

export default function BrandApgOsPage() {
  return (
    <div className="apg-admin-shell min-h-screen bg-[#0B0F14] px-4 py-8 text-white">
      <ApgOsBrandPreview />
    </div>
  );
}
