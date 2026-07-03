export const EXPRESS_SALE_RETURN_PATH = '/admin/express-booking';

export function expressSaleInvoiceHref(invoiceId: string): string {
  return `/admin/invoices/${invoiceId}?from=express-sale`;
}
