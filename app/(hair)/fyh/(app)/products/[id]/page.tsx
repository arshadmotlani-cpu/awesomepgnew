import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/products?edit=${id}`);
}
