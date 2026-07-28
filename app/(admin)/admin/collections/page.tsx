import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { CollectionsBucketNav, CollectionsKpiStrip } from '@/src/components/admin/collections/CollectionsKpiStrip';
import { CollectionsBucketTable } from '@/src/components/admin/collections/CollectionsBucketTable';
import { CollectionsCalendarGrid } from '@/src/components/admin/collections/CollectionsCalendarGrid';
import { listPgs } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { isCollectionsV1Enabled } from '@/src/lib/collections/featureFlag';
import {
  collectionsBucketLabel,
  type CollectionsBucket,
} from '@/src/lib/collections/invoiceLifecycleLabel';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadCollectionsCalendar } from '@/src/services/collectionsCalendar';
import { loadCollectionsDashboard } from '@/src/services/collectionsDashboard';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKETS: CollectionsBucket[] = [
  'upcoming',
  'due_today',
  'overdue',
  'awaiting',
  'paid_today',
];

function isBucket(v: string | undefined): v is CollectionsBucket {
  return !!v && (BUCKETS as string[]).includes(v);
}

export default async function CollectionsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    bucket?: string;
    view?: string;
    month?: string;
    day?: string;
    pgId?: string;
    tab?: string;
  }>;
}) {
  if (!isCollectionsV1Enabled()) {
    redirect('/admin/billing');
  }

  const sp = await searchParams;
  // Preserve legacy deep-links that expected billing redirects.
  if (sp.tab === 'approvals') {
    redirect('/admin/operations?filter=waiting_for_approval');
  }

  const session = await requireAdminSession('/admin/collections');
  await ensureAdminPageNotificationsSeen('/admin/collections', '/admin/collections');

  if (!adminHasPermission(session.role, 'collections:read')) {
    redirect('/admin/overview');
  }

  const view = sp.view === 'calendar' ? 'calendar' : 'queue';
  const bucket: CollectionsBucket = isBucket(sp.bucket)
    ? sp.bucket
    : view === 'calendar'
      ? 'due_today'
      : 'overdue';
  const today = formatDate(new Date());
  const month = (sp.month ?? today.slice(0, 7)).slice(0, 7);
  const pgId = sp.pgId && sp.pgId.length > 0 ? sp.pgId : undefined;

  const [snapshot, calendar, pgs] = await Promise.all([
    loadCollectionsDashboard({
      pgId,
      session: { role: session.role, pgScope: session.pgScope },
      todayIso: today,
    }),
    view === 'calendar'
      ? loadCollectionsCalendar({
          month,
          pgId,
          session: { role: session.role, pgScope: session.pgScope },
        })
      : Promise.resolve(null),
    listPgs(),
  ]);

  const canRemind = adminHasPermission(session.role, 'collections:remind');
  const canWrite = adminHasPermission(session.role, 'collections:write');
  const activeNav = view === 'calendar' ? 'calendar' : bucket;
  const queueRows = snapshot.buckets[bucket];
  const selectedDay = sp.day && calendar ? calendar.days.find((d) => d.date === sp.day) : null;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Admin', href: '/admin/overview' },
          { label: 'Collections', href: '/admin/collections' },
        ]}
      />
      <PageHeader
        title="Collections"
        description="Daily receivables queues — outstanding amounts from the Resident Financial Engine."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/billing"
              className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-white hover:bg-white/5"
            >
              Billing Center
            </Link>
            <Link
              href="/admin/operations?filter=waiting_for_approval"
              className="inline-flex min-h-[36px] items-center rounded-lg bg-[#FF5A1F] px-3 text-xs font-semibold text-white hover:brightness-110"
            >
              Proof queue
            </Link>
          </div>
        }
      />

      <div className="mt-6">
        <CollectionsKpiStrip kpis={snapshot.kpis} />
      </div>

      {(pgs.ok ? pgs.data : []).length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={
              view === 'calendar'
                ? `/admin/collections?view=calendar&month=${month}`
                : `/admin/collections?bucket=${bucket}`
            }
            className={
              'rounded-full px-3 py-1 text-xs ' +
              (!pgId ? 'bg-white/15 text-white' : 'bg-white/5 text-apg-silver hover:text-white')
            }
          >
            All PGs
          </Link>
          {(pgs.ok ? pgs.data : []).map((pg) => (
            <Link
              key={pg.id}
              href={
                view === 'calendar'
                  ? `/admin/collections?view=calendar&month=${month}&pgId=${pg.id}`
                  : `/admin/collections?bucket=${bucket}&pgId=${pg.id}`
              }
              className={
                'rounded-full px-3 py-1 text-xs ' +
                (pgId === pg.id
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-apg-silver hover:text-white')
              }
            >
              {pg.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[200px_1fr]">
        <aside>
          <CollectionsBucketNav
            active={activeNav}
            counts={{
              upcoming: snapshot.kpis.upcomingCount,
              due_today: snapshot.kpis.dueTodayCount,
              overdue: snapshot.kpis.overdueCount,
              awaiting: snapshot.kpis.awaitingCount,
              paid_today: snapshot.kpis.paidTodayCount,
            }}
          />
        </aside>

        <section>
          {view === 'calendar' && calendar ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Collection calendar · {month}</h2>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/collections?view=calendar&month=${prevMonth(month)}${pgId ? `&pgId=${pgId}` : ''}`}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/5"
                  >
                    Prev
                  </Link>
                  <Link
                    href={`/admin/collections?view=calendar&month=${nextMonth(month)}${pgId ? `&pgId=${pgId}` : ''}`}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/5"
                  >
                    Next
                  </Link>
                </div>
              </div>
              <CollectionsCalendarGrid month={month} days={calendar.days} selectedDate={sp.day} />
              {selectedDay ? (
                <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
                  <h3 className="text-sm font-semibold text-white">{selectedDay.date}</h3>
                  <ul className="mt-2 space-y-1 text-sm text-apg-silver">
                    <li>
                      Due: {selectedDay.dueCount} · {paiseToInr(selectedDay.duePaise)}
                    </li>
                    <li>
                      Paid: {selectedDay.paidCount} · {paiseToInr(selectedDay.paidPaise)}
                    </li>
                    <li>
                      Awaiting proof: {selectedDay.awaitingCount} ·{' '}
                      {paiseToInr(selectedDay.awaitingPaise)}
                    </li>
                    <li>
                      Upcoming: {selectedDay.upcomingCount} · {paiseToInr(selectedDay.upcomingPaise)}
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <header>
                <h2 className="text-lg font-semibold text-white">
                  {collectionsBucketLabel(bucket)}
                </h2>
                <p className="mt-1 text-sm text-apg-silver">
                  {queueRows.length} item{queueRows.length === 1 ? '' : 's'}
                </p>
              </header>
              <CollectionsBucketTable
                bucket={bucket}
                rows={queueRows}
                canRemind={canRemind}
                canWrite={canWrite}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m!, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
