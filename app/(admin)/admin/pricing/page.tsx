import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconTag } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listPricing, listPricingTiers } from '@/src/db/queries/admin';
import { formatDate, paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [tiers, rows] = await Promise.all([listPricingTiers(), listPricing()]);

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Time-versioned per-bed rates. Rooms of the same type start at the same tier; admins can override individual beds later."
      />

      {!tiers.ok ? (
        <DbStatusBanner error={tiers.error} />
      ) : tiers.data.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiers.data.map((t) => (
            <Card key={t.roomType}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{t.roomType}</p>
                    <p className="text-xs text-zinc-500">
                      Sleeps {t.capacity} · {t.bedCount} beds
                    </p>
                  </div>
                  <Badge tone={t.hasAc ? 'sky' : 'zinc'}>{t.hasAc ? 'AC' : 'Non-AC'}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-zinc-50 p-2">
                    <dt className="text-zinc-500">Daily</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">
                      {paiseToInr(t.dailyRatePaise ?? 0)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2">
                    <dt className="text-zinc-500">Weekly</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">
                      {paiseToInr(t.weeklyRatePaise ?? 0)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2">
                    <dt className="text-zinc-500">Monthly</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">
                      {paiseToInr(t.monthlyRatePaise ?? 0)}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="All bed pricing rows"
          description="Effective windows are half-open `[from, to)`. NULL `to` means open-ended."
        />
        {!rows.ok ? (
          <CardBody>
            <DbStatusBanner error={rows.error} />
          </CardBody>
        ) : rows.data.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<IconTag />}
              title="No pricing rows yet"
              description="The seed creates an initial price per bed. Run npm run db:seed."
            />
          </CardBody>
        ) : (
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <TR>
                <TH>PG</TH>
                <TH>Room</TH>
                <TH>Type</TH>
                <TH>Bed</TH>
                <TH className="text-right">Daily</TH>
                <TH className="text-right">Weekly</TH>
                <TH className="text-right">Monthly</TH>
                <TH className="text-right">Deposit</TH>
                <TH>Effective</TH>
              </TR>
            </THead>
            <TBody>
              {rows.data.map((p) => (
                <TR key={p.id}>
                  <TD>{p.pgName}</TD>
                  <TD>{p.roomNumber}</TD>
                  <TD>{p.roomType}</TD>
                  <TD className="font-medium text-zinc-900">{p.bedCode}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(p.dailyRatePaise)}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(p.weeklyRatePaise)}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(p.monthlyRatePaise)}</TD>
                  <TD className="text-right tabular-nums">
                    {paiseToInr(p.securityDepositPaise)}
                  </TD>
                  <TD>
                    {formatDate(p.effectiveFrom)} → {p.effectiveTo ? formatDate(p.effectiveTo) : 'open'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
