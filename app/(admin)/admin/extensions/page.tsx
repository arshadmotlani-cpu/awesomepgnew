import { redirect } from 'next/navigation';

export default function LegacyExtensionsRedirect() {
  redirect('/admin/bookings');
}
