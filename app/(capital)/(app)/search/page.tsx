import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Search is Vehicles filter — preserve query when possible. */
export default async function SearchRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : typeof sp.search === 'string' ? sp.search : '';
  redirect(q ? `/assets?search=${encodeURIComponent(q)}` : '/assets');
}
