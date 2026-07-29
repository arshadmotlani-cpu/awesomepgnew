import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ServiceForm } from '@/src/hair/components/services/ServicesUi';
import { Button } from '@/src/hair/components/ui/button';
import { listProducts } from '@/src/hair/services/products';
import {
  getServiceDetail,
  listActiveStaff,
  listServiceCategories,
} from '@/src/hair/services/salonServices';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = { params: Promise<{ id: string }> };

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;
  const [detail, categories, staff, products] = await Promise.all([
    getServiceDetail(id),
    listServiceCategories(),
    listActiveStaff(),
    listProducts({ status: 'active' }),
  ]);
  if (!detail) notFound();
  const { service, staffIds, consumables } = detail;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-fyh-accent">Service</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{service.name}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            {service.code ? `${service.code} · ` : ''}
            {service.durationMinutes} min · {formatInrFromPaise(service.pricePaise)}
            {service.category ? ` · ${service.category}` : ''}
            {!service.isActive ? ' · Archived' : ''}
          </p>
        </div>
        <Link href="/services">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ServiceForm
        mode="edit"
        service={service}
        categories={categories}
        staff={staff}
        products={products}
        selectedStaffIds={staffIds}
        consumables={consumables.map((c) => ({
          productId: c.productId,
          quantity: Number(c.quantity),
          deductInventory: c.deductInventory,
        }))}
      />
    </div>
  );
}
