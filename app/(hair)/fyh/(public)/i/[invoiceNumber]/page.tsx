import { notFound } from 'next/navigation';
import { PublicFyhInvoice } from '@/src/hair/components/billing/PublicFyhInvoice';
import { getInvoiceDetailByNumber } from '@/src/hair/services/invoices';

type Props = {
  params: Promise<{ invoiceNumber: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  const { invoiceNumber } = await params;
  return {
    title: `Invoice ${decodeURIComponent(invoiceNumber)}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvoicePage({ params }: Props) {
  const { invoiceNumber } = await params;
  const detail = await getInvoiceDetailByNumber(invoiceNumber);
  if (!detail) notFound();

  return <PublicFyhInvoice detail={detail} />;
}
