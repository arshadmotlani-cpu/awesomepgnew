import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ServiceForm } from '@/src/hair/components/services/ServicesUi';
import { Button } from '@/src/hair/components/ui/button';
import { getServiceDetail, listServiceCategories } from '@/src/hair/services/salonServices';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = { params: Promise<{ id: string }> };

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;
  const [detail, categories] = await Promise.all([
    getServiceDetail(id),
    listServiceCategories(),
  ]);
  if (!detail) notFound();
  const { service } = detail;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-fyh-accent">Service</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{service.name}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            {service.durationMinutes} min · {formatInrFromPaise(service.pricePaise)}
            {service.category ? ` · ${service.category}` : ''}
            {!service.isActive ? ' · Inactive' : ''}
          </p>
        </div>
        <Link href="/services">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ServiceForm mode="edit" service={service} categories={categories} />
    </div>
  );
}
