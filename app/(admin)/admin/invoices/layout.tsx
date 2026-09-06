import type { ReactNode } from 'react';
import { InvoicesSubNav } from '@/src/components/admin/invoices/InvoicesSubNav';

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <InvoicesSubNav />
      {children}
    </>
  );
}
