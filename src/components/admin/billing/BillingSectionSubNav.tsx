'use client';

import { AdminModuleSubNav } from '@/src/components/admin/AdminModuleSubNav';
import { RENT_PAYMENT_MAP_HREF } from '@/src/lib/admin/rentPaymentMapRoutes';

const SECTIONS = [
  {
    id: 'main',
    label: 'Billing Center',
    href: '/admin/billing',
    isActive: (pathname: string) =>
      pathname === '/admin/billing' ||
      (pathname.startsWith('/admin/billing/') &&
        !pathname.startsWith(RENT_PAYMENT_MAP_HREF.billing)),
  },
  {
    id: 'rent-payment-map',
    label: 'Rent Payment Map',
    href: RENT_PAYMENT_MAP_HREF.billing,
    isActive: (pathname: string) => pathname.startsWith(RENT_PAYMENT_MAP_HREF.billing),
  },
];

export function BillingSectionSubNav() {
  return <AdminModuleSubNav sections={SECTIONS} ariaLabel="Billing Center sections" />;
}
