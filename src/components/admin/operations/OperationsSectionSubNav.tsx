'use client';

import { AdminModuleSubNav } from '@/src/components/admin/AdminModuleSubNav';
import { RENT_PAYMENT_MAP_HREF } from '@/src/lib/admin/rentPaymentMapRoutes';

const SECTIONS = [
  {
    id: 'queue',
    label: 'Operations',
    href: '/admin/operations?filter=waiting_for_approval',
    isActive: (pathname: string) =>
      pathname === '/admin/operations' ||
      (pathname.startsWith('/admin/operations/') &&
        !pathname.startsWith(RENT_PAYMENT_MAP_HREF.operations)),
  },
  {
    id: 'rent-payment-map',
    label: 'Rent Payment Map',
    href: RENT_PAYMENT_MAP_HREF.operations,
    isActive: (pathname: string) => pathname.startsWith(RENT_PAYMENT_MAP_HREF.operations),
  },
];

export function OperationsSectionSubNav() {
  return <AdminModuleSubNav sections={SECTIONS} ariaLabel="Operations sections" />;
}
