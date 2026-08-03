import type { FyhAttributionRole, FyhRevenueMetric } from '@/src/hair/db/schema';
import type { FyhInvoiceLineKind } from '@/src/hair/db/schema/billing';

export type StaffAttributionInput = {
  staffId: string;
  shareBps?: number;
};

export type LineAttributionInput = {
  kind: FyhInvoiceLineKind;
  lineNetPaise: number;
  servicedBy?: StaffAttributionInput[];
  soldByStaffId?: string | null;
  legacyStaffId?: string | null;
};

export function revenueMetricForKind(kind: FyhInvoiceLineKind): FyhRevenueMetric | null {
  if (kind === 'service') return 'service';
  if (kind === 'product') return 'product';
  if (kind === 'package') return 'package';
  if (kind === 'membership') return 'membership';
  return null;
}

export function normalizeEqualShares(staffIds: string[]): StaffAttributionInput[] {
  if (!staffIds.length) return [];
  const shareBps = Math.floor(10_000 / staffIds.length);
  const remainder = 10_000 - shareBps * staffIds.length;
  return staffIds.map((staffId, i) => ({
    staffId,
    shareBps: shareBps + (i === 0 ? remainder : 0),
  }));
}

export function attributedNetForShare(
  lineNetPaise: number,
  shareBps: number,
  totalBps = 10_000,
): number {
  const denom = totalBps > 0 ? totalBps : 10_000;
  return Math.round((lineNetPaise * shareBps) / denom);
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
    let serviced: StaffAttributionInput[] = [];
    if (input.servicedBy && input.servicedBy.length > 0) {
      const hasCustomShares = input.servicedBy.some((s) => s.shareBps != null);
      serviced = hasCustomShares
        ? input.servicedBy.map((s) => ({
            staffId: s.staffId,
            shareBps: s.shareBps ?? Math.floor(10_000 / input.servicedBy!.length),
          }))
        : normalizeEqualShares(input.servicedBy.map((s) => s.staffId));
    } else if (input.legacyStaffId) {
      serviced = [{ staffId: input.legacyStaffId, shareBps: 10_000 }];
    }
    if (!serviced.length) return [];
    const totalBps = serviced.reduce((s, x) => s + (x.shareBps ?? 0), 0) || 10_000;
    for (const s of serviced) {
      const shareBps = s.shareBps ?? Math.floor(10_000 / serviced.length);
      const share = totalBps > 0 ? shareBps / totalBps : 1 / serviced.length;
      rows.push({
        staffId: s.staffId,
        role: 'serviced_by',
        shareBps,
        attributedNetPaise: Math.round(input.lineNetPaise * share),
        revenueMetric: 'service',
      });
    }
    return rows;
  }

  if (input.kind === 'product') {
    const sellers: StaffAttributionInput[] =
      input.servicedBy && input.servicedBy.length > 1
        ? input.servicedBy.some((s) => s.shareBps != null)
          ? input.servicedBy.map((s) => ({
              staffId: s.staffId,
              shareBps: s.shareBps ?? Math.floor(10_000 / input.servicedBy!.length),
            }))
          : normalizeEqualShares(input.servicedBy.map((s) => s.staffId))
        : input.soldByStaffId ?? input.legacyStaffId
          ? [{ staffId: (input.soldByStaffId ?? input.legacyStaffId)!, shareBps: 10_000 }]
          : [];
    if (!sellers.length) return [];
    if (sellers.length === 1) {
      rows.push({
        staffId: sellers[0]!.staffId,
        role: 'sold_by',
        shareBps: 10_000,
        attributedNetPaise: input.lineNetPaise,
        revenueMetric: 'product',
      });
      return rows;
    }
    const totalBps = sellers.reduce((s, x) => s + (x.shareBps ?? 0), 0) || 10_000;
    for (const s of sellers) {
      const shareBps = s.shareBps ?? Math.floor(10_000 / sellers.length);
      rows.push({
        staffId: s.staffId,
        role: 'sold_by',
        shareBps,
        attributedNetPaise: attributedNetForShare(input.lineNetPaise, shareBps, totalBps),
        revenueMetric: 'product',
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
