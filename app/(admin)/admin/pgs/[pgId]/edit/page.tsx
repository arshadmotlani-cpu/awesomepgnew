import { redirect } from 'next/navigation';

export default async function EditPgRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ pgId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { pgId } = await params;
  const sp = await searchParams;
  const query = sp.created === '1' ? '?created=1' : '';
  redirect(`/admin/pgs/${pgId}/listing${query}`);
}
