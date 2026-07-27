import Link from 'next/link';
import { Button } from '@/src/hair/components/ui/button';

export default function HairNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="fyh-glass max-w-md p-8 text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-fyh-accent">404</p>
        <h1 className="fyh-display mt-2 text-3xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-fyh-text-secondary">
          This path is not part of For Your Hair ERP.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
