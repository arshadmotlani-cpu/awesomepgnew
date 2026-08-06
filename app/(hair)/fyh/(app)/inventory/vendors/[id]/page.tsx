import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function LegacyInventoryVendorDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/vendors/${id}`);
}
