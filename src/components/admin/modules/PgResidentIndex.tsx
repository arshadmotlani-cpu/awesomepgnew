import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { moduleResidentHref } from '@/src/lib/admin/navigation';
import { paiseToInr, titleCase } from '@/src/lib/format';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

type ResidentRow = {
  residentId: string;
  name: string;
  phone: string;
  bedCode: string;
  roomNumber: string | null;
  rentDuePaise: number;
  rentStatus: string | null;
  elecDuePaise: number;
  depositPaise: number;
};

function buildResidentRows(
  rentInvoices: AdminRentInvoiceRow[],
  electricityByCustomer: Map<string, number>,
  depositsByBooking: Map<string, { customerId: string; paise: number }>,
): ResidentRow[] {
  const map = new Map<string, ResidentRow>();

  for (const r of rentInvoices) {
    const existing = map.get(r.customerPhone) ?? {
      residentId: r.customerPhone,
      name: r.customerFullName,
      phone: r.customerPhone,
      bedCode: r.bedCode,
      roomNumber: r.roomNumber,
      rentDuePaise: 0,
      rentStatus: null,
      elecDuePaise: 0,
      depositPaise: 0,
    };
    if (r.status === 'pending' || r.status === 'overdue') {
      existing.rentDuePaise += r.rentPaise;
      existing.rentStatus = r.status;
    }
    map.set(r.customerPhone, existing);
  }

  for (const [phone, amount] of electricityByCustomer) {
    const row = map.get(phone);
    if (row) row.elecDuePaise = amount;
  }

  for (const dep of depositsByBooking.values()) {
    for (const row of map.values()) {
      if (row.phone === dep.customerId) row.depositPaise = dep.paise;
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function PgResidentIndex({
  module,
  pgId,
  billingMonth,
  pgName,
  rentInvoices,
  electricityByPhone,
  depositPaiseByPhone,
}: {
  module: 'revenue' | 'collections' | 'operations';
  pgId: string;
  billingMonth: string;
  pgName: string;
  rentInvoices: AdminRentInvoiceRow[];
  electricityByPhone: Map<string, number>;
  depositPaiseByPhone: Map<string, number>;
}) {
  const rows = buildResidentRows(rentInvoices, electricityByPhone, new Map());

  for (const row of rows) {
    row.depositPaise = depositPaiseByPhone.get(row.phone) ?? 0;
    row.elecDuePaise = electricityByPhone.get(row.phone) ?? row.elecDuePaise;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
        No residents with billing records for {pgName} yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-apg-silver">
        Level 2 — PG summary for {pgName}. Click a resident for payments and actions.
      </p>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Room · bed</TH>
              <TH className="text-right">Rent due</TH>
              <TH className="text-right">Elec due</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.phone} className="hover:bg-white/[0.03]">
                <TD>
                  <Link
                    href={moduleResidentHref(module, pgId, encodeURIComponent(r.phone), billingMonth)}
                    className="font-medium text-white hover:text-[#FF5A1F]"
                  >
                    {r.name}
                  </Link>
                  <p className="font-mono text-[11px] text-zinc-500">{r.phone}</p>
                </TD>
                <TD className="text-xs text-apg-silver">
                  {[r.roomNumber ? `R${r.roomNumber}` : null, r.bedCode].filter(Boolean).join(' · ')}
                </TD>
                <TD className="text-right tabular-nums">
                  {r.rentDuePaise > 0 ? paiseToInr(r.rentDuePaise) : '—'}
                </TD>
                <TD className="text-right tabular-nums">
                  {r.elecDuePaise > 0 ? paiseToInr(r.elecDuePaise) : '—'}
                </TD>
                <TD>
                  {r.rentStatus ? (
                    <Badge tone={toneForStatus(r.rentStatus)}>{titleCase(r.rentStatus)}</Badge>
                  ) : (
                    <Badge tone="emerald">current</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
