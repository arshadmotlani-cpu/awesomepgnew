import Link from 'next/link';
import { CapitalBrandLogo } from '@/src/capital/components/CapitalBrandLogo';
import { Button } from '@/src/capital/components/ui/button';

export default function CapitalNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="mb-6">
        <CapitalBrandLogo size={64} className="mx-auto" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-ac-text-secondary">
        This page doesn&apos;t exist in Automotive Capital.
      </p>
      <Link href="/dashboard" className="mt-8">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
