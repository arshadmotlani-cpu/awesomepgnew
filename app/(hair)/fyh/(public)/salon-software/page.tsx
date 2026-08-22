import type { Metadata } from 'next';
import { SalonSoftwareLanding } from '@/src/hair/components/marketing/SalonSoftwareLanding';

export const metadata: Metadata = {
  title: 'Salon software waitlist',
  description:
    'For Your Hair ERP — Quick Sale POS, appointments, GST invoices, staff. Self-serve SaaS waitlist (no account created).',
  robots: { index: true, follow: true },
};

export default function SalonSoftwarePage() {
  return <SalonSoftwareLanding />;
}
