'use client';

import Link from 'next/link';
import { Button } from '@/src/capital/components/ui/button';

export function AssetPagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) params.set(k, v);
    }
    params.set('page', String(p));
    return `/assets?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-ac-text-muted">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} asChild={page > 1}>
          {page > 1 ? <Link href={hrefFor(page - 1)}>Previous</Link> : <span>Previous</span>}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
          {page < totalPages ? <Link href={hrefFor(page + 1)}>Next</Link> : <span>Next</span>}
        </Button>
      </div>
    </div>
  );
}
