/**
 * Shabana Makeup Studio & Academy — used ONLY on public/print/download invoices.
 * Do not import this module from ERP shell, dashboard, login, or other app screens.
 */
export const INVOICE_BRAND_LOGO = {
  src: '/fyh/invoice-brand-logo.png',
  width: 324,
  height: 192,
  alt: 'Shabana Makeup Studio and Academy',
} as const;

/** Fixed business block for customer-facing invoices (not ERP settings). */
export const INVOICE_BUSINESS = {
  name: 'For Your Hair',
  addressLines: [
    'Shop No. 16 & 17,',
    'Kamptee Road,',
    'Kadbi Chowk,',
    'Mangalam Shri Krupa Complex,',
    'Nagpur,',
    'Maharashtra 440004',
  ],
  phone: '9823444886',
} as const;
