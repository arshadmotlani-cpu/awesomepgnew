import { redirect } from 'next/navigation';

/** Standalone Analytics removed — insights live on Dashboard. */
export default function AnalyticsRedirectPage() {
  redirect('/dashboard');
}
