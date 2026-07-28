import Link from 'next/link';
import { ServiceForm } from '@/src/hair/components/services/ServicesUi';
import { Button } from '@/src/hair/components/ui/button';
import { listProducts } from '@/src/hair/services/products';
import {
  listActiveStaff,
  listServiceCategories,
} from '@/src/hair/services/salonServices';

export default async function NewServicePage() {
  const [categories, staff, products] = await Promise.all([
    listServiceCategories(),
    listActiveStaff(),
    listProducts({ status: 'active' }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-fyh-accent">Services</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">New service</h1>
        </div>
        <Link href="/services">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ServiceForm
        mode="create"
        categories={categories}
        staff={staff}
        products={products}
      />
    </div>
  );
}
