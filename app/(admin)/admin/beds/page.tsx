import { redirect } from 'next/navigation';

export default function LegacyBedsRedirect() {
  redirect('/admin/pgs');
}
