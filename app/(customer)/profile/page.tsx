import { redirect } from 'next/navigation';

/** Alias — canonical account hub is /account/profile */
export default function ProfileAliasPage() {
  redirect('/account/profile');
}
