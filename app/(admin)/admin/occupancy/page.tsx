import { redirect } from 'next/navigation';

export default function LegacyOccupancyRedirect() {
  redirect('/admin');
}
