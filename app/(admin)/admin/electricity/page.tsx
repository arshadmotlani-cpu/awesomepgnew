import { redirect } from 'next/navigation';

export default function LegacyElectricityRedirect() {
  redirect('/admin/billing?tab=electricity');
}
