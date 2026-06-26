import { redirect } from 'next/navigation';

export default function LegacyRentRedirect() {
  redirect('/admin/billing?tab=rent');
}
