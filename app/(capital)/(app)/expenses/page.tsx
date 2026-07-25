import { redirect } from 'next/navigation';

/** Standalone Expenses module removed — activities live on the vehicle. */
export default function ExpensesRedirectPage() {
  redirect('/assets');
}
