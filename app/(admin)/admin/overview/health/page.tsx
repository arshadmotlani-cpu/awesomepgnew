import { redirect } from 'next/navigation';

export default function LegacyOverviewHealthRedirect() {
  redirect('/admin/system');
}
