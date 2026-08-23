import { notFound } from 'next/navigation';
import { PublicFyhInvoice } from '@/src/hair/components/billing/PublicFyhInvoice';
import { getInvoiceDetailByPublicToken } from '@/src/hair/services/invoices';

type Props = {
  params: Promise<{ invoiceNumber: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  const { invoiceNumber: token } = await params;
  const detail = await getInvoiceDetailByPublicToken(token);
  return {
    title: detail ? `Invoice ${detail.invoice.invoiceNumber}` : 'Invoice',
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvoicePage({ params }: Props) {
  const { invoiceNumber: token } = await params;
  const detail = await getInvoiceDetailByPublicToken(token);
  if (!detail) notFound();

  return <PublicFyhInvoice detail={detail} />;
}
