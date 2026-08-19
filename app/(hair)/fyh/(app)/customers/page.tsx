import { CustomersList } from '@/src/hair/components/customers/CustomersList';
import { listCustomers } from '@/src/hair/services/customers';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function CustomersPage() {
  const ctx = await getTenantContextForPage();
  const initialCustomers = await listCustomers(undefined, ctx);
  return <CustomersList initialCustomers={initialCustomers} />;
}
