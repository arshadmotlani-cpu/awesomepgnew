/**
 * Staff performance accounting SSOT (FYH).
 *
 * Sales = attributed product retail only.
 * Performance = attributed service delivery only (includes package/membership redemptions
 * because those attributions are stored with revenue_metric = 'service').
 */

import type { FyhRevenueMetric } from '@/src/hair/db/schema';

export type StaffMetricParts = {
  servicePaise: number;
  productPaise: number;
  packagePaise: number;
  membershipPaise: number;
};

export type StaffPerformanceSummaryLike = {
  serviceRevenuePaise: number;
  productRevenuePaise: number;
  packageRevenuePaise: number;
  membershipRevenuePaise: number;
};

/** Product sales attributed to staff (retail). */
export function staffProductSalesPaise(parts: StaffMetricParts): number {
  return parts.productPaise;
}

export function staffProductSalesFromSummary(summary: StaffPerformanceSummaryLike): number {
  return summary.productRevenuePaise;
}

/** Service performance attributed to staff (performed services, incl. prepaid redemptions). */
export function staffServicePerformancePaise(parts: StaffMetricParts): number {
  return parts.servicePaise;
}

export function staffServicePerformanceFromSummary(summary: StaffPerformanceSummaryLike): number {
  return summary.serviceRevenuePaise;
}

/** Package/membership purchase attribution (collection at sale) — not sales or service performance. */
export function staffPrepaidPurchasePaise(parts: StaffMetricParts): number {
  return parts.packagePaise + parts.membershipPaise;
}

/** All attributed net (for explicit "combined" reporting only). */
export function staffCombinedAttributedPaise(parts: StaffMetricParts): number {
  return parts.servicePaise + parts.productPaise + parts.packagePaise + parts.membershipPaise;
}

export function staffCombinedFromSummary(summary: StaffPerformanceSummaryLike): number {
  return (
    summary.serviceRevenuePaise +
    summary.productRevenuePaise +
    summary.packageRevenuePaise +
    summary.membershipRevenuePaise
  );
}

export function metricAmountFromParts(
  parts: StaffMetricParts,
  category: 'service' | 'product' | 'package' | 'membership' | 'combined',
): number {
  switch (category) {
    case 'service':
      return parts.servicePaise;
    case 'product':
      return parts.productPaise;
    case 'package':
      return parts.packagePaise;
    case 'membership':
      return parts.membershipPaise;
    case 'combined':
      return staffCombinedAttributedPaise(parts);
    default:
      return staffCombinedAttributedPaise(parts);
  }
}

export function isPerformanceRevenueMetric(metric: FyhRevenueMetric): boolean {
  return metric === 'service';
}

export function isProductSalesRevenueMetric(metric: FyhRevenueMetric): boolean {
  return metric === 'product';
}
