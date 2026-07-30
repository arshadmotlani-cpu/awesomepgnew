import Link from 'next/link';
import { CustomerCreateForm } from '@/src/hair/components/customers/CustomerCreateForm';
import { Button } from '@/src/hair/components/ui/button';

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">
            Customers
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">New customer</h1>
        </div>
        <Link href="/customers">
          <Button type="button" variant="ghost">
            Back to list
          </Button>
        </Link>
      </div>
      <CustomerCreateForm />
    </div>
  );
}
