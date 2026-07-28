import { ServicesList } from '@/src/hair/components/services/ServicesUi';
import {
  listServiceCategories,
  listServices,
} from '@/src/hair/services/salonServices';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ServicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const statusRaw = one(sp.status) ?? 'active';
  const status =
    statusRaw === 'inactive' || statusRaw === 'all' || statusRaw === 'active'
      ? statusRaw
      : 'active';
  const category = one(sp.category);

  const [services, categories] = await Promise.all([
    listServices({ q, status, category }),
    listServiceCategories(),
  ]);

  return (
    <ServicesList
      services={services}
      categories={categories}
      q={q}
      status={status}
      category={category}
    />
  );
}
