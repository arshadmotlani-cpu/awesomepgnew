import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentTimelinePanel } from '@/src/components/admin/ResidentTimelinePanel';
import { ResidentTimelineSearch } from '@/src/components/admin/ResidentTimelineSearch';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  buildResidentTimeline,
  resolveResidentTimelineMatches,
} from '@/src/services/residentTimeline';

export const dynamic = 'force-dynamic';

export default async function ResidentTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    customerId?: string;
    bookingId?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireAdminSession('/admin/residents/timeline');
  const query = typeof sp.q === 'string' ? sp.q.trim() : '';
  const customerId = typeof sp.customerId === 'string' ? sp.customerId : undefined;
  const bookingId = typeof sp.bookingId === 'string' ? sp.bookingId : undefined;

  let matches = null;
  let timeline = null;
  let error: string | null = null;

  try {
    if (customerId) {
      timeline = await buildResidentTimeline(session, customerId, bookingId ?? null);
    } else if (query.length >= 2) {
      matches = await resolveResidentTimelineMatches(session, query);
      if (matches.length === 1) {
        timeline = await buildResidentTimeline(
          session,
          matches[0]!.customerId,
          matches[0]!.bookingId,
        );
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: 'Resident timeline' },
        ]}
      />
      <PageHeader
        title="Resident timeline"
        description='When a resident says "I submitted it" — confirm existence, location, next actor, and blockers in under 10 seconds.'
        actions={
          <Link
            href="/admin/uploads"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Recent uploads →
          </Link>
        }
      />

      <ResidentTimelineSearch
        initialQuery={query}
        initialCustomerId={customerId}
        initialBookingId={bookingId}
      />

      {error ? <DbStatusBanner error={error} /> : null}

      {matches && matches.length > 1 ? (
        <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <h2 className="text-sm font-semibold text-white">Multiple matches — pick one</h2>
          <ul className="mt-3 space-y-2">
            {matches.map((m) => (
              <li key={`${m.customerId}:${m.bookingId ?? ''}`}>
                <Link
                  href={`/admin/residents/timeline?customerId=${m.customerId}${m.bookingId ? `&bookingId=${m.bookingId}` : ''}`}
                  className="block rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-[#FF5A1F]/40 hover:bg-white/[0.03]"
                >
                  <span className="font-medium text-white">{m.customerName}</span>
                  <span className="text-apg-silver">
                    {' '}
                    · {m.bookingCode ?? 'no booking'} · {m.pgName ?? '—'} · {m.roomNumber ?? '—'}{' '}
                    {m.bedCode ?? ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {matches && matches.length === 0 && query.length >= 2 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-6 text-sm text-amber-100">
          No resident found for &ldquo;{query}&rdquo;. Try phone, booking code (APG-…), name, or
          room/bed like <strong>204 B2</strong>.
        </div>
      ) : null}

      {timeline ? <ResidentTimelinePanel data={timeline} /> : null}

      {!timeline && !matches && !query && !customerId ? (
        <p className="text-sm text-apg-silver">
          Search by resident name, phone, booking code, or room/bed (e.g.{' '}
          <strong className="text-white">204 B2</strong>).
        </p>
      ) : null}
    </>
  );
}
