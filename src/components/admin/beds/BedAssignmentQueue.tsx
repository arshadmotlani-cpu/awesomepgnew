'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  buildAssignBedHref,
  queueCategorySectionLabel,
  type BedAssignmentQueueCategory,
  type BedAssignmentQueueItem,
} from '@/src/lib/beds/bedAssignmentCommand';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

export function BedAssignmentQueue({ items }: { items: BedAssignmentQueueItem[] }) {
  const grouped = useMemo(() => {
    const order: BedAssignmentQueueCategory[] = ['waiting', 'transfer', 'returning', 'special'];
    return order
      .map((category) => ({
        category,
        rows: items.filter((i) => i.category === category),
      }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="mb-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-100">No pending assignments</h2>
        <p className="mt-2 text-sm text-emerald-200/90">
          All verified residents have beds. Use the map below to assign walk-ins.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-white">Assignment queue</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Sorted for you — waiting bookings first, then transfers and reserved move-ins.
        </p>
      </header>

      <div className="space-y-8">
        {grouped.map(({ category, rows }) => (
          <div key={category}>
            <h3 className="mb-3 text-sm font-semibold text-white">
              {queueCategorySectionLabel(category)}
              <span className="ml-2 text-apg-silver">({rows.length})</span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>Booking</TH>
                    <TH>Preferred PG</TH>
                    <TH>Recommended bed</TH>
                    <TH>Next action</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        {row.customerId ? (
                          <Link
                            href={`/admin/residents/${row.customerId}`}
                            className="font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {row.residentName}
                          </Link>
                        ) : (
                          <span className="text-apg-silver">{row.residentName}</span>
                        )}
                      </TD>
                      <TD className="font-mono text-xs text-apg-silver">
                        {row.bookingCode ?? '—'}
                      </TD>
                      <TD className="text-xs text-apg-silver">{row.preferredPg ?? 'Any'}</TD>
                      <TD className="text-xs text-white">
                        {row.recommendedBedLabel ?? '—'}
                      </TD>
                      <TD className="max-w-[180px] text-xs text-apg-silver">{row.nextAction}</TD>
                      <TD className="text-right">
                        {row.category === 'waiting' && row.customerId && row.recommendedBedId ? (
                          <Link
                            href={buildAssignBedHref({
                              pgId: row.recommendedPgId,
                              bedId: row.recommendedBedId,
                              customerId: row.customerId,
                            })}
                            className={PRIMARY}
                          >
                            Assign bed
                          </Link>
                        ) : row.recommendedPgId && row.recommendedBedId ? (
                          <Link
                            href={`/admin/beds?pgId=${row.recommendedPgId}&bedId=${row.recommendedBedId}`}
                            className={PRIMARY}
                          >
                            Open bed
                          </Link>
                        ) : row.customerId ? (
                          <Link
                            href={`/admin/residents/${row.customerId}`}
                            className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                          >
                            Open profile
                          </Link>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
