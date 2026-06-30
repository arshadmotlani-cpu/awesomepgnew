import { redirect } from 'next/navigation';

export default function LegacyElectricityRedirect() {
  redirect('/admin/electricity/dashboard');
}
