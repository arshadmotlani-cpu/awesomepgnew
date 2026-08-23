import type { Metadata } from 'next';
import { SalonSoftwareLanding } from '@/src/hair/components/marketing/SalonSoftwareLanding';

export const metadata: Metadata = {
  title: 'Salon software — every walk-in, billed in seconds',
  description:
    'Point-of-sale, appointments, and GST billing for walk-in salons. Running every day at For Your Hair. Get early access.',
  robots: { index: true, follow: true },
};

export default function SalonSoftwarePage() {
  return <SalonSoftwareLanding />;
}
