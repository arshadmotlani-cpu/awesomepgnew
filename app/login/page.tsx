import { Suspense } from 'react';
import Link from 'next/link';
import { CustomerLoginForm } from '@/src/components/auth/CustomerLoginForm';

export const metadata = {
  title: 'Sign in · Awesome PG',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 scheme-light">
      <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-12 sm:px-6">
        <Link
          href="/pgs"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to browse PGs
        </Link>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <CustomerLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
