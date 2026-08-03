'use client';

export const FYH_CHART_TOOLTIP = {
  background: 'rgba(22, 22, 26, 0.96)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#F5F5F0',
  fontSize: 12,
};

export const FYH_CHART_COLORS = ['#10B981', '#C9A227', '#60A5FA', '#A78BFA', '#F87171', '#34D399'];

export function formatChartInr(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
