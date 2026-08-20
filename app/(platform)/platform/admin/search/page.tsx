import Link from 'next/link';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { searchPlatformAdmin } from '@/src/platform/services/admin';

type Props = { searchParams: Promise<{ q?: string }> };

export default async function PlatformSearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const results = q ? await searchPlatformAdmin(q) : [];

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `Results for “${q}”` : 'Search organizations and users.'} />
      {!q ? (
        <EmptyState
          title="Enter a search query"
          description="Use the search bar in the header to find organizations by name or slug, or users by email."
        />
      ) : results.length === 0 ? (
        <EmptyState title="No results" description={`Nothing matched “${q}”.`} />
      ) : (
        <DataTable
          rows={results}
          getRowKey={(row) => `${row.type}-${row.id}`}
          columns={[
            {
              key: 'type',
              header: 'Type',
              cell: (row) => (row.type === 'organization' ? 'Organization' : 'User'),
            },
            {
              key: 'label',
              header: 'Name',
              cell: (row) => (
                <Link href={row.href} className="font-medium hover:text-[var(--plt-accent)]">
                  {row.label}
                </Link>
              ),
            },
            { key: 'sublabel', header: 'Detail', cell: (row) => row.sublabel },
          ]}
        />
      )}
    </>
  );
}
