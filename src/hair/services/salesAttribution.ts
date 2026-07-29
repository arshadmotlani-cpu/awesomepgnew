import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhInvoiceLineAttributions,
  type FyhAttributionRole,
  type FyhRevenueMetric,
} from '@/src/hair/db/schema';
import type { FyhInvoiceLineKind } from '@/src/hair/db/schema/billing';

export type StaffAttributionInput = {
  staffId: string;
  shareBps?: number;
};

export type LineAttributionInput = {
  kind: FyhInvoiceLineKind;
  lineNetPaise: number;
  /** Service lines: who performed the service */
  servicedBy?: StaffAttributionInput[];
  /** Product / package / membership: who sold */
  soldByStaffId?: string | null;
  /** Legacy single staff on line (appointment fallback) */
  legacyStaffId?: string | null;
};

export function revenueMetricForKind(kind: FyhInvoiceLineKind): FyhRevenueMetric | null {
  if (kind === 'service') return 'service';
  if (kind === 'product') return 'product';
  if (kind === 'package') return 'package';
  if (kind === 'membership') return 'membership';
  return null;
}

/** Equal split when shareBps omitted. */
export function normalizeEqualShares(staffIds: string[]): StaffAttributionInput[] {
  if (!staffIds.length) return [];
  const shareBps = Math.floor(10_000 / staffIds.length);
  const remainder = 10_000 - shareBps * staffIds.length;
  return staffIds.map((staffId, i) => ({
    staffId,
    shareBps: shareBps + (i === 0 ? remainder : 0),
  }));
}

export function lineNetPaiseFromParts(
  unitPricePaise: number,
  quantity: number,
  lineDiscountPaise: number,
): number {
  return Math.max(0, unitPricePaise * quantity - lineDiscountPaise);
}

export function discountBpsFromPaise(grossPaise: number, discountPaise: number): number {
  if (grossPaise <= 0) return 0;
  return Math.min(10_000, Math.round((discountPaise * 10_000) / grossPaise));
}

export function discountPaiseFromBps(grossPaise: number, discountBps: number): number {
  return Math.min(grossPaise, Math.round((grossPaise * Math.max(0, discountBps)) / 10_000));
}

export function buildAttributionRows(input: LineAttributionInput): Array<{
  staffId: string;
  role: FyhAttributionRole;
  shareBps: number;
  attributedNetPaise: number;
  revenueMetric: FyhRevenueMetric;
}> {
  const metric = revenueMetricForKind(input.kind);
  if (!metric || input.lineNetPaise <= 0) return [];

  const rows: Array<{
    staffId: string;
    role: FyhAttributionRole;
    shareBps: number;
    attributedNetPaise: number;
    revenueMetric: FyhRevenueMetric;
  }> = [];

  if (input.kind === 'service') {
    const serviced =
      input.servicedBy && input.servicedBy.length > 0
        ? input.servicedBy.map((s) => ({
            staffId: s.staffId,
            shareBps: s.shareBps ?? Math.floor(10_000 / input.servicedBy!.length),
          }))
        : input.legacyStaffId
          ? [{ staffId: input.legacyStaffId, shareBps: 10_000 }]
          : [];
    if (!serviced.length) return [];
    const totalBps = serviced.reduce((s, x) => s + x.shareBps, 0) || 10_000;
    for (const s of serviced) {
      const share = totalBps > 0 ? s.shareBps / totalBps : 1 / serviced.length;
      rows.push({
        staffId: s.staffId,
        role: 'serviced_by',
        shareBps: s.shareBps,
        attributedNetPaise: Math.round(input.lineNetPaise * share),
        revenueMetric: 'service',
      });
    }
    return rows;
  }

  const seller = input.soldByStaffId ?? input.legacyStaffId;
  if (!seller) return [];
  rows.push({
    staffId: seller,
    role: 'sold_by',
    shareBps: 10_000,
    attributedNetPaise: input.lineNetPaise,
    revenueMetric: metric,
  });
  return rows;
}

export async function persistLineAttributions(
  db: typeof hairDb,
  invoiceLineId: string,
  input: LineAttributionInput,
) {
  await db
    .delete(fyhInvoiceLineAttributions)
    .where(eq(fyhInvoiceLineAttributions.invoiceLineId, invoiceLineId));

  const drafts = buildAttributionRows(input);
  if (!drafts.length) return;

  await db.insert(fyhInvoiceLineAttributions).values(
    drafts.map((d) => ({
      invoiceLineId,
      staffId: d.staffId,
      role: d.role,
      shareBps: d.shareBps,
      attributedNetPaise: d.attributedNetPaise,
      revenueMetric: d.revenueMetric,
    })),
  );
}

export async function syncInvoiceLineAttributions(
  db: typeof hairDb,
  lines: Array<{
    id: string;
    kind: FyhInvoiceLineKind;
    unitPricePaise: number;
    quantity: number;
    discountPaise: number;
    staffId: string | null;
    servicedBy?: StaffAttributionInput[];
    soldByStaffId?: string | null;
  }>,
) {
  for (const line of lines) {
    const lineNetPaise = lineNetPaiseFromParts(
      line.unitPricePaise,
      line.quantity,
      line.discountPaise,
    );
    await persistLineAttributions(db, line.id, {
      kind: line.kind,
      lineNetPaise,
      servicedBy: line.servicedBy,
      soldByStaffId: line.soldByStaffId,
      legacyStaffId: line.staffId,
    });
  }
}
