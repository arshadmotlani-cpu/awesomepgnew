import { redirect } from 'next/navigation';

export default function LegacyFloorsRedirect() {
  redirect('/admin/pgs');
}
