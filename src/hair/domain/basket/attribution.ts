import type { AttributionRow, PricedLine } from '@/src/hair/domain/basket/types';
import { attributedNetForShare } from '@/src/hair/lib/attributionMath';

function metricForType(type: PricedLine['billableRef']['type']): AttributionRow['revenueMetric'] {
  return type;
}

export function buildAttributionPlan(lines: PricedLine[]): AttributionRow[] {
  const rows: AttributionRow[] = [];
  for (const line of lines) {
    if (line.basePaise <= 0 || line.staff.length === 0) continue;
    const metric = metricForType(line.billableRef.type);
    const isMultiSplitLine =
      line.billableRef.type === 'service' || line.billableRef.type === 'product';

    if (line.snapshot.staffMode === 'SERVICE' || (isMultiSplitLine && line.staff.length > 1)) {
      for (const s of line.staff) {
        rows.push({
          lineId: line.lineId,
          staffId: s.staffId,
          role: line.snapshot.staffMode === 'SERVICE' ? 'serviced_by' : 'sold_by',
          shareBps: s.shareBps,
          attributedBasePaise: attributedNetForShare(line.basePaise, s.shareBps),
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
