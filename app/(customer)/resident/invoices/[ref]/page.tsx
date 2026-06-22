import { ResidentInvoiceDetailView } from '@/src/components/billing/ResidentInvoiceDetailView';

export const dynamic = 'force-dynamic';

/** Permanent share URL — /resident/invoices/{uuid|invoiceNumber} */
export default async function ResidentInvoiceSharePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <ResidentInvoiceDetailView ref={ref} />;
}
