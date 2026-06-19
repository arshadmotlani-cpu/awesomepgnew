import Link from 'next/link';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { requestTypeLabel } from '@/src/lib/residents/residentHomeState';

type OpenRequest = { id: string; type: string; status: string };

export function ResidentHomeActiveRequests({ requests }: { requests: OpenRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Active requests</h2>
        <Link
          href={residentTabHref('requests')}
          className="text-xs font-semibold text-indigo-700 hover:text-indigo-600"
        >
          Open requests center →
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {requests.slice(0, 3).map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5"
          >
            <span className="text-sm font-medium text-zinc-900">{requestTypeLabel(r.type)}</span>
            <StatusChip status={r.status} />
          </li>
        ))}
      </ul>
      {requests.length > 3 ? (
        <p className="mt-2 text-xs text-zinc-500">+{requests.length - 3} more in requests center</p>
      ) : null}
    </ApgCard>
  );
}
