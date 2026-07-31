import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ invoiceNumber: string }>;
};

export default async function PublicInvoiceAliasPage({ params }: Props) {
  const { invoiceNumber } = await params;
  redirect(`/i/${encodeURIComponent(decodeURIComponent(invoiceNumber))}`);
}
