import Link from 'next/link';
import { notFound } from 'next/navigation';
import { VendorForm } from '@/src/hair/components/inventory/VendorsUi';
import { Button } from '@/src/hair/components/ui/button';
import { listBrandsForVendor } from '@/src/hair/services/brands';
import { getVendor } from '@/src/hair/services/vendors';

type Props = { params: Promise<{ id: string }> };

export default async function VendorEditPage({ params }: Props) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const brands = await listBrandsForVendor(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Vendors</p>
          <h1 className="fyh-display mt-1 text-2xl font-semibold">Edit {vendor.name}</h1>
        </div>
        <Link href={`/vendors/${vendor.id}`}>
          <Button type="button" variant="secondary">
            Back to ledger
          </Button>
        </Link>
      </div>
      <VendorForm
        mode="edit"
        vendor={vendor}
        initialBrandNames={brands.map((b) => b.name)}
      />
    </div>
  );
}
