export function residentProfileHref(customerId: string): string {
  return `/admin/residents/${customerId}`;
}

export function residentBillingInvoiceHref(invoiceId: string, customerId: string): string {
  return `/admin/invoices/${invoiceId}?from=resident-billing&customerId=${encodeURIComponent(customerId)}`;
}
