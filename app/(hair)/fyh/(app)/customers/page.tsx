import { CustomersList } from '@/src/hair/components/customers/CustomersList';
import { listCustomers } from '@/src/hair/services/customers';

export default async function CustomersPage() {
  const initialCustomers = await listCustomers();
  return <CustomersList initialCustomers={initialCustomers} />;
}
