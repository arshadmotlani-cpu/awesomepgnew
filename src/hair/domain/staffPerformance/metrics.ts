/**
 * Staff performance accounting SSOT (FYH).
 *
 * Product sales = attributed physical/retail product lines only (`revenue_metric = product`).
 * Service performance = every service-family attribution:
 *   performed services and prepaid redemptions (`service`),
 *   membership purchases (`membership`),
 *   package purchases (`package`).
 * Those three metrics are separate rows, so summing them does not double-count.
 * Gift cards are not a revenue metric and are not product sales.
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

/** Physical product sales attributed to staff. Services, memberships, and packages are excluded. */
export function staffProductSalesPaise(parts: StaffMetricParts): number {
  return parts.productPaise;
}

export function staffProductSalesFromSummary(summary: StaffPerformanceSummaryLike): number {
  return summary.productRevenuePaise;
}

/** Service-family performance: performed services + membership + package attributions. */
export function staffServicePerformancePaise(parts: StaffMetricParts): number {
  return parts.servicePaise + parts.membershipPaise + parts.packagePaise;
}

export function staffServicePerformanceFromSummary(summary: StaffPerformanceSummaryLike): number {
  return (
    summary.serviceRevenuePaise +
    summary.membershipRevenuePaise +
    summary.packageRevenuePaise
  );
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
  return metric === 'service' || metric === 'package' || metric === 'membership';
}

export function isProductSalesRevenueMetric(metric: FyhRevenueMetric): boolean {
  return metric === 'product';
}
