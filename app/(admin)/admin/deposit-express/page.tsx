import { DepositExpressWorkspace } from '@/src/components/admin/depositExpress/DepositExpressWorkspace';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Deposit Express · Admin',
};

export default async function DepositExpressPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; customer?: string }>;
}) {
  await requireAdminSession('/admin/deposit-express');
  const params = await searchParams;
  return (
    <div data-deposit-express-workspace className="min-h-[calc(100vh-4rem)]">
      <DepositExpressWorkspace
        initialBookingId={params.booking ?? null}
        initialCustomerId={params.customer ?? null}
      />
    </div>
  );
}
