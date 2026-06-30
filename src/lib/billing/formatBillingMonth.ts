/** Format YYYY-MM-DD billing month for display (client-safe). */
export function formatBillingMonthLabel(billingMonth: string): string {
  const date = new Date(`${billingMonth}T12:00:00`);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
