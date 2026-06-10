import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { StatCard } from '@/src/components/admin/StatCard';
import {
  IconBed,
  IconBuilding,
  IconChart,
  IconCheckCircle,
  IconClipboard,
  IconDoor,
  IconLayers,
  IconUsers,
} from '@/src/components/admin/icons';
import {
  getDashboardStats,
  getOccupancyByPg,
  listBookings,
} from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, occupancy, recentBookings] = await Promise.all([
    getDashboardStats(),
    getOccupancyByPg(),
    listBookings(),
  ]);

  if (!stats.ok) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="At-a-glance health of every PG you manage."
        />
        <DbStatusBanner error={stats.error} />
      </>
    );
  }

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live inventory snapshot pulled from the Phase 1 schema."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <StatCard label="Total PGs" value={s.totalPgs} icon={<IconBuilding />} accent="indigo" />
        <StatCard
          label="Total Floors"
          value={s.totalFloors}
          icon={<IconLayers />}
          accent="sky"
        />
        <StatCard label="Total Rooms" value={s.totalRooms} icon={<IconDoor />} accent="zinc" />
        <StatCard label="Total Beds" value={s.totalBeds} icon={<IconBed />} accent="indigo" />
        <StatCard
          label="Occupied Beds"
          value={s.occupiedBeds}
          icon={<IconUsers />}
          accent="rose"
          hint="Active reservations covering today"
        />
        <StatCard
          label="Available Beds"
          value={s.availableBeds}
          icon={<IconCheckCircle />}
          accent="emerald"
          hint={`+ ${s.blockedBeds} blocked · ${s.maintenanceBeds} in maintenance`}
        />
        <StatCard
          label="Occupancy %"
          value={`${s.occupancyPct}%`}
          icon={<IconChart />}
          accent="amber"
          hint="Occupied / total beds today"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Occupancy by property"
            description="Today's occupancy across every active PG."
            actions={
              <Link
                href="/admin/occupancy"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                View full report →
              </Link>
            }
          />
          <CardBody>
            {!occupancy.ok ? (
              <DbStatusBanner error={occupancy.error} />
            ) : occupancy.data.length === 0 ? (
              <EmptyState
                title="No PGs yet"
                description="Run the seed script or create a PG to populate this widget."
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {occupancy.data.map((row) => (
                  <li key={row.pgId} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{row.pgName}</p>
                      <p className="text-xs text-zinc-500">
                        {row.occupiedBeds} / {row.totalBeds} occupied ·{' '}
                        {row.availableBeds} available · {row.blockedBeds} blocked
                      </p>
                    </div>
                    <div className="w-40">
                      <div className="h-2 rounded-full bg-zinc-100">
                        <div
                          className="h-2 rounded-full bg-indigo-500"
                          style={{ width: `${Math.min(100, row.occupancyPct)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm font-medium text-zinc-700">
                      {row.occupancyPct}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent bookings"
            description="Most recent booking activity."
            actions={
              <Link
                href="/admin/bookings"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                All bookings →
              </Link>
            }
          />
          <CardBody>
            {!recentBookings.ok ? (
              <DbStatusBanner error={recentBookings.error} />
            ) : recentBookings.data.length === 0 ? (
              <EmptyState
                icon={<IconClipboard />}
                title="No bookings yet"
                description="Bookings will appear once Phase 3 (booking flow) goes live."
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recentBookings.data.slice(0, 5).map((b) => (
                  <li key={b.id} className="py-2.5">
                    <p className="text-sm font-medium text-zinc-900">{b.bookingCode}</p>
                    <p className="text-xs text-zinc-500">
                      {b.customerName} · {b.status} · {b.durationMode}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
