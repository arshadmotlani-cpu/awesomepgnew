import { redirect } from 'next/navigation';

export default function LegacyRoomsRedirect() {
  redirect('/admin/pgs');
}
