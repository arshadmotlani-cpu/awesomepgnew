import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ServiceDetailActions,
  ServiceForm,
} from '@/src/hair/components/services/ServicesUi';
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
    <div className="mx-auto max-w-xl space-y-4">
      <div className="fyh-glass flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <Link href="/services" className="text-sm text-fyh-accent hover:underline">
            ← Back
          </Link>
          <h1 className="fyh-display text-xl font-semibold">{service.name}</h1>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-fyh-text-secondary">
            <span>{service.category || 'Uncategorised'}</span>
            <span>·</span>
            <span>{service.durationMinutes} min</span>
            <span>·</span>
            <span>{formatInrFromPaise(service.pricePaise)}</span>
            <span>·</span>
            <span className={service.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'}>
              {service.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <ServiceDetailActions service={service} />
      </div>

      <div id="edit">
        <ServiceForm mode="edit" service={service} categories={categories} />
      </div>
    </div>
  );
}
