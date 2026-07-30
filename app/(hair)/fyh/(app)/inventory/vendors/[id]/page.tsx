import { notFound } from 'next/navigation';
import { VendorForm } from '@/src/hair/components/inventory/VendorsUi';
import { getVendor } from '@/src/hair/services/vendors';

type Props = { params: Promise<{ id: string }> };

export default async function VendorDetailPage({ params }: Props) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">
          Inventory
        </p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">{vendor.name}</h1>
      </div>
      <VendorForm mode="edit" vendor={vendor} />
    </div>
  );
}
