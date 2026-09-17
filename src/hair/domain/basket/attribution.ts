import type { AttributionRow, PricedLine } from '@/src/hair/domain/basket/types';
import { allocatePerformancePaise } from '@/src/hair/lib/attributionMath';

function metricForType(type: PricedLine['billableRef']['type']): AttributionRow['revenueMetric'] {
  return type;
}

export function buildAttributionPlan(lines: PricedLine[]): AttributionRow[] {
  const rows: AttributionRow[] = [];
  for (const line of lines) {
    // Package purchase is cash revenue only — never staff performance.
    if (line.billableRef.type === 'package') continue;

    const prepaid = line.prepaidRedemption ?? null;
    if (prepaid && line.staff.length > 0) {
      const performanceBase = prepaid.effectiveUnitValuePaise * line.quantity;
      if (performanceBase <= 0) continue;
      for (const alloc of allocatePerformancePaise(performanceBase, line.staff)) {
        rows.push({
          lineId: line.lineId,
          staffId: alloc.staffId,
          role: 'serviced_by',
          shareBps: alloc.shareBps,
          attributedBasePaise: alloc.attributedPaise,
          revenueMetric: 'service',
        });
      }
      continue;
    }

    if (line.basePaise <= 0 || line.staff.length === 0) continue;
    const metric = metricForType(line.billableRef.type);
    const isMultiSplitLine =
      line.billableRef.type === 'service' || line.billableRef.type === 'product';

    if (line.snapshot.staffMode === 'SERVICE' || (isMultiSplitLine && line.staff.length > 1)) {
      const role = line.snapshot.staffMode === 'SERVICE' ? 'serviced_by' : 'sold_by';
      for (const alloc of allocatePerformancePaise(line.basePaise, line.staff)) {
        rows.push({
          lineId: line.lineId,
          staffId: alloc.staffId,
          role,
          shareBps: alloc.shareBps,
          attributedBasePaise: alloc.attributedPaise,
          revenueMetric: metric,
        });
      }
      continue;
    }

    const seller = line.staff[0];
    if (!seller) continue;
    rows.push({
      lineId: line.lineId,
      staffId: seller.staffId,
      role: 'sold_by',
      shareBps: seller.shareBps,
      attributedBasePaise: line.basePaise,
      revenueMetric: metric,
    });
  }
  return rows;
}
