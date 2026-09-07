/** SSOT routes for the Rent Payment Map admin surface. */
export const RENT_PAYMENT_MAP_HREF = {
  operations: '/admin/operations/rent-payment-map',
  billing: '/admin/billing/rent-payment-map',
} as const;

/** Legacy invoices tab — redirect only, not linked in UI. */
export const LEGACY_RENT_PAYMENT_MAP_HREF = '/admin/invoices/rent-payment-map';
