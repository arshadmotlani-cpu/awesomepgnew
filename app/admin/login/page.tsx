import { Suspense } from 'react';
import { AdminLoginForm } from '@/src/components/auth/AdminLoginForm';

export const metadata = {
  title: 'Admin sign in · Awesome PG',
};

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-900 scheme-light">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
