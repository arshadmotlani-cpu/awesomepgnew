import { CustomersList } from '@/src/hair/components/customers/CustomersList';
import { listCustomers } from '@/src/hair/services/customers';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q;
  const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
  const customers = await listCustomers({ q });
  return <CustomersList customers={customers} q={q} />;
}
