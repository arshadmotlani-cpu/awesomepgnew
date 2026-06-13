import { redirect } from 'next/navigation';

export default function LegacyRentRedirect() {
  redirect('/admin/collections?tab=rent');
}
