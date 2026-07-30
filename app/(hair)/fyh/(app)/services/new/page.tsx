import Link from 'next/link';
import { ServiceForm } from '@/src/hair/components/services/ServicesUi';
import { Button } from '@/src/hair/components/ui/button';
import { listServiceCategories } from '@/src/hair/services/salonServices';

export default async function NewServicePage() {
  const categories = await listServiceCategories();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Services</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">New service</h1>
        </div>
        <Link href="/services">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ServiceForm mode="create" categories={categories} />
    </div>
  );
}
