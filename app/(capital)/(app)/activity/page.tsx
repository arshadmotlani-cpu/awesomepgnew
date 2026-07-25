import { redirect } from 'next/navigation';

/** Activity feed lives on Dashboard. */
export default function ActivityRedirectPage() {
  redirect('/dashboard');
}
