'use client';

export const FYH_CHART_TOOLTIP = {
  background: 'rgba(16, 24, 39, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 8,
  color: '#F8FAFC',
  fontSize: 12,
};

export const FYH_CHART_COLORS = ['#22D3EE', '#6366F1', '#67E8F9', '#818CF8', '#34D399', '#F87171'];

export function formatChartInr(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
