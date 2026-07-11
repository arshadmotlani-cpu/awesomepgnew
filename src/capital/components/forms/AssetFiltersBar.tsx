'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { assetStatusEnum } from '@/src/capital/db/schema/enums';

export function AssetFiltersBar({ manufacturers }: { manufacturers: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v) next.set(k, v);
    }
    next.set('page', '1');
    router.push(`/assets?${next.toString()}`);
  }

  return (
    <form
      className="ac-glass-card grid gap-3 p-4 md:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <div>
        <label className="mb-1 block text-xs text-ac-text-muted">Search</label>
        <Input name="search" defaultValue={params.get('search') ?? ''} aria-label="Search assets" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ac-text-muted">Status</label>
        <select
          name="status"
          defaultValue={params.get('status') ?? ''}
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
        >
          <option value="">All</option>
          {assetStatusEnum.enumValues.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ac-text-muted">Manufacturer</label>
        <select
          name="manufacturer"
          defaultValue={params.get('manufacturer') ?? ''}
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
        >
          <option value="">All</option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ac-text-muted">Profit</label>
        <select
          name="profitFilter"
          defaultValue={params.get('profitFilter') ?? 'all'}
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
        >
          <option value="all">All</option>
          <option value="profit">Profitable</option>
          <option value="loss">Loss</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ac-text-muted">Sort</label>
        <select
          name="sort"
          defaultValue={params.get('sort') ?? 'created'}
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
        >
          <option value="created">Created</option>
          <option value="purchase">Purchase date</option>
          <option value="investment">Investment</option>
          <option value="profit">Profit</option>
          <option value="holding">Holding days</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" className="flex-1">
          Apply
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/assets')}>
          Reset
        </Button>
      </div>
    </form>
  );
}
