import { notFound } from 'next/navigation';
import { ResidentPayElectricityPageContent } from '@/src/components/customer/account/resident/ResidentPayElectricityPageContent';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { recordElectricityInvoiceView } from '@/src/services/electricityInvoiceViews';
import { loadResidentPayElectricityPageData } from '@/src/services/residentPayElectricityPage';

export const dynamic = 'force-dynamic';

type RouteParams = { invoiceId: string };

export default async function PayElectricityPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { invoiceId } = await params;
  const session = await requireCustomerSession(`/account/resident/pay-electricity/${invoiceId}`);

  const data = await loadResidentPayElectricityPageData(invoiceId);
  if (!data || data.invoice.customerId !== session.customerId) notFound();

  await recordElectricityInvoiceView({ invoiceId, source: 'pay_page' });

  return (
    <ResidentPayElectricityPageContent
      data={data}
      residentId={session.customerId}
    />
  );
}
