import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconSettings } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listPgSettings } from '@/src/db/queries/admin';
import { amenityLabel } from '@/src/lib/pgAmenities';
import { titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const res = await listPgSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="PG-level configuration. Editing UI ships in Phase 6 — for now this is a read-only mirror of what's in the database."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconSettings />}
          title="No PGs configured"
          description="Seed inventory to see configurable settings."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {res.data.map((pg) => {
            const amenityEntries = Object.entries(pg.amenities ?? {}).filter(
              ([k, v]) => v === true && amenityLabel(k),
            );
            return (
              <Card key={pg.id}>
                <CardHeader
                  title={pg.name}
                  description={`${pg.city}, ${pg.state} · PIN ${pg.pincode}`}
                  actions={
                    <Badge tone={pg.isActive ? 'emerald' : 'zinc'}>
                      {pg.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  }
                />
                <CardBody>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Slug</dt>
                      <dd className="mt-0.5 font-mono text-zinc-800">{pg.slug}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Gender policy
                      </dt>
                      <dd className="mt-0.5 text-zinc-800">{titleCase(pg.genderPolicy)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Description
                      </dt>
                      <dd className="mt-0.5 text-zinc-700">{pg.description ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Amenities
                      </dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {amenityEntries.length === 0 ? (
                          <span className="text-zinc-500">—</span>
                        ) : (
                          amenityEntries.map(([k]) => (
                            <Badge key={k} tone="indigo">
                              {amenityLabel(k) ?? titleCase(k)}
                            </Badge>
                          ))
                        )}
                      </dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader
          title="System defaults"
          description="These will become editable in Phase 6 (Operations & Reporting)."
        />
        <CardBody>
          <ul className="grid grid-cols-1 gap-3 text-sm text-zinc-700 sm:grid-cols-2">
            <li className="rounded-md border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Booking hold</p>
              <p className="mt-1 font-medium text-zinc-900">15 minutes</p>
              <p className="text-xs text-zinc-500">
                Time a customer's cart holds beds while payment completes.
              </p>
            </li>
            <li className="rounded-md border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Default currency</p>
              <p className="mt-1 font-medium text-zinc-900">INR</p>
              <p className="text-xs text-zinc-500">All amounts stored as paise (bigint).</p>
            </li>
            <li className="rounded-md border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Tax mode</p>
              <p className="mt-1 font-medium text-zinc-900">Not configured</p>
              <p className="text-xs text-zinc-500">
                GSTIN + per-PG tax rates land alongside invoicing in Phase 6.
              </p>
            </li>
            <li className="rounded-md border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Payment provider</p>
              <p className="mt-1 font-medium text-zinc-900">
                {(process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase() === 'razorpay'
                  ? 'Razorpay'
                  : 'Mock (dev)'}
              </p>
              <p className="text-xs text-zinc-500">
                Switch via the <code className="rounded bg-white px-1">PAYMENT_PROVIDER</code> env.
              </p>
            </li>
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
