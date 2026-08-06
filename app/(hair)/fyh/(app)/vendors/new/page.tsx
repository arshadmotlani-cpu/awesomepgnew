import { VendorForm } from '@/src/hair/components/inventory/VendorsUi';

export default function NewVendorPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">Vendors</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">New vendor</h1>
      </div>
      <VendorForm mode="create" />
    </div>
  );
}
