import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { StatCard } from '@/src/components/admin/StatCard';
import {
  IconBed,
  IconBuilding,
  IconCard,
  IconChart,
  IconUsers,
} from '@/src/components/admin/icons';
import {
  getDashboardStats,
  getOccupancyByPg,
  listPgs,
} from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, occupancy, pgs] = await Promise.all([
    getDashboardStats(),
    getOccupancyByPg(),
    listPgs(),
  ]);

  if (!stats.ok) {
    return (
      <>
        <PageHeader title="Overview" description="PG operations at a glance." />
        <DbStatusBanner error={stats.error} />
      </>
    );
  }

  const s = stats.data;
  const pgCount = pgs.ok ? pgs.data.length : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Manage each PG from PG listings — listing, rooms & electricity, and collections live on the edit page."
      />

      <div className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/10 p-4 text-sm text-orange-100">
        <p className="font-semibold text-white">How to set up a PG</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-orange-100/90">
          <li>
            Open{' '}
            <Link href="/admin/pgs" className="font-medium text-white underline">
              PG listings
            </Link>{' '}
            → Edit a PG
          </li>
          <li>
            <strong>Section 1 — Listing:</strong> photos, amenities, public details
          </li>
          <li>
            <strong>Section 2 — Rooms & electricity:</strong> add beds (rent) + meter readings per
            room
          </li>
          <li>
            <strong>Section 3 — Collections:</strong> enable QR payments, approve rent & electricity
            screenshots
          </li>
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="PG listings" value={s.totalPgs} icon={<IconBuilding />} accent="indigo" />
        <StatCard label="Total beds" value={s.totalBeds} icon={<IconBed />} accent="sky" />
        <StatCard
          label="Occupied today"
          value={s.occupiedBeds}
          icon={<IconUsers />}
          accent="rose"
        />
        <StatCard
          label="Occupancy"
          value={`${s.occupancyPct}%`}
          icon={<IconChart />}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/pgs"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconBuilding className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">PG listings</p>
          <p className="mt-1 text-sm text-apg-silver">
            {pgCount} properties · edit listing, rooms, electricity, collections
          </p>
        </Link>
        <Link
          href="/admin/payments"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconCard className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Collections</p>
          <p className="mt-1 text-sm text-apg-silver">Approve rent & electricity QR payments</p>
        </Link>
        <Link
          href="/admin/residents"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconUsers className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Residents</p>
          <p className="mt-1 text-sm text-apg-silver">Monthly tenants & billing status</p>
        </Link>
      </div>

      {occupancy.ok && occupancy.data.length > 0 ? (
        <Card>
          <CardHeader title="Occupancy by PG" />
          <CardBody>
            <ul className="divide-y divide-zinc-100">
              {occupancy.data.map((row) => (
                <li key={row.pgId} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{row.pgName}</p>
                    <p className="text-xs text-zinc-500">
                      {row.occupiedBeds}/{row.totalBeds} beds occupied
                    </p>
                  </div>
                  <span className="text-sm font-medium text-zinc-700">{row.occupancyPct}%</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
